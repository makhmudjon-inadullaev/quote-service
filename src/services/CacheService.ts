import { redisClient } from '../config/redis';
import { config } from '../config';
import { Quote, SimilarityScore } from '../types';

export class CacheService {
  private readonly QUOTE_PREFIX = 'quote:';
  private readonly RANDOM_QUOTE_KEY = 'random_quotes';
  private readonly SIMILAR_QUOTES_PREFIX = 'similar:';
  private readonly EXTERNAL_API_PREFIX = 'external:';

  async getQuote(id: string): Promise<Quote | null> {
    try {
      const cached = await redisClient.get(`${this.QUOTE_PREFIX}${id}`);
      if (!cached) return null;
      
      const parsed = JSON.parse(cached);
      // Convert date strings back to Date objects
      if (parsed.createdAt) parsed.createdAt = new Date(parsed.createdAt);
      if (parsed.updatedAt) parsed.updatedAt = new Date(parsed.updatedAt);
      
      return parsed;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async setQuote(quote: Quote, ttl?: number): Promise<void> {
    try {
      const cacheKey = `${this.QUOTE_PREFIX}${quote.id}`;
      const ttlSeconds = ttl || config.cache.quoteTtl;
      await redisClient.set(cacheKey, JSON.stringify(quote), ttlSeconds);
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async getRandomQuotes(): Promise<Quote[] | null> {
    try {
      const cached = await redisClient.get(this.RANDOM_QUOTE_KEY);
      if (!cached) return null;
      
      const parsed = JSON.parse(cached);
      // Convert date strings back to Date objects for each quote
      return parsed.map((quote: any) => ({
        ...quote,
        createdAt: new Date(quote.createdAt),
        updatedAt: new Date(quote.updatedAt),
      }));
    } catch (error) {
      console.error('Cache get random quotes error:', error);
      return null;
    }
  }

  async setRandomQuotes(quotes: Quote[], ttl?: number): Promise<void> {
    try {
      const ttlSeconds = ttl || config.cache.quoteTtl;
      await redisClient.set(this.RANDOM_QUOTE_KEY, JSON.stringify(quotes), ttlSeconds);
    } catch (error) {
      console.error('Cache set random quotes error:', error);
    }
  }

  async getSimilarQuotes(quoteId: string): Promise<SimilarityScore[] | null> {
    try {
      const cached = await redisClient.get(`${this.SIMILAR_QUOTES_PREFIX}${quoteId}`);
      if (!cached) return null;
      
      const parsed = JSON.parse(cached);
      // Convert date strings back to Date objects for each quote in similarity scores
      return parsed.map((similarity: any) => ({
        ...similarity,
        quote: {
          ...similarity.quote,
          createdAt: new Date(similarity.quote.createdAt),
          updatedAt: new Date(similarity.quote.updatedAt),
        },
      }));
    } catch (error) {
      console.error('Cache get similar quotes error:', error);
      return null;
    }
  }

  async setSimilarQuotes(quoteId: string, similarQuotes: SimilarityScore[], ttl?: number): Promise<void> {
    try {
      const cacheKey = `${this.SIMILAR_QUOTES_PREFIX}${quoteId}`;
      const ttlSeconds = ttl || config.cache.similarityTtl;
      await redisClient.set(cacheKey, JSON.stringify(similarQuotes), ttlSeconds);
    } catch (error) {
      console.error('Cache set similar quotes error:', error);
    }
  }

  async getExternalApiResponse(apiKey: string): Promise<any | null> {
    try {
      const cached = await redisClient.get(`${this.EXTERNAL_API_PREFIX}${apiKey}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Cache get external API error:', error);
      return null;
    }
  }

  async setExternalApiResponse(apiKey: string, response: any, ttl?: number): Promise<void> {
    try {
      const cacheKey = `${this.EXTERNAL_API_PREFIX}${apiKey}`;
      const ttlSeconds = ttl || config.cache.externalApiTtl;
      await redisClient.set(cacheKey, JSON.stringify(response), ttlSeconds);
    } catch (error) {
      console.error('Cache set external API error:', error);
    }
  }

  async invalidateQuote(id: string): Promise<void> {
    try {
      await redisClient.del(`${this.QUOTE_PREFIX}${id}`);
      // Also invalidate similar quotes cache for this quote
      await redisClient.del(`${this.SIMILAR_QUOTES_PREFIX}${id}`);
    } catch (error) {
      console.error('Cache invalidate quote error:', error);
    }
  }

  async invalidateRandomQuotes(): Promise<void> {
    try {
      await redisClient.del(this.RANDOM_QUOTE_KEY);
    } catch (error) {
      console.error('Cache invalidate random quotes error:', error);
    }
  }

  async invalidateAllSimilarQuotes(): Promise<void> {
    try {
      // This is a simple implementation - in production you might want to use SCAN
      const client = redisClient.getClient();
      const keys = await client.keys(`${this.SIMILAR_QUOTES_PREFIX}*`);
      if (keys.length > 0) {
        await client.del(keys);
      }
    } catch (error) {
      console.error('Cache invalidate all similar quotes error:', error);
    }
  }

  async clearAll(): Promise<void> {
    try {
      await redisClient.flushAll();
    } catch (error) {
      console.error('Cache clear all error:', error);
    }
  }

  async isConnected(): Promise<boolean> {
    return redisClient.isClientConnected();
  }
}

export const cacheService = new CacheService();