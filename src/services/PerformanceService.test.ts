import { PerformanceService } from './PerformanceService';

// Mock logger
jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('PerformanceService', () => {
  let performanceService: PerformanceService;

  beforeEach(() => {
    performanceService = new PerformanceService();
    jest.clearAllMocks();
  });

  describe('startRequest and endRequest', () => {
    it('should track request duration', async () => {
      const requestId = 'test-request-id';
      const method = 'GET';
      const url = '/api/test';

      performanceService.startRequest(requestId, method, url);
      
      // Wait a small amount to ensure duration > 0
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const metrics = performanceService.endRequest(requestId, 200);

      expect(metrics).toMatchObject({
        requestId,
        method,
        url,
        statusCode: 200,
        timestamp: expect.any(Date),
      });
      expect(metrics!.duration).toBeGreaterThan(0);
    });

    it('should include optional parameters in metrics', () => {
      const requestId = 'test-request-id';
      performanceService.startRequest(requestId, 'POST', '/api/test');

      const metrics = performanceService.endRequest(
        requestId,
        201,
        'Mozilla/5.0',
        '192.168.1.1',
        'Test error'
      );

      expect(metrics).toMatchObject({
        requestId,
        statusCode: 201,
        userAgent: 'Mozilla/5.0',
        ip: '192.168.1.1',
        error: 'Test error',
      });
    });

    it('should return null for unknown request ID', () => {
      const metrics = performanceService.endRequest('unknown-id', 200);
      expect(metrics).toBeNull();
    });

    it('should clean up request data after completion', () => {
      const requestId = 'test-request-id';
      performanceService.startRequest(requestId, 'GET', '/api/test');
      
      performanceService.endRequest(requestId, 200);
      
      // Second call should return null
      const secondMetrics = performanceService.endRequest(requestId, 200);
      expect(secondMetrics).toBeNull();
    });
  });

  describe('getMemoryUsage', () => {
    it('should return memory usage information', () => {
      const memory = performanceService.getMemoryUsage();

      expect(memory).toMatchObject({
        used: expect.any(Number),
        total: expect.any(Number),
        percentage: expect.any(Number),
      });
      expect(memory.used).toBeGreaterThan(0);
      expect(memory.total).toBeGreaterThan(0);
      expect(memory.percentage).toBeGreaterThanOrEqual(0);
      expect(memory.percentage).toBeLessThanOrEqual(100);
    });
  });

  describe('getUptime', () => {
    it('should return uptime in seconds', async () => {
      const uptime1 = performanceService.getUptime();
      
      // Wait a bit and check that uptime increased
      await new Promise(resolve => setTimeout(resolve, 1100)); // Wait more than 1 second
      
      const uptime2 = performanceService.getUptime();
      
      expect(uptime1).toBeGreaterThanOrEqual(0);
      expect(uptime2).toBeGreaterThan(uptime1);
    });
  });

  describe('isMemoryUsageHigh', () => {
    it('should return false for normal memory usage', () => {
      // Mock memory usage to be low
      jest.spyOn(performanceService, 'getMemoryUsage').mockReturnValue({
        used: 50 * 1024 * 1024, // 50MB
        total: 100 * 1024 * 1024, // 100MB
        percentage: 50,
      });

      expect(performanceService.isMemoryUsageHigh()).toBe(false);
    });

    it('should return true for high memory usage', () => {
      // Mock memory usage to be high
      jest.spyOn(performanceService, 'getMemoryUsage').mockReturnValue({
        used: 85 * 1024 * 1024, // 85MB
        total: 100 * 1024 * 1024, // 100MB
        percentage: 85,
      });

      expect(performanceService.isMemoryUsageHigh()).toBe(true);
    });
  });

  describe('getActiveRequestCount', () => {
    it('should return number of active requests', () => {
      expect(performanceService.getActiveRequestCount()).toBe(0);

      performanceService.startRequest('req1', 'GET', '/api/test1');
      performanceService.startRequest('req2', 'POST', '/api/test2');
      
      expect(performanceService.getActiveRequestCount()).toBe(2);

      performanceService.endRequest('req1', 200);
      
      expect(performanceService.getActiveRequestCount()).toBe(1);
    });
  });

  describe('cleanupStaleMetrics', () => {
    it('should remove stale request metrics', () => {
      const requestId = 'stale-request';
      performanceService.startRequest(requestId, 'GET', '/api/test');

      // Mock the start time to be old
      const requestMetrics = (performanceService as any).requestMetrics;
      const requestData = requestMetrics.get(requestId);
      requestData.startTime = Date.now() - 35000; // 35 seconds ago

      expect(performanceService.getActiveRequestCount()).toBe(1);

      performanceService.cleanupStaleMetrics();

      expect(performanceService.getActiveRequestCount()).toBe(0);
    });

    it('should not remove recent request metrics', () => {
      const requestId = 'recent-request';
      performanceService.startRequest(requestId, 'GET', '/api/test');

      expect(performanceService.getActiveRequestCount()).toBe(1);

      performanceService.cleanupStaleMetrics();

      expect(performanceService.getActiveRequestCount()).toBe(1);
    });
  });

  describe('logSystemMetrics', () => {
    it('should log system metrics without throwing', () => {
      expect(() => performanceService.logSystemMetrics()).not.toThrow();
    });
  });

  describe('startPeriodicMonitoring', () => {
    it('should start periodic monitoring without throwing', () => {
      // Mock setInterval to prevent actual intervals during tests
      const originalSetInterval = global.setInterval;
      global.setInterval = jest.fn();

      expect(() => performanceService.startPeriodicMonitoring()).not.toThrow();
      expect(global.setInterval).toHaveBeenCalledTimes(3);

      // Restore original setInterval
      global.setInterval = originalSetInterval;
    });
  });
});