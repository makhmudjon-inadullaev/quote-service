import { RateLimitService } from './RateLimitService';
import { redisClient } from '../config/redis';
import { ErrorCode } from '../types';

// Mock Redis client
jest.mock('../config/redis', () => ({
  redisClient: {
    getClient: jest.fn(() => ({
      multi: jest.fn(() => ({
        zRemRangeByScore: jest.fn(),
        zAdd: jest.fn(),
        expire: jest.fn(),
        exec: jest.fn(),
      })),
      zCount: jest.fn(),
    })),
    del: jest.fn(),
  },
}));

const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;

describe('RateLimitService', () => {
  let rateLimitService: RateLimitService;
  let mockClient: any;
  let mockMulti: any;

  beforeEach(() => {
    rateLimitService = new RateLimitService();
    jest.clearAllMocks();

    mockMulti = {
      zRemRangeByScore: jest.fn().mockReturnThis(),
      zAdd: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };

    mockClient = {
      multi: jest.fn(() => mockMulti),
      zCount: jest.fn(),
    };

    mockRedisClient.getClient.mockReturnValue(mockClient);
  });

  describe('checkRateLimit', () => {
    it('should return rate limit info when under limit', async () => {
      mockClient.zCount.mockResolvedValue(5);

      const result = await rateLimitService.checkRateLimit('test-user');

      expect(result.totalHits).toBe(5);
      expect(result.totalHitsRemaining).toBe(95); // default max is 100
      expect(result.resetTime).toBeInstanceOf(Date);
      expect(result.windowMs).toBe(900000); // default window
    });

    it('should throw rate limit exceeded error when over limit', async () => {
      mockClient.zCount.mockResolvedValue(100);

      await expect(rateLimitService.checkRateLimit('test-user'))
        .rejects
        .toMatchObject({
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          statusCode: 429,
        });
    });

    it('should use custom options', async () => {
      mockClient.zCount.mockResolvedValue(8);

      const result = await rateLimitService.checkRateLimit('test-user', {
        max: 10,
        windowMs: 60000,
      });

      expect(result.totalHits).toBe(8);
      expect(result.totalHitsRemaining).toBe(2);
      expect(result.windowMs).toBe(60000);
    });

    it('should handle Redis errors gracefully', async () => {
      mockClient.zCount.mockRejectedValue(new Error('Redis error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await rateLimitService.checkRateLimit('test-user');

      expect(result.totalHits).toBe(0);
      expect(result.totalHitsRemaining).toBe(100);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to get current rate limit count:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('should use custom key generator', async () => {
      mockClient.zCount.mockResolvedValue(0);

      await rateLimitService.checkRateLimit('test-user', {
        keyGenerator: (id) => `custom:${id}`,
      });

      expect(mockClient.zCount).toHaveBeenCalledWith(
        'custom:test-user',
        expect.any(Number),
        '+inf'
      );
    });
  });

  describe('incrementCounter', () => {
    it('should increment counter using Redis sorted set', async () => {
      await rateLimitService.incrementCounter('test-user');

      expect(mockClient.multi).toHaveBeenCalled();
      expect(mockMulti.zRemRangeByScore).toHaveBeenCalledWith(
        'rate_limit:test-user',
        0,
        expect.any(Number)
      );
      expect(mockMulti.zAdd).toHaveBeenCalledWith(
        'rate_limit:test-user',
        expect.objectContaining({
          score: expect.any(Number),
          value: expect.any(String),
        })
      );
      expect(mockMulti.expire).toHaveBeenCalledWith(
        'rate_limit:test-user',
        expect.any(Number)
      );
      expect(mockMulti.exec).toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      mockMulti.exec.mockRejectedValue(new Error('Redis error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(rateLimitService.incrementCounter('test-user'))
        .resolves
        .not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to increment rate limit counter:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('should use custom key generator', async () => {
      await rateLimitService.incrementCounter('test-user', {
        keyGenerator: (id) => `custom:${id}`,
      });

      expect(mockMulti.zRemRangeByScore).toHaveBeenCalledWith(
        'custom:test-user',
        0,
        expect.any(Number)
      );
    });
  });

  describe('resetRateLimit', () => {
    it('should delete rate limit key', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await rateLimitService.resetRateLimit('test-user');

      expect(mockRedisClient.del).toHaveBeenCalledWith('rate_limit:test-user');
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(rateLimitService.resetRateLimit('test-user'))
        .resolves
        .not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to reset rate limit:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return current rate limit status', async () => {
      mockClient.zCount.mockResolvedValue(25);

      const result = await rateLimitService.getRateLimitStatus('test-user');

      expect(result.totalHits).toBe(25);
      expect(result.totalHitsRemaining).toBe(75);
      expect(result.resetTime).toBeInstanceOf(Date);
      expect(result.windowMs).toBe(900000);
    });

    it('should handle Redis errors gracefully', async () => {
      mockClient.zCount.mockRejectedValue(new Error('Redis error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await rateLimitService.getRateLimitStatus('test-user');

      expect(result.totalHits).toBe(0);
      expect(result.totalHitsRemaining).toBe(100);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to get current rate limit count:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });
});