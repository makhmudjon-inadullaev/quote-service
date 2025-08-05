import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { structuredLogger } from '../config/logger';
import { redisClient } from '../config/redis';

export interface PerformanceMetrics {
  requestId: string;
  method: string;
  url: string;
  statusCode: number;
  responseTime: number;
  timestamp: string;
  userAgent?: string;
  ip: string;
  contentLength?: number;
  memoryUsage: NodeJS.MemoryUsage;
}

export interface AggregatedMetrics {
  totalRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  errorRate: number;
  requestsPerSecond: number;
  memoryUsage: NodeJS.MemoryUsage;
  uptime: number;
}

/**
 * Performance monitoring class
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private readonly maxMetricsHistory = 1000;

  /**
   * Record a request metric
   */
  recordRequest(metric: PerformanceMetrics): void {
    this.metrics.push(metric);

    // Keep only the last N metrics to prevent memory leaks
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }

    // Log performance warnings for slow requests
    if (metric.responseTime > 2000) {
      structuredLogger.performance('Slow request detected', {
        requestId: metric.requestId,
        method: metric.method,
        url: metric.url,
        responseTime: metric.responseTime,
        statusCode: metric.statusCode,
      });
    }

    // Log error requests
    if (metric.statusCode >= 400) {
      structuredLogger.performance('Error request recorded', {
        requestId: metric.requestId,
        method: metric.method,
        url: metric.url,
        statusCode: metric.statusCode,
        responseTime: metric.responseTime,
      });
    }
  }

  /**
   * Get aggregated metrics for the last N minutes
   */
  getAggregatedMetrics(windowMinutes: number = 5): AggregatedMetrics {
    const windowMs = windowMinutes * 60 * 1000;
    const cutoffTime = Date.now() - windowMs;
    
    const recentMetrics = this.metrics.filter(
      metric => new Date(metric.timestamp).getTime() > cutoffTime
    );

    if (recentMetrics.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        errorRate: 0,
        requestsPerSecond: 0,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
      };
    }

    const responseTimes = recentMetrics.map(m => m.responseTime);
    const errorCount = recentMetrics.filter(m => m.statusCode >= 400).length;
    const totalTime = windowMs / 1000; // Convert to seconds

    return {
      totalRequests: recentMetrics.length,
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      errorRate: (errorCount / recentMetrics.length) * 100,
      requestsPerSecond: recentMetrics.length / totalTime,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
    };
  }

  /**
   * Get metrics for a specific endpoint
   */
  getEndpointMetrics(endpoint: string, windowMinutes: number = 5): Partial<AggregatedMetrics> {
    const windowMs = windowMinutes * 60 * 1000;
    const cutoffTime = Date.now() - windowMs;
    
    const endpointMetrics = this.metrics.filter(
      metric => metric.url.includes(endpoint) && 
                new Date(metric.timestamp).getTime() > cutoffTime
    );

    if (endpointMetrics.length === 0) {
      return { totalRequests: 0 };
    }

    const responseTimes = endpointMetrics.map(m => m.responseTime);
    const errorCount = endpointMetrics.filter(m => m.statusCode >= 400).length;

    return {
      totalRequests: endpointMetrics.length,
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      errorRate: (errorCount / endpointMetrics.length) * 100,
    };
  }

  /**
   * Store metrics in Redis for persistence across restarts
   */
  async persistMetrics(): Promise<void> {
    try {
      await redisClient.connect();
      const metricsKey = `performance:metrics:${Date.now()}`;
      const aggregated = this.getAggregatedMetrics(60); // Last hour
      
      await redisClient.set(
        metricsKey,
        JSON.stringify(aggregated),
        3600 // 1 hour TTL
      );
    } catch (error) {
      structuredLogger.error('Failed to persist metrics to Redis', { error });
    }
  }

  /**
   * Clear old metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Get current metrics count
   */
  getMetricsCount(): number {
    return this.metrics.length;
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Performance monitoring middleware
 */
export async function performanceMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
) {
  const startTime = Date.now();

  // Add performance timing to request
  (request as any).startTime = startTime;

  // Store start time in request context for later use
  (request as any).performanceStartTime = startTime;
}

/**
 * Fastify plugin for performance monitoring
 */
export async function performancePlugin(fastify: FastifyInstance) {
  // Simple approach: just add headers in preHandler
  fastify.addHook('preHandler', async (request, reply) => {
    const requestId = (request as any).requestId || request.id || 'unknown';
    const startTime = Date.now();
    
    // Store start time for response time calculation
    (request as any).performanceStartTime = startTime;
    
    // Set request ID header immediately
    reply.header('X-Request-ID', requestId);
  });

  // Add onSend hook to set response time header
  fastify.addHook('onSend', async (request, reply, payload) => {
    const startTime = (request as any).performanceStartTime;
    const endTime = Date.now();
    const responseTime = startTime ? endTime - startTime : 0;

    // Set response time header
    reply.header('X-Response-Time', `${responseTime}ms`);

    // Record metrics if we have a start time
    if (startTime) {
      const requestId = (request as any).requestId || request.id || 'unknown';
      const metric: PerformanceMetrics = {
        requestId,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime,
        timestamp: new Date(endTime).toISOString(),
        userAgent: request.headers['user-agent'],
        ip: request.ip,
        contentLength: typeof payload === 'string' ? payload.length : 
                      Buffer.isBuffer(payload) ? payload.length : undefined,
        memoryUsage: process.memoryUsage(),
      };

      performanceMonitor.recordRequest(metric);
    }

    return payload;
  });

  // Periodically persist metrics to Redis (disabled in tests)
  if (process.env.NODE_ENV !== 'test') {
    const metricsInterval = setInterval(async () => {
      await performanceMonitor.persistMetrics();
    }, 60000); // Every minute

    // Clean up interval on close
    fastify.addHook('onClose', async () => {
      clearInterval(metricsInterval);
    });
  }

  // Add performance data to request context
  fastify.decorateRequest('performanceData', null);
}

/**
 * Get performance summary for logging
 */
export function getPerformanceSummary(): string {
  const metrics = performanceMonitor.getAggregatedMetrics(5);
  return `Requests: ${metrics.totalRequests}, ` +
         `Avg Response: ${metrics.averageResponseTime.toFixed(2)}ms, ` +
         `Error Rate: ${metrics.errorRate.toFixed(2)}%, ` +
         `RPS: ${metrics.requestsPerSecond.toFixed(2)}, ` +
         `Memory: ${(metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`;
}