import { CacheService } from './CacheService';
import { redisClient } from '../config/redis';
import { Quote, SimilarityScore } from '../types';

// Mock Redis client
jest.mock('../config/redis', () => ({
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    flushAll: jest.fn(),
    isClientConnected: jest.fn(),
    getClient: jest.fn(() => ({
      keys: jest.fn(),
      del: jest.fn(),
    })),
  },
}));

const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;

describe('CacheService', () => {
  let cacheService: CacheService;
  let mockQuote: Quote;
  let mockSimilarityScores: SimilarityScore[];

  beforeEach(() => {
    cacheService = new CacheService();
    jest.clearAllMocks();

    mockQuote = {
      id: 'test-id',
      text: 'Test quote',
      author: 'Test Author',
      tags: ['wisdom'],
      likes: 5,
      source: 'quotable' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockSimilarityScores = [
      {
        quote: mockQuote,
        score: 0.8,
      },
      {
        quote: { ...mockQuote, id: 'similar-id', text: 'Similar quote' },
        score: 0.6,
      },
    ];
  });

  describe('getQuote', () => {
    it('should return cached quote when it exists', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockQuote));

      const result = await cacheService.getQuote('test-id');

      expect(result).toEqual(mockQuote);
      expect(mockRedisClient.get).toHaveBeenCalledWith('quote:test-id');
    });

    it('should return null when quote is not cached', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await cacheService.getQuote('test-id');

      expect(result).toBeNull();
      expect(mockRedisClient.get).toHaveBeenCalledWith('quote:test-id');
    });

    it('should return null when Redis throws an error', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await cacheService.getQuote('test-id');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Cache get error:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('setQuote', () => {
    it('should cache quote with default TTL', async () => {
      mockRedisClient.set.mockResolvedValue();

      await cacheService.setQuote(mockQuote);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'quote:test-id',
        JSON.stringify(mockQuote),
        3600 // default TTL from config
      );
    });

    it('should cache quote with custom TTL', async () => {
      mockRedisClient.set.mockResolvedValue();

      await cacheService.setQuote(mockQuote, 1800);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'quote:test-id',
        JSON.stringify(mockQuote),
        1800
      );
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.set.mockRejectedValue(new Error('Redis error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(cacheService.setQuote(mockQuote)).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('Cache set error:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('getRandomQuotes', () => {
    it('should return cached random quotes when they exist', async () => {
      const mockQuotes = [mockQuote];
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockQuotes));

      const result = await cacheService.getRandomQuotes();

      expect(result).toEqual(mockQuotes);
      expect(mockRedisClient.get).toHaveBeenCalledWith('random_quotes');
    });

    it('should return null when no random quotes are cached', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await cacheService.getRandomQuotes();

      expect(result).toBeNull();
    });
  });

  describe('setRandomQuotes', () => {
    it('should cache random quotes with default TTL', async () => {
      const mockQuotes = [mockQuote];
      mockRedisClient.set.mockResolvedValue();

      await cacheService.setRandomQuotes(mockQuotes);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'random_quotes',
        JSON.stringify(mockQuotes),
        3600
      );
    });
  });

  describe('getSimilarQuotes', () => {
    it('should return cached similar quotes when they exist', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockSimilarityScores));

      const result = await cacheService.getSimilarQuotes('test-id');

      expect(result).toEqual(mockSimilarityScores);
      expect(mockRedisClient.get).toHaveBeenCalledWith('similar:test-id');
    });

    it('should return null when no similar quotes are cached', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await cacheService.getSimilarQuotes('test-id');

      expect(result).toBeNull();
    });
  });

  describe('setSimilarQuotes', () => {
    it('should cache similar quotes with default TTL', async () => {
      mockRedisClient.set.mockResolvedValue();

      await cacheService.setSimilarQuotes('test-id', mockSimilarityScores);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'similar:test-id',
        JSON.stringify(mockSimilarityScores),
        7200 // similarity TTL is 2x quote TTL
      );
    });
  });

  describe('getExternalApiResponse', () => {
    it('should return cached external API response when it exists', async () => {
      const mockResponse = { data: 'test' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockResponse));

      const result = await cacheService.getExternalApiResponse('test-key');

      expect(result).toEqual(mockResponse);
      expect(mockRedisClient.get).toHaveBeenCalledWith('external:test-key');
    });
  });

  describe('setExternalApiResponse', () => {
    it('should cache external API response with default TTL', async () => {
      const mockResponse = { data: 'test' };
      mockRedisClient.set.mockResolvedValue();

      await cacheService.setExternalApiResponse('test-key', mockResponse);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'external:test-key',
        JSON.stringify(mockResponse),
        300 // external API TTL is 5 minutes
      );
    });
  });

  describe('invalidateQuote', () => {
    it('should delete quote and similar quotes cache', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await cacheService.invalidateQuote('test-id');

      expect(mockRedisClient.del).toHaveBeenCalledWith('quote:test-id');
      expect(mockRedisClient.del).toHaveBeenCalledWith('similar:test-id');
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(cacheService.invalidateQuote('test-id')).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('Cache invalidate quote error:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('invalidateRandomQuotes', () => {
    it('should delete random quotes cache', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await cacheService.invalidateRandomQuotes();

      expect(mockRedisClient.del).toHaveBeenCalledWith('random_quotes');
    });
  });

  describe('invalidateAllSimilarQuotes', () => {
    it('should delete all similar quotes cache entries', async () => {
      const mockKeys = ['similar:id1', 'similar:id2'];
      const mockClient = {
        keys: jest.fn().mockResolvedValue(mockKeys),
        del: jest.fn().mockResolvedValue(2),
      };
      mockRedisClient.getClient.mockReturnValue(mockClient as any);

      await cacheService.invalidateAllSimilarQuotes();

      expect(mockClient.keys).toHaveBeenCalledWith('similar:*');
      expect(mockClient.del).toHaveBeenCalledWith(mockKeys);
    });

    it('should handle case when no similar quotes exist', async () => {
      const mockClient = {
        keys: jest.fn().mockResolvedValue([]),
        del: jest.fn(),
      };
      mockRedisClient.getClient.mockReturnValue(mockClient as any);

      await cacheService.invalidateAllSimilarQuotes();

      expect(mockClient.keys).toHaveBeenCalledWith('similar:*');
      expect(mockClient.del).not.toHaveBeenCalled();
    });
  });

  describe('clearAll', () => {
    it('should flush all Redis data', async () => {
      mockRedisClient.flushAll.mockResolvedValue();

      await cacheService.clearAll();

      expect(mockRedisClient.flushAll).toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('should return Redis connection status', async () => {
      mockRedisClient.isClientConnected.mockReturnValue(true);

      const result = await cacheService.isConnected();

      expect(result).toBe(true);
      expect(mockRedisClient.isClientConnected).toHaveBeenCalled();
    });
  });
});