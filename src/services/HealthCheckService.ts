import { redisClient } from '../config/redis';
import { prisma } from '../config/database';
import { ExternalAPIClient } from './ExternalAPIClient';
import { performanceService, HealthCheckResult } from './PerformanceService';
import { logger } from '../config/logger';

export class HealthCheckService {
  private externalAPIClient: ExternalAPIClient;

  constructor() {
    this.externalAPIClient = new ExternalAPIClient();
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const timestamp = new Date();
    const checks = {
      database: false,
      redis: false,
      externalApi: false,
    };

    // Check database connectivity
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = true;
      logger.debug('Database health check passed');
    } catch (error) {
      logger.error('Database health check failed', { error });
    }

    // Check Redis connectivity
    try {
      await redisClient.connect();
      const testKey = 'health_check_test';
      await redisClient.set(testKey, 'test', 10);
      const result = await redisClient.get(testKey);
      await redisClient.del(testKey);
      
      if (result === 'test') {
        checks.redis = true;
        logger.debug('Redis health check passed');
      }
    } catch (error) {
      logger.error('Redis health check failed', { error });
    }

    // Check external API connectivity (with timeout)
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), 3000);
      });

      await Promise.race([
        this.externalAPIClient.fetchFromQuotable(),
        timeoutPromise,
      ]);
      
      checks.externalApi = true;
      logger.debug('External API health check passed');
    } catch (error) {
      logger.debug('External API health check failed (this is expected in some environments)', { 
        error: error instanceof Error ? error.message : error 
      });
      // External API failure doesn't make the service unhealthy
      // as we have fallback mechanisms
      checks.externalApi = false;
    }

    const memory = performanceService.getMemoryUsage();
    const uptime = performanceService.getUptime();

    // Determine overall health status
    const isHealthy = checks.database && checks.redis;
    
    const result: HealthCheckResult = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp,
      checks,
      uptime,
      memory,
    };

    logger.info('Health check completed', result);
    return result;
  }

  /**
   * Quick health check (database only)
   */
  async quickHealthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; timestamp: Date }> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: 'healthy',
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Quick health check failed', { error });
      return {
        status: 'unhealthy',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Check database connectivity
   */
  async checkDatabase(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('Database connectivity check failed', { error });
      return false;
    }
  }

  /**
   * Check Redis connectivity
   */
  async checkRedis(): Promise<boolean> {
    try {
      if (!redisClient.isClientConnected()) {
        await redisClient.connect();
      }
      
      const testKey = 'connectivity_test';
      await redisClient.set(testKey, 'test', 5);
      const result = await redisClient.get(testKey);
      await redisClient.del(testKey);
      
      return result === 'test';
    } catch (error) {
      logger.error('Redis connectivity check failed', { error });
      return false;
    }
  }

  /**
   * Check external API connectivity
   */
  async checkExternalAPI(): Promise<boolean> {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 2000);
      });

      await Promise.race([
        this.externalAPIClient.fetchFromQuotable(),
        timeoutPromise,
      ]);
      
      return true;
    } catch (error) {
      logger.debug('External API connectivity check failed', { 
        error: error instanceof Error ? error.message : error 
      });
      return false;
    }
  }
}

export const healthCheckService = new HealthCheckService();