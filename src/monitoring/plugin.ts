import { FastifyInstance } from 'fastify';
import { tracingPlugin } from '../middleware/tracing';
import { metricsCollector, AppMetrics } from './metrics';
import { structuredLogger } from '../config/logger';
import { config } from '../config/env';

/**
 * Comprehensive monitoring plugin that integrates all monitoring components
 */
export async function monitoringPlugin(fastify: FastifyInstance) {
  if (!config.METRICS_ENABLED) {
    structuredLogger.info('Metrics collection disabled');
    return;
  }

  // Register tracing plugin
  await fastify.register(tracingPlugin);

  // Add monitoring hooks
  fastify.addHook('onRequest', async (request) => {
    const trace = (request as any).trace;
    
    // Record request start metrics
    AppMetrics.incrementRequestCount(
      request.method,
      request.routerPath || request.url,
      0 // Will be updated in onResponse
    );

    // Start request timer
    (request as any).requestTimer = metricsCollector.startTimer(
      'http_request_duration_ms',
      {
        method: request.method,
        endpoint: request.routerPath || request.url,
      }
    );

    structuredLogger.request('Request started', {
      trace,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const trace = (request as any).trace;
    const requestTimer = (request as any).requestTimer;
    
    // Stop request timer
    if (requestTimer) {
      requestTimer();
    }

    // Update request count with actual status code
    AppMetrics.incrementRequestCount(
      request.method,
      request.routerPath || request.url,
      reply.statusCode
    );

    // Record response metrics
    const responseTime = reply.getResponseTime();
    AppMetrics.recordRequestDuration(
      request.method,
      request.routerPath || request.url,
      responseTime
    );

    structuredLogger.request('Request completed', {
      trace,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime,
      contentLength: reply.getHeader('content-length'),
    });
  });

  fastify.addHook('onError', async (request, _reply, error) => {
    const trace = (request as any).trace;
    
    // Record error metrics
    metricsCollector.incrementCounter('http_errors_total', 1, {
      method: request.method,
      endpoint: request.routerPath || request.url,
      errorType: error.constructor.name,
    });

    structuredLogger.error('Request error', {
      trace,
      method: request.method,
      url: request.url,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
        statusCode: (error as any).statusCode,
      },
    });
  });

  // System metrics collection
  const systemMetricsInterval = setInterval(() => {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    AppMetrics.setMemoryUsage(memUsage.heapUsed, memUsage.heapTotal, memUsage.rss);
    AppMetrics.setUptime(uptime);

    // Log system metrics periodically
    structuredLogger.metrics('System metrics collected', {
      memoryUsage: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
        rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
        external: Math.round(memUsage.external / 1024 / 1024 * 100) / 100,
      },
      uptime,
      activeHandles: (process as any)._getActiveHandles?.()?.length || 0,
      activeRequests: (process as any)._getActiveRequests?.()?.length || 0,
    });
  }, 30000); // Every 30 seconds

  // Metrics persistence interval
  const metricsInterval = setInterval(async () => {
    try {
      await metricsCollector.persistMetrics();
      structuredLogger.metrics('Metrics persisted successfully');
    } catch (error) {
      structuredLogger.error('Failed to persist metrics', { error });
    }
  }, 60000); // Every minute

  // Add metrics endpoints
  fastify.get('/metrics/prometheus', async (_request, reply) => {
    reply.type('text/plain');
    return metricsCollector.exportPrometheusMetrics();
  });

  fastify.get('/metrics/json', async () => {
    return metricsCollector.getAllMetrics();
  });

  fastify.get('/metrics/summary', async () => {
    // const metrics = metricsCollector.getAllMetrics();
    const memUsage = process.memoryUsage();
    
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
      system: {
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
          rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
        },
        activeHandles: (process as any)._getActiveHandles?.()?.length || 0,
        activeRequests: (process as any)._getActiveRequests?.()?.length || 0,
      },
      requests: {
        total: metricsCollector.getCounter('http_requests_total'),
        errors: metricsCollector.getCounter('http_errors_total'),
      },
      database: {
        queries: metricsCollector.getCounter('database_queries_total'),
      },
      cache: {
        hits: metricsCollector.getCounter('cache_hits_total'),
        misses: metricsCollector.getCounter('cache_misses_total'),
      },
      business: {
        quotesRequested: metricsCollector.getCounter('quotes_requested_total'),
        quotesLiked: metricsCollector.getCounter('quotes_liked_total'),
        similarQuotesRequested: metricsCollector.getCounter('similar_quotes_requested_total'),
      },
    };
  });

  // Cleanup intervals on close
  fastify.addHook('onClose', async () => {
    clearInterval(systemMetricsInterval);
    clearInterval(metricsInterval);
    
    // Final metrics persistence
    try {
      await metricsCollector.persistMetrics();
      structuredLogger.info('Final metrics persisted on shutdown');
    } catch (error) {
      structuredLogger.error('Failed to persist final metrics', { error });
    }
  });

  structuredLogger.info('Monitoring plugin registered successfully', {
    metricsEnabled: config.METRICS_ENABLED,
    requestIdHeader: config.REQUEST_ID_HEADER,
  });
}

/**
 * Monitoring utilities for use in application code
 */
export const MonitoringUtils = {
  /**
   * Time a database operation
   */
  timeDatabase: <T>(
    operation: string,
    table: string,
    fn: () => Promise<T>
  ): Promise<T> => {
    const timer = metricsCollector.startTimer('database_query_duration_ms', {
      operation,
      table,
    });

    AppMetrics.incrementDatabaseQuery(operation, table);

    return fn()
      .then(result => {
        timer();
        structuredLogger.database('Database operation completed', {
          operation,
          table,
          success: true,
        });
        return result;
      })
      .catch(error => {
        timer();
        metricsCollector.incrementCounter('database_errors_total', 1, {
          operation,
          table,
          errorType: error.constructor.name,
        });
        structuredLogger.database('Database operation failed', {
          operation,
          table,
          error: {
            name: error.name,
            message: error.message,
          },
        });
        throw error;
      });
  },

  /**
   * Time an external API call
   */
  timeExternalAPI: <T>(
    service: string,
    url: string,
    fn: () => Promise<T>
  ): Promise<T> => {
    const timer = metricsCollector.startTimer('external_api_response_time_ms', {
      api: service,
    });

    const startTime = Date.now();

    return fn()
      .then(result => {
        const duration = Date.now() - startTime;
        timer();
        AppMetrics.incrementExternalAPICall(service, 200);
        AppMetrics.recordExternalAPIResponseTime(service, duration);
        
        structuredLogger.external('External API call completed', {
          service,
          url,
          duration,
          success: true,
        });
        
        return result;
      })
      .catch(error => {
        const duration = Date.now() - startTime;
        timer();
        const statusCode = error.response?.status || 0;
        AppMetrics.incrementExternalAPICall(service, statusCode);
        AppMetrics.recordExternalAPIResponseTime(service, duration);
        
        metricsCollector.incrementCounter('external_api_errors_total', 1, {
          api: service,
          errorType: error.constructor.name,
        });
        
        structuredLogger.external('External API call failed', {
          service,
          url,
          duration,
          statusCode,
          error: {
            name: error.name,
            message: error.message,
          },
        });
        
        throw error;
      });
  },

  /**
   * Record cache operation
   */
  recordCache: (operation: 'get' | 'set' | 'delete', key: string, hit: boolean) => {
    if (hit) {
      AppMetrics.incrementCacheHit(operation);
    } else {
      AppMetrics.incrementCacheMiss(operation);
    }

    structuredLogger.cache('Cache operation', {
      operation,
      key: key.substring(0, 50), // Truncate long keys
      hit,
    });
  },

  /**
   * Record business metric
   */
  recordBusiness: (event: string, data?: Record<string, any>) => {
    metricsCollector.incrementCounter(`business_events_total`, 1, {
      event,
    });

    structuredLogger.business('Business event recorded', {
      event,
      ...data,
    });
  },
};