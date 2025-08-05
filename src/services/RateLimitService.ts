import { redisClient } from '../config/redis';
import { config } from '../config';
import { ErrorCode, QuoteServiceError } from '../types';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyGenerator?: (identifier: string) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitInfo {
  totalHits: number;
  totalHitsRemaining: number;
  resetTime: Date;
  windowMs: number;
}

export class RateLimitService {
  private readonly defaultOptions: RateLimitOptions = {
    windowMs: config.rateLimit.window,
    max: config.rateLimit.max,
    keyGenerator: (identifier: string) => `rate_limit:${identifier}`,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  };

  /**
   * Check if a request should be rate limited
   */
  async checkRateLimit(
    identifier: string,
    options: Partial<RateLimitOptions> = {}
  ): Promise<RateLimitInfo> {
    const opts = { ...this.defaultOptions, ...options };
    const key = opts.keyGenerator!(identifier);
    const windowStart = Date.now() - opts.windowMs;

    try {
      // Get current count for this identifier
      const currentCount = await this.getCurrentCount(key, windowStart);
      
      // Calculate reset time (start of next window)
      const resetTime = new Date(Date.now() + opts.windowMs);
      
      const rateLimitInfo: RateLimitInfo = {
        totalHits: currentCount,
        totalHitsRemaining: Math.max(0, opts.max - currentCount),
        resetTime,
        windowMs: opts.windowMs,
      };

      // Check if limit is exceeded
      if (currentCount >= opts.max) {
        throw new QuoteServiceError(
          ErrorCode.RATE_LIMIT_EXCEEDED,
          `Rate limit exceeded. Maximum ${opts.max} requests per ${opts.windowMs / 1000} seconds.`,
          429,
          rateLimitInfo
        );
      }

      return rateLimitInfo;
    } catch (error) {
      if (error instanceof QuoteServiceError) {
        throw error;
      }
      
      // If Redis is down, allow the request but log the error
      console.error('Rate limit check failed, allowing request:', error);
      return {
        totalHits: 0,
        totalHitsRemaining: opts.max,
        resetTime: new Date(Date.now() + opts.windowMs),
        windowMs: opts.windowMs,
      };
    }
  }

  /**
   * Increment the rate limit counter for an identifier
   */
  async incrementCounter(
    identifier: string,
    options: Partial<RateLimitOptions> = {}
  ): Promise<void> {
    const opts = { ...this.defaultOptions, ...options };
    const key = opts.keyGenerator!(identifier);
    const now = Date.now();
    const windowStart = now - opts.windowMs;

    try {
      const client = redisClient.getClient();
      
      // Use a Redis transaction to atomically:
      // 1. Remove expired entries
      // 2. Add current timestamp
      // 3. Set expiration on the key
      const multi = client.multi();
      
      // Remove entries older than the window
      multi.zRemRangeByScore(key, 0, windowStart);
      
      // Add current timestamp
      multi.zAdd(key, { score: now, value: now.toString() });
      
      // Set expiration (window size + buffer)
      multi.expire(key, Math.ceil(opts.windowMs / 1000) + 1);
      
      await multi.exec();
    } catch (error) {
      // Log error but don't fail the request
      console.error('Failed to increment rate limit counter:', error);
    }
  }

  /**
   * Get current count for a rate limit key
   */
  private async getCurrentCount(key: string, windowStart: number): Promise<number> {
    try {
      const client = redisClient.getClient();
      
      // Count entries within the current window
      const count = await client.zCount(key, windowStart, '+inf');
      return count;
    } catch (error) {
      console.error('Failed to get current rate limit count:', error);
      return 0;
    }
  }

  /**
   * Reset rate limit for an identifier
   */
  async resetRateLimit(identifier: string, options: Partial<RateLimitOptions> = {}): Promise<void> {
    const opts = { ...this.defaultOptions, ...options };
    const key = opts.keyGenerator!(identifier);

    try {
      await redisClient.del(key);
    } catch (error) {
      console.error('Failed to reset rate limit:', error);
    }
  }

  /**
   * Get rate limit status without incrementing
   */
  async getRateLimitStatus(
    identifier: string,
    options: Partial<RateLimitOptions> = {}
  ): Promise<RateLimitInfo> {
    const opts = { ...this.defaultOptions, ...options };
    const key = opts.keyGenerator!(identifier);
    const windowStart = Date.now() - opts.windowMs;

    try {
      const currentCount = await this.getCurrentCount(key, windowStart);
      const resetTime = new Date(Date.now() + opts.windowMs);

      return {
        totalHits: currentCount,
        totalHitsRemaining: Math.max(0, opts.max - currentCount),
        resetTime,
        windowMs: opts.windowMs,
      };
    } catch (error) {
      console.error('Failed to get rate limit status:', error);
      return {
        totalHits: 0,
        totalHitsRemaining: opts.max,
        resetTime: new Date(Date.now() + opts.windowMs),
        windowMs: opts.windowMs,
      };
    }
  }
}

export const rateLimitService = new RateLimitService();