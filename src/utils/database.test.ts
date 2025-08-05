import { Quote as PrismaQuote, QuoteSimilarity as PrismaQuoteSimilarity } from '@prisma/client';
import {
  transformPrismaQuote,
  transformToQuoteInput,
  transformPrismaQuoteSimilarity,
  sanitizeTags,
  generateExternalId,
} from './database';

describe('Database Utilities', () => {
  describe('transformPrismaQuote', () => {
    it('should transform Prisma quote to application quote', () => {
      const prismaQuote: PrismaQuote = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        text: 'Test quote',
        author: 'Test Author',
        tags: '["wisdom","inspiration"]',
        likes: 5,
        source: 'quotable',
        externalId: 'quotable_123',
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-02'),
      };

      const result = transformPrismaQuote(prismaQuote);

      expect(result).toEqual({
        id: '123e4567-e89b-12d3-a456-426614174000',
        text: 'Test quote',
        author: 'Test Author',
        tags: ['wisdom', 'inspiration'],
        likes: 5,
        source: 'quotable',
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-02'),
      });
    });

    it('should handle null tags', () => {
      const prismaQuote: PrismaQuote = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        text: 'Test quote',
        author: 'Test Author',
        tags: null,
        likes: 0,
        source: 'internal',
        externalId: null,
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-02'),
      };

      const result = transformPrismaQuote(prismaQuote);

      expect(result.tags).toBeUndefined();
    });
  });

  describe('transformToQuoteInput', () => {
    it('should transform application quote to Prisma input', () => {
      const quote = {
        text: 'Test quote',
        author: 'Test Author',
        tags: ['wisdom', 'inspiration'],
        likes: 5,
        source: 'quotable' as const,
      };

      const result = transformToQuoteInput(quote);

      expect(result).toEqual({
        text: 'Test quote',
        author: 'Test Author',
        tags: '["wisdom","inspiration"]',
        likes: 5,
        source: 'quotable',
      });
    });

    it('should handle undefined tags', () => {
      const quote = {
        text: 'Test quote',
        author: 'Test Author',
        tags: undefined,
        likes: 0,
        source: 'internal' as const,
      };

      const result = transformToQuoteInput(quote);

      expect(result.tags).toBeNull();
    });
  });

  describe('transformPrismaQuoteSimilarity', () => {
    it('should transform Prisma quote similarity to similarity score', () => {
      const prismaQuoteSimilarity: PrismaQuoteSimilarity & { similarQuote: PrismaQuote } = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        quoteId: '123e4567-e89b-12d3-a456-426614174001',
        similarQuoteId: '123e4567-e89b-12d3-a456-426614174002',
        similarityScore: 0.85,
        createdAt: new Date('2023-01-01'),
        similarQuote: {
          id: '123e4567-e89b-12d3-a456-426614174002',
          text: 'Similar quote',
          author: 'Similar Author',
          tags: '["wisdom"]',
          likes: 3,
          source: 'dummyjson',
          externalId: 'dummyjson_456',
          createdAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-02'),
        },
      };

      const result = transformPrismaQuoteSimilarity(prismaQuoteSimilarity);

      expect(result).toEqual({
        quote: {
          id: '123e4567-e89b-12d3-a456-426614174002',
          text: 'Similar quote',
          author: 'Similar Author',
          tags: ['wisdom'],
          likes: 3,
          source: 'dummyjson',
          createdAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-02'),
        },
        score: 0.85,
      });
    });
  });

  describe('sanitizeTags', () => {
    it('should sanitize and normalize tags', () => {
      const tags = ['  Wisdom  ', 'INSPIRATION', 'motivation', ''];

      const result = sanitizeTags(tags);

      expect(result).toEqual(['wisdom', 'inspiration', 'motivation']);
    });

    it('should limit tags to maximum of 10', () => {
      const tags = Array.from({ length: 15 }, (_, i) => `tag${i}`);

      const result = sanitizeTags(tags);

      expect(result).toHaveLength(10);
    });

    it('should handle undefined input', () => {
      const result = sanitizeTags(undefined);

      expect(result).toBeUndefined();
    });

    it('should handle non-array input', () => {
      const result = sanitizeTags('not an array' as any);

      expect(result).toBeUndefined();
    });

    it('should filter out non-string values', () => {
      const tags = ['valid', 123, null, 'another valid', undefined] as any;

      const result = sanitizeTags(tags);

      expect(result).toEqual(['valid', 'another valid']);
    });
  });

  describe('generateExternalId', () => {
    it('should generate external ID from source and original ID', () => {
      const result = generateExternalId('quotable', '123');

      expect(result).toBe('quotable_123');
    });

    it('should handle numeric original ID', () => {
      const result = generateExternalId('dummyjson', 456);

      expect(result).toBe('dummyjson_456');
    });
  });
});