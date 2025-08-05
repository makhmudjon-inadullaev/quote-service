import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { redisClient } from '../config/redis';
import { config } from '../config';
import { logger } from '../config/logger';
import { ErrorCode, QuoteServiceError } from '../types';

export interface RateLimitOptions {
  max: number;
  window: number; // in milliseconds
  keyGenerator?: (request: FastifyRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitInfo {
  totalHits: number;
  totalTime: number;
  timeToExpire: number;
  limit: number;
}

/**
 * Default key generator using IP address
 */
function defaultKeyGenerator(request: FastifyRequest): string {
  return `rate_limit:${request.ip}`;
}

/**
 * Redis-based rate limiting implementation
 */
export class RedisRateLimiter {
  private options: Required<RateLimitOptions>;

  constructor(options: RateLimitOptions) {
    this.options = {
      keyGenerator: defaultKeyGenerator,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      ...options,
    };
  }

  async checkRateLimit(request: FastifyRequest): Promise<RateLimitInfo> {
    const key = this.options.keyGenerator(request);
    const windowInSeconds = Math.ceil(this.options.window / 1000);

    try {
      await redisClient.connect();
      const client = redisClient.getClient();

      // Use Redis pipeline for atomic operations
      const pipeline = client.multi();
      
      // Increment the counter
      pipeline.incr(key);
      
      // Set expiration if this is the first request
      pipeline.expire(key, windowInSeconds);
      
      // Get TTL to calculate time to expire
      pipeline.ttl(key);

      const results = await pipeline.exec();
      
      if (!results || results.length !== 3) {
        throw new Error('Redis pipeline execution failed');
      }

      const totalHits = results[0] as number;
      const ttl = results[2] as number;
      
      const timeToExpire = ttl > 0 ? ttl * 1000 : this.options.window;

      return {
        totalHits,
        totalTime: this.options.window,
        timeToExpire,
        limit: this.options.max,
      };
    } catch (error) {
      logger.error('Rate limit check failed', { error, key });
      
      // Fail open - allow request if Redis is unavailable
      return {
        totalHits: 1,
        totalTime: this.options.window,
        timeToExpire: this.options.window,
        limit: this.options.max,
      };
    }
  }

  async resetRateLimit(request: FastifyRequest): Promise<void> {
    const key = this.options.keyGenerator(request);
    
    try {
      await redisClient.connect();
      await redisClient.del(key);
    } catch (error) {
      logger.error('Rate limit reset failed', { error, key });
    }
  }
}

/**
 * Create rate limiting middleware
 */
export function createRateLimitMiddleware(options: RateLimitOptions) {
  const rateLimiter = new RedisRateLimiter(options);

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const rateLimitInfo = await rateLimiter.checkRateLimit(request);

    // Add rate limit headers
    reply.header('X-RateLimit-Limit', rateLimitInfo.limit);
    reply.header('X-RateLimit-Remaining', Math.max(0, rateLimitInfo.limit - rateLimitInfo.totalHits));
    reply.header('X-RateLimit-Reset', new Date(Date.now() + rateLimitInfo.timeToExpire).toISOString());

    // Check if rate limit exceeded
    if (rateLimitInfo.totalHits > rateLimitInfo.limit) {
      const retryAfter = Math.ceil(rateLimitInfo.timeToExpire / 1000);
      reply.header('Retry-After', retryAfter);

      logger.warn('Rate limit exceeded', {
        ip: request.ip,
        path: request.url,
        method: request.method,
        totalHits: rateLimitInfo.totalHits,
        limit: rateLimitInfo.limit,
        retryAfter,
      });

      throw new QuoteServiceError(
        ErrorCode.RATE_LIMIT_EXCEEDED,
        'Rate limit exceeded. Please try again later.',
        429,
        {
          limit: rateLimitInfo.limit,
          remaining: 0,
          retryAfter,
          resetTime: new Date(Date.now() + rateLimitInfo.timeToExpire).toISOString(),
        }
      );
    }

    // Log rate limit info for monitoring
    request.log.debug('Rate limit check passed', {
      ip: request.ip,
      path: request.url,
      totalHits: rateLimitInfo.totalHits,
      limit: rateLimitInfo.limit,
      remaining: rateLimitInfo.limit - rateLimitInfo.totalHits,
    });
  };
}

/**
 * Fastify plugin for rate limiting
 */
export async function rateLimitPlugin(fastify: FastifyInstance) {
  const rateLimitMiddleware = createRateLimitMiddleware({
    max: config.rateLimit.max,
    window: config.rateLimit.window,
  });

  // Apply rate limiting to all routes except health checks
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip rate limiting for health check endpoints
    if (request.url.startsWith('/health') || request.url.startsWith('/metrics')) {
      return;
    }

    await rateLimitMiddleware(request, reply);
  });

  // Add rate limit info to request context
  fastify.decorateRequest('rateLimitInfo', null);
}

/**
 * Create endpoint-specific rate limiter
 */
export function createEndpointRateLimiter(options: Partial<RateLimitOptions> = {}) {
  const endpointOptions: RateLimitOptions = {
    max: options.max || config.rateLimit.max,
    window: options.window || config.rateLimit.window,
    keyGenerator: options.keyGenerator || ((request: FastifyRequest) => 
      `rate_limit:${request.ip}:${request.url}`
    ),
    ...options,
  };

  return createRateLimitMiddleware(endpointOptions);
}