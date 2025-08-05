import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger';
import { config } from '../config/env';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  requestId: string;
  userId?: string;
  sessionId?: string;
  userAgent?: string;
  ip: string;
  method: string;
  url: string;
  startTime: number;
  tags: Record<string, string>;
}

/**
 * Request tracing class for distributed tracing
 */
export class RequestTracer {
  private activeTraces = new Map<string, TraceContext>();

  /**
   * Create a new trace context
   */
  createTrace(request: FastifyRequest): TraceContext {
    const traceId = this.extractTraceId(request) || uuidv4();
    const spanId = uuidv4();
    const requestId = this.extractRequestId(request) || uuidv4();
    
    const context: TraceContext = {
      traceId,
      spanId,
      parentSpanId: this.extractParentSpanId(request),
      requestId,
      userId: this.extractUserId(request),
      sessionId: this.extractSessionId(request),
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      method: request.method,
      url: request.url,
      startTime: Date.now(),
      tags: {},
    };

    this.activeTraces.set(requestId, context);
    return context;
  }

  /**
   * Get trace context by request ID
   */
  getTrace(requestId: string): TraceContext | undefined {
    return this.activeTraces.get(requestId);
  }

  /**
   * Add tags to a trace
   */
  addTags(requestId: string, tags: Record<string, string>): void {
    const trace = this.activeTraces.get(requestId);
    if (trace) {
      Object.assign(trace.tags, tags);
    }
  }

  /**
   * Complete a trace
   */
  completeTrace(requestId: string, statusCode: number, error?: Error): void {
    const trace = this.activeTraces.get(requestId);
    if (!trace) return;

    const duration = Date.now() - trace.startTime;

    // Log trace completion
    logger.info('Request trace completed', {
      traceId: trace.traceId,
      spanId: trace.spanId,
      parentSpanId: trace.parentSpanId,
      requestId: trace.requestId,
      method: trace.method,
      url: trace.url,
      statusCode,
      duration,
      userId: trace.userId,
      sessionId: trace.sessionId,
      userAgent: trace.userAgent,
      ip: trace.ip,
      tags: trace.tags,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    });

    // Clean up completed trace
    this.activeTraces.delete(requestId);
  }

  /**
   * Extract trace ID from request headers
   */
  private extractTraceId(request: FastifyRequest): string | undefined {
    return request.headers['x-trace-id'] as string ||
           request.headers['traceparent'] as string ||
           request.headers['x-b3-traceid'] as string;
  }

  /**
   * Extract request ID from request headers
   */
  private extractRequestId(request: FastifyRequest): string | undefined {
    return request.headers[config.REQUEST_ID_HEADER.toLowerCase()] as string ||
           request.headers['x-request-id'] as string;
  }

  /**
   * Extract parent span ID from request headers
   */
  private extractParentSpanId(request: FastifyRequest): string | undefined {
    return request.headers['x-parent-span-id'] as string ||
           request.headers['x-b3-parentspanid'] as string;
  }

  /**
   * Extract user ID from request (could be from JWT, session, etc.)
   */
  private extractUserId(request: FastifyRequest): string | undefined {
    // This would typically extract from JWT token or session
    return request.headers['x-user-id'] as string;
  }

  /**
   * Extract session ID from request
   */
  private extractSessionId(request: FastifyRequest): string | undefined {
    return request.headers['x-session-id'] as string;
  }

  /**
   * Get active traces count
   */
  getActiveTracesCount(): number {
    return this.activeTraces.size;
  }

  /**
   * Clean up old traces (prevent memory leaks)
   */
  cleanupOldTraces(maxAgeMs: number = 300000): void { // 5 minutes default
    const cutoffTime = Date.now() - maxAgeMs;
    
    for (const [requestId, trace] of this.activeTraces.entries()) {
      if (trace.startTime < cutoffTime) {
        logger.warn('Cleaning up old trace', {
          requestId,
          traceId: trace.traceId,
          age: Date.now() - trace.startTime,
        });
        this.activeTraces.delete(requestId);
      }
    }
  }
}

// Global tracer instance
export const requestTracer = new RequestTracer();

/**
 * Tracing middleware for Fastify
 */
export async function tracingMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const trace = requestTracer.createTrace(request);

  // Add trace context to request
  (request as any).trace = trace;

  // Add trace headers to response
  reply.header('X-Trace-ID', trace.traceId);
  reply.header('X-Span-ID', trace.spanId);
  reply.header(config.REQUEST_ID_HEADER, trace.requestId);

  // Log request start
  logger.info('Request started', {
    traceId: trace.traceId,
    spanId: trace.spanId,
    requestId: trace.requestId,
    method: trace.method,
    url: trace.url,
    userAgent: trace.userAgent,
    ip: trace.ip,
    userId: trace.userId,
    sessionId: trace.sessionId,
  });
}

/**
 * Fastify plugin for request tracing
 */
export async function tracingPlugin(fastify: FastifyInstance) {
  // Add tracing to all requests
  fastify.addHook('onRequest', tracingMiddleware);

  // Complete trace on response
  fastify.addHook('onResponse', async (request, reply) => {
    const trace = (request as any).trace as TraceContext;
    if (trace) {
      requestTracer.completeTrace(trace.requestId, reply.statusCode);
    }
  });

  // Complete trace on error
  fastify.addHook('onError', async (request, _reply, error) => {
    const trace = (request as any).trace as TraceContext;
    if (trace) {
      requestTracer.completeTrace(trace.requestId, 500, error);
    }
  });

  // Periodic cleanup of old traces
  const cleanupInterval = setInterval(() => {
    requestTracer.cleanupOldTraces();
  }, 60000); // Every minute

  // Clean up interval on close
  fastify.addHook('onClose', async () => {
    clearInterval(cleanupInterval);
  });

  // Decorate request with trace utilities
  fastify.decorateRequest('trace', null);
  fastify.decorateRequest('addTraceTags', function(tags: Record<string, string>) {
    const trace = (this as any).trace as TraceContext;
    if (trace) {
      requestTracer.addTags(trace.requestId, tags);
    }
  });
}

/**
 * Create a child span for internal operations
 */
export function createChildSpan(
  parentTrace: TraceContext,
  operation: string,
  tags?: Record<string, string>
): { spanId: string; log: (message: string, data?: any) => void; finish: () => void } {
  const spanId = uuidv4();
  const startTime = Date.now();

  const log = (message: string, data?: any) => {
    logger.info(message, {
      traceId: parentTrace.traceId,
      spanId,
      parentSpanId: parentTrace.spanId,
      operation,
      ...data,
    });
  };

  const finish = () => {
    const duration = Date.now() - startTime;
    logger.info('Child span completed', {
      traceId: parentTrace.traceId,
      spanId,
      parentSpanId: parentTrace.spanId,
      operation,
      duration,
      tags,
    });
  };

  return { spanId, log, finish };
}