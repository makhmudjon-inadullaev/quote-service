import { logger } from '../config/logger';

export interface PerformanceMetrics {
  requestId: string;
  method: string;
  url: string;
  statusCode?: number;
  duration: number;
  timestamp: Date;
  userAgent?: string;
  ip?: string;
  error?: string;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  timestamp: Date;
  checks: {
    database: boolean;
    redis: boolean;
    externalApi: boolean;
  };
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
}

export class PerformanceService {
  private startTime: Date;
  private requestMetrics: Map<string, { startTime: number; method: string; url: string }> = new Map();

  constructor() {
    this.startTime = new Date();
  }

  /**
   * Start tracking a request
   */
  startRequest(requestId: string, method: string, url: string): void {
    this.requestMetrics.set(requestId, {
      startTime: Date.now(),
      method,
      url,
    });
  }

  /**
   * End tracking a request and log metrics
   */
  endRequest(
    requestId: string,
    statusCode: number,
    userAgent?: string,
    ip?: string,
    error?: string
  ): PerformanceMetrics | null {
    const requestData = this.requestMetrics.get(requestId);
    if (!requestData) {
      logger.warn('Request metrics not found for ID', { requestId });
      return null;
    }

    const duration = Date.now() - requestData.startTime;
    const metrics: PerformanceMetrics = {
      requestId,
      method: requestData.method,
      url: requestData.url,
      statusCode,
      duration,
      timestamp: new Date(),
      userAgent,
      ip,
      error,
    };

    // Log performance metrics
    if (error) {
      logger.error('Request completed with error', metrics);
    } else if (duration > 2000) {
      logger.warn('Slow request detected', metrics);
    } else {
      logger.info('Request completed', {
        requestId,
        method: requestData.method,
        url: requestData.url,
        statusCode,
        duration,
      });
    }

    // Clean up
    this.requestMetrics.delete(requestId);

    return metrics;
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage(): { used: number; total: number; percentage: number } {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.heapTotal;
    const usedMemory = memUsage.heapUsed;
    
    return {
      used: usedMemory,
      total: totalMemory,
      percentage: (usedMemory / totalMemory) * 100,
    };
  }

  /**
   * Get application uptime in seconds
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }

  /**
   * Log system metrics periodically
   */
  logSystemMetrics(): void {
    const memory = this.getMemoryUsage();
    const uptime = this.getUptime();
    
    logger.info('System metrics', {
      uptime,
      memory: {
        used: `${Math.round(memory.used / 1024 / 1024)}MB`,
        total: `${Math.round(memory.total / 1024 / 1024)}MB`,
        percentage: `${memory.percentage.toFixed(2)}%`,
      },
      activeRequests: this.requestMetrics.size,
    });
  }

  /**
   * Check if memory usage is concerning
   */
  isMemoryUsageHigh(): boolean {
    const memory = this.getMemoryUsage();
    return memory.percentage > 80; // Alert if memory usage > 80%
  }

  /**
   * Get active request count
   */
  getActiveRequestCount(): number {
    return this.requestMetrics.size;
  }

  /**
   * Clean up stale request metrics (requests that have been running for more than 30 seconds)
   */
  cleanupStaleMetrics(): void {
    const now = Date.now();
    const staleThreshold = 30000; // 30 seconds

    for (const [requestId, data] of this.requestMetrics.entries()) {
      if (now - data.startTime > staleThreshold) {
        logger.warn('Cleaning up stale request metric', {
          requestId,
          method: data.method,
          url: data.url,
          duration: now - data.startTime,
        });
        this.requestMetrics.delete(requestId);
      }
    }
  }

  /**
   * Start periodic system monitoring
   */
  startPeriodicMonitoring(): void {
    // Log system metrics every 5 minutes
    setInterval(() => {
      this.logSystemMetrics();
    }, 5 * 60 * 1000);

    // Clean up stale metrics every minute
    setInterval(() => {
      this.cleanupStaleMetrics();
    }, 60 * 1000);

    // Check memory usage every 30 seconds
    setInterval(() => {
      if (this.isMemoryUsageHigh()) {
        const memory = this.getMemoryUsage();
        logger.warn('High memory usage detected', {
          used: `${Math.round(memory.used / 1024 / 1024)}MB`,
          total: `${Math.round(memory.total / 1024 / 1024)}MB`,
          percentage: `${memory.percentage.toFixed(2)}%`,
        });
      }
    }, 30 * 1000);
  }
}

export const performanceService = new PerformanceService();