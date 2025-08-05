export * from './env';
export * from './database';
export * from './logger';
export * from './redis';

import { config as envConfig } from './env';

// Enhanced config with Redis-specific settings
export const config = {
  ...envConfig,
  redis: {
    url: envConfig.REDIS_URL || 'redis://localhost:6379',
    connectTimeout: 5000,
    commandTimeout: 5000,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
  },
  cache: {
    quoteTtl: envConfig.CACHE_TTL, // 1 hour default
    similarityTtl: envConfig.CACHE_TTL * 2, // 2 hours for similarity cache
    externalApiTtl: 300, // 5 minutes for external API responses
  },
  rateLimit: {
    max: envConfig.RATE_LIMIT_MAX,
    window: envConfig.RATE_LIMIT_WINDOW,
  },
};