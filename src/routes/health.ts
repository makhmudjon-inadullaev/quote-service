import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { checkDatabaseHealth } from '../config/database';
import { redisClient } from '../config/redis';
import { performanceMonitor } from '../middleware/performance';
import { structuredLogger } from '../config/logger';

// Health check response schema
const healthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string(),
  uptime: z.number(),
  environment: z.string(),
  version: z.string(),
  services: z.object({
    database: z.object({
      status: z.enum(['connected', 'disconnected', 'error']),
      responseTime: z.number().optional(),
    }),
    redis: z.object({
      status: z.enum(['connected', 'disconnected', 'error']),
      responseTime: z.number().optional(),
    }),
    external_apis: z.object({
      quotable: z.object({
        status: z.enum(['available', 'unavailable', 'unknown']),
        responseTime: z.number().optional(),
      }),
      dummyjson: z.object({
        status: z.enum(['available', 'unavailable', 'unknown']),
        responseTime: z.number().optional(),
      }),
    }),
  }),
  performance: z.object({
    totalRequests: z.number(),
    averageResponseTime: z.number(),
    errorRate: z.number(),
    requestsPerSecond: z.number(),
    memoryUsage: z.object({
      heapUsed: z.number(),
      heapTotal: z.number(),
      external: z.number(),
      rss: z.number(),
    }),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * Check Redis health
 */
async function checkRedisHealth(): Promise<{ status: 'connected' | 'disconnected' | 'error'; responseTime?: number }> {
  try {
    const startTime = Date.now();
    await redisClient.connect();
    
    // Test Redis with a simple ping
    const client = redisClient.getClient();
    await client.ping();
    
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'connected',
      responseTime,
    };
  } catch (error) {
    structuredLogger.error('Redis health check failed', { error });
    return {
      status: 'error',
    };
  }
}

/**
 * Check external API health
 */
async function checkExternalAPIHealth(url: string): Promise<{ status: 'available' | 'unavailable' | 'unknown'; responseTime?: number }> {
  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    
    const responseTime = Date.now() - startTime;
    
    return {
      status: response.ok ? 'available' : 'unavailable',
      responseTime,
    };
  } catch (error) {
    structuredLogger.debug('External API health check failed', { url, error: error instanceof Error ? error.message : String(error) });
    return {
      status: 'unavailable',
    };
  }
}

/**
 * Determine overall health status
 */
function determineOverallStatus(
  dbStatus: string,
  redisStatus: string,
  quotableStatus: string,
  dummyjsonStatus: string
): 'healthy' | 'degraded' | 'unhealthy' {
  // Unhealthy if database is down
  if (dbStatus === 'error' || dbStatus === 'disconnected') {
    return 'unhealthy';
  }

  // Degraded if Redis is down or both external APIs are unavailable
  if (redisStatus === 'error' || 
      (quotableStatus === 'unavailable' && dummyjsonStatus === 'unavailable')) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Basic health check endpoint
 */
async function basicHealthCheck(_request: FastifyRequest, reply: FastifyReply): Promise<HealthResponse> {
  const startTime = Date.now();
  
  // Check database health
  const dbStartTime = Date.now();
  const dbHealthy = await checkDatabaseHealth();
  const dbResponseTime = Date.now() - dbStartTime;
  
  // Check Redis health
  const redisHealth = await checkRedisHealth();
  
  // Check external APIs health
  const [quotableHealth, dummyjsonHealth] = await Promise.all([
    checkExternalAPIHealth(`${config.QUOTABLE_API_URL}/quotes?limit=1`),
    checkExternalAPIHealth(`${config.DUMMYJSON_API_URL}/quotes/1`),
  ]);

  // Get performance metrics
  const performanceMetrics = performanceMonitor.getAggregatedMetrics(5);

  const response: HealthResponse = {
    status: determineOverallStatus(
      dbHealthy ? 'connected' : 'disconnected',
      redisHealth.status,
      quotableHealth.status,
      dummyjsonHealth.status
    ),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
    version: '1.0.0',
    services: {
      database: {
        status: dbHealthy ? 'connected' : 'disconnected',
        responseTime: dbResponseTime,
      },
      redis: redisHealth,
      external_apis: {
        quotable: quotableHealth,
        dummyjson: dummyjsonHealth,
      },
    },
    performance: {
      totalRequests: performanceMetrics.totalRequests,
      averageResponseTime: Math.round(performanceMetrics.averageResponseTime * 100) / 100,
      errorRate: Math.round(performanceMetrics.errorRate * 100) / 100,
      requestsPerSecond: Math.round(performanceMetrics.requestsPerSecond * 100) / 100,
      memoryUsage: {
        heapUsed: performanceMetrics.memoryUsage.heapUsed,
        heapTotal: performanceMetrics.memoryUsage.heapTotal,
        external: performanceMetrics.memoryUsage.external,
        rss: performanceMetrics.memoryUsage.rss,
      },
    },
  };

  const totalResponseTime = Date.now() - startTime;
  
  // Log health check
  structuredLogger.health('Health check completed', {
    status: response.status,
    responseTime: totalResponseTime,
    services: {
      database: response.services.database.status,
      redis: response.services.redis.status,
      quotable: response.services.external_apis.quotable.status,
      dummyjson: response.services.external_apis.dummyjson.status,
    },
  });

  // Set appropriate status code
  const statusCode = response.status === 'healthy' ? 200 : 
                    response.status === 'degraded' ? 200 : 503;
  
  reply.code(statusCode);
  return response;
}

/**
 * Readiness probe endpoint
 */
async function readinessCheck(_request: FastifyRequest, reply: FastifyReply) {
  const dbHealthy = await checkDatabaseHealth();
  
  if (!dbHealthy) {
    reply.code(503);
    return {
      status: 'not_ready',
      message: 'Database connection is not available',
      timestamp: new Date().toISOString(),
    };
  }

  reply.code(200);
  return {
    status: 'ready',
    message: 'Service is ready to accept requests',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Liveness probe endpoint
 */
async function livenessCheck(_request: FastifyRequest, reply: FastifyReply) {
  reply.code(200);
  return {
    status: 'alive',
    message: 'Service is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}

/**
 * Metrics endpoint for monitoring systems
 */
async function metricsEndpoint(request: FastifyRequest, reply: FastifyReply) {
  const windowMinutes = parseInt((request.query as any)?.window) || 5;
  const metrics = performanceMonitor.getAggregatedMetrics(windowMinutes);

  reply.code(200);
  return {
    timestamp: new Date().toISOString(),
    window_minutes: windowMinutes,
    metrics: {
      requests: {
        total: metrics.totalRequests,
        per_second: Math.round(metrics.requestsPerSecond * 100) / 100,
        error_rate_percent: Math.round(metrics.errorRate * 100) / 100,
      },
      response_time: {
        average_ms: Math.round(metrics.averageResponseTime * 100) / 100,
        min_ms: metrics.minResponseTime,
        max_ms: metrics.maxResponseTime,
      },
      system: {
        uptime_seconds: metrics.uptime,
        memory_usage_mb: {
          heap_used: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
          heap_total: Math.round(metrics.memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
          rss: Math.round(metrics.memoryUsage.rss / 1024 / 1024 * 100) / 100,
        },
      },
    },
  };
}

/**
 * Register health check routes
 */
export async function healthRoutes(fastify: FastifyInstance) {
  // Comprehensive health check
  fastify.get('/health', basicHealthCheck);

  // Kubernetes readiness probe
  fastify.get('/health/ready', readinessCheck);

  // Kubernetes liveness probe
  fastify.get('/health/live', livenessCheck);

  // Metrics endpoint
  fastify.get('/metrics', metricsEndpoint);

  // Endpoint-specific health checks
  fastify.get('/health/database', async (_request, reply) => {
    const startTime = Date.now();
    const healthy = await checkDatabaseHealth();
    const responseTime = Date.now() - startTime;

    reply.code(healthy ? 200 : 503);
    return {
      status: healthy ? 'connected' : 'disconnected',
      responseTime,
      timestamp: new Date().toISOString(),
    };
  });

  fastify.get('/health/redis', async (_request, reply) => {
    const health = await checkRedisHealth();
    reply.code(health.status === 'connected' ? 200 : 503);
    return {
      ...health,
      timestamp: new Date().toISOString(),
    };
  });

  fastify.get('/health/external-apis', async (_request, reply) => {
    const [quotableHealth, dummyjsonHealth] = await Promise.all([
      checkExternalAPIHealth(`${config.QUOTABLE_API_URL}/quotes?limit=1`),
      checkExternalAPIHealth(`${config.DUMMYJSON_API_URL}/quotes/1`),
    ]);

    const overallStatus = quotableHealth.status === 'available' || 
                         dummyjsonHealth.status === 'available' ? 'available' : 'unavailable';

    reply.code(overallStatus === 'available' ? 200 : 503);
    return {
      status: overallStatus,
      apis: {
        quotable: quotableHealth,
        dummyjson: dummyjsonHealth,
      },
      timestamp: new Date().toISOString(),
    };
  });
}