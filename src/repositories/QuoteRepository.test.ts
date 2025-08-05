import { PrismaClient } from '@prisma/client';
import { QuoteRepository, CreateQuoteData, UpdateQuoteData } from './QuoteRepository';
import { ErrorCode, QuoteServiceError } from '../types';

// Mock Prisma Client
const mockPrisma = {
  quote: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
} as unknown as PrismaClient;

describe('QuoteRepository', () => {
  let repository: QuoteRepository;

  beforeEach(() => {
    repository = new QuoteRepository(mockPrisma);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createData: CreateQuoteData = {
      text: 'Test quote',
      author: 'Test Author',
      tags: ['wisdom', 'inspiration'],
      source: 'internal',
      externalId: 'test-123',
    };

    const mockPrismaQuote = {
      id: 'quote-1',
      text: 'Test quote',
      author: 'Test Author',
      tags: '["wisdom","inspiration"]',
      likes: 0,
      source: 'internal',
      externalId: 'test-123',
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-01'),
    };

    it('should create a quote successfully', async () => {
      (mockPrisma.quote.create as jest.Mock).mockResolvedValue(mockPrismaQuote);

      const result = await repository.create(createData);

      expect(mockPrisma.quote.create).toHaveBeenCalledWith({
        data: {
          text: 'Test quote',
          author: 'Test Author',
          tags: '["wisdom","inspiration"]',
          source: 'internal',
          externalId: 'test-123',
          likes: 0,
        },
      });

      expect(result).toEqual({
        id: 'quote-1',
        text: 'Test quote',
        author: 'Test Author',
        tags: ['wisdom', 'inspiration'],
        likes: 0,
        source: 'internal',
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-01'),
      });
    });

    it('should handle tags sanitization', async () => {
      const dataWithBadTags = {
        ...createData,
        tags: ['  wisdom  ', '', 'inspiration', '  ', 'MOTIVATION'],
      };

      (mockPrisma.quote.create as jest.Mock).mockResolvedValue({
        ...mockPrismaQuote,
        tags: '["wisdom","inspiration","motivation"]',
      });

      await repository.create(dataWithBadTags);

      expect(mockPrisma.quote.create).toHaveBeenCalledWith({
        data: {
          text: 'Test quote',
          author: 'Test Author',
          tags: '["wisdom","inspiration","motivation"]',
          source: 'internal',
          externalId: 'test-123',
          likes: 0,
        },
      });
    });

    it('should handle unique constraint violation', async () => {
      const error = new Error('unique constraint failed');
      (mockPrisma.quote.create as jest.Mock).mockRejectedValue(error);

      await expect(repository.create(createData)).rejects.toThrow(QuoteServiceError);
      await expect(repository.create(createData)).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
        statusCode: 409,
      });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      (mockPrisma.quote.create as jest.Mock).mockRejectedValue(error);

      await expect(repository.create(createData)).rejects.toThrow(QuoteServiceError);
      await expect(repository.create(createData)).rejects.toMatchObject({
        code: ErrorCode.DATABASE_ERROR,
        statusCode: 500,
      });
    });
  });

  describe('findById', () => {
    const mockPrismaQuote = {
      id: 'quote-1',
      text: 'Test quote',
      author: 'Test Author',
      tags: '["wisdom"]',
      likes: 5,
      source: 'internal',
      externalId: null,
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-01'),
    };

    it('should find a quote by ID', async () => {
      (mockPrisma.quote.findUnique as jest.Mock).mockResolvedValue(mockPrismaQuote);

      const result = await repository.findById('quote-1');

      expect(mockPrisma.quote.findUnique).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
      });

      expect(result).toEqual({
        id: 'quote-1',
        text: 'Test quote',
        author: 'Test Author',
        tags: ['wisdom'],
        likes: 5,
        source: 'internal',
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-01'),
      });
    });

    it('should return null when quote not found', async () => {
      (mockPrisma.quote.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      (mockPrisma.quote.findUnique as jest.Mock).mockRejectedValue(error);

      await expect(repository.findById('quote-1')).rejects.toThrow(QuoteServiceError);
    });
  });

  describe('update', () => {
    const updateData: UpdateQuoteData = {
      text: 'Updated quote',
      likes: 10,
      tags: ['updated'],
    };

    const mockUpdatedQuote = {
      id: 'quote-1',
      text: 'Updated quote',
      author: 'Test Author',
      tags: '["updated"]',
      likes: 10,
      source: 'internal',
      externalId: null,
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-02'),
    };

    it('should update a quote successfully', async () => {
      (mockPrisma.quote.update as jest.Mock).mockResolvedValue(mockUpdatedQuote);

      const result = await repository.update('quote-1', updateData);

      expect(mockPrisma.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: {
          text: 'Updated quote',
          likes: 10,
          tags: '["updated"]',
        },
      });

      expect(result.text).toBe('Updated quote');
      expect(result.likes).toBe(10);
      expect(result.tags).toEqual(['updated']);
    });

    it('should handle quote not found', async () => {
      const error = new Error('Record to update not found');
      (mockPrisma.quote.update as jest.Mock).mockRejectedValue(error);

      await expect(repository.update('nonexistent', updateData)).rejects.toThrow(QuoteServiceError);
      await expect(repository.update('nonexistent', updateData)).rejects.toMatchObject({
        code: ErrorCode.QUOTE_NOT_FOUND,
        statusCode: 404,
      });
    });
  });

  describe('incrementLikes', () => {
    const mockUpdatedQuote = {
      id: 'quote-1',
      text: 'Test quote',
      author: 'Test Author',
      tags: null,
      likes: 6,
      source: 'internal',
      externalId: null,
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-02'),
    };

    it('should increment likes successfully', async () => {
      (mockPrisma.quote.update as jest.Mock).mockResolvedValue(mockUpdatedQuote);

      const result = await repository.incrementLikes('quote-1');

      expect(mockPrisma.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: {
          likes: {
            increment: 1,
          },
        },
      });

      expect(result.likes).toBe(6);
    });

    it('should handle quote not found', async () => {
      const error = new Error('Record to update not found');
      (mockPrisma.quote.update as jest.Mock).mockRejectedValue(error);

      await expect(repository.incrementLikes('nonexistent')).rejects.toThrow(QuoteServiceError);
      await expect(repository.incrementLikes('nonexistent')).rejects.toMatchObject({
        code: ErrorCode.QUOTE_NOT_FOUND,
        statusCode: 404,
      });
    });
  });

  describe('getWeightedRandom', () => {
    const mockQuotes = [
      {
        id: 'quote-1',
        text: 'Quote 1',
        author: 'Author 1',
        tags: null,
        likes: 10,
        source: 'internal',
        externalId: null,
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-01'),
      },
      {
        id: 'quote-2',
        text: 'Quote 2',
        author: 'Author 2',
        tags: null,
        likes: 5,
        source: 'internal',
        externalId: null,
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-01'),
      },
      {
        id: 'quote-3',
        text: 'Quote 3',
        author: 'Author 3',
        tags: null,
        likes: 0,
        source: 'internal',
        externalId: null,
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-01'),
      },
    ];

    it('should return a weighted random quote', async () => {
      (mockPrisma.quote.findMany as jest.Mock).mockResolvedValue(mockQuotes);

      // Mock Math.random to return a predictable value
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.5);

      const result = await repository.getWeightedRandom();

      expect(mockPrisma.quote.findMany).toHaveBeenCalledWith({
        where: {
          likes: { gte: 0 },
          id: { notIn: [] },
        },
        orderBy: { likes: 'desc' },
      });

      expect(result).toBeTruthy();
      expect(result?.id).toMatch(/^quote-[123]$/);

      // Restore Math.random
      Math.random = originalRandom;
    });

    it('should exclude specified IDs', async () => {
      (mockPrisma.quote.findMany as jest.Mock).mockResolvedValue([mockQuotes[1], mockQuotes[2]]);

      await repository.getWeightedRandom({ excludeIds: ['quote-1'] });

      expect(mockPrisma.quote.findMany).toHaveBeenCalledWith({
        where: {
          likes: { gte: 0 },
          id: { notIn: ['quote-1'] },
        },
        orderBy: { likes: 'desc' },
      });
    });

    it('should return null when no quotes found', async () => {
      (mockPrisma.quote.findMany as jest.Mock).mockResolvedValue([]);

      const result = await repository.getWeightedRandom();

      expect(result).toBeNull();
    });

    it('should return single quote when only one exists', async () => {
      (mockPrisma.quote.findMany as jest.Mock).mockResolvedValue([mockQuotes[0]]);

      const result = await repository.getWeightedRandom();

      expect(result?.id).toBe('quote-1');
    });
  });

  describe('getRandom', () => {
    const mockQuote = {
      id: 'quote-1',
      text: 'Random quote',
      author: 'Random Author',
      tags: null,
      likes: 3,
      source: 'internal',
      externalId: null,
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-01'),
    };

    it('should return a random quote', async () => {
      (mockPrisma.quote.count as jest.Mock).mockResolvedValue(5);
      (mockPrisma.quote.findFirst as jest.Mock).mockResolvedValue(mockQuote);

      // Mock Math.random to return predictable value
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.6); // Should give offset of 3

      const result = await repository.getRandom();

      expect(mockPrisma.quote.count).toHaveBeenCalledWith({
        where: { id: { notIn: [] } },
      });

      expect(mockPrisma.quote.findFirst).toHaveBeenCalledWith({
        where: { id: { notIn: [] } },
        skip: 3,
      });

      expect(result?.id).toBe('quote-1');

      // Restore Math.random
      Math.random = originalRandom;
    });

    it('should return null when no quotes exist', async () => {
      (mockPrisma.quote.count as jest.Mock).mockResolvedValue(0);

      const result = await repository.getRandom();

      expect(result).toBeNull();
    });
  });

  describe('findByAuthor', () => {
    const mockQuotes = [
      {
        id: 'quote-1',
        text: 'Quote by Einstein',
        author: 'Albert Einstein',
        tags: null,
        likes: 15,
        source: 'internal',
        externalId: null,
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-01'),
      },
    ];

    it('should find quotes by author', async () => {
      (mockPrisma.quote.findMany as jest.Mock).mockResolvedValue(mockQuotes);

      const result = await repository.findByAuthor('Einstein', 5);

      expect(mockPrisma.quote.findMany).toHaveBeenCalledWith({
        where: {
          author: {
            contains: 'Einstein',
          },
        },
        take: 5,
        orderBy: { likes: 'desc' },
      });

      expect(result).toHaveLength(1);
      expect(result[0].author).toBe('Albert Einstein');
    });
  });

  describe('count', () => {
    it('should return total count of quotes', async () => {
      (mockPrisma.quote.count as jest.Mock).mockResolvedValue(42);

      const result = await repository.count();

      expect(result).toBe(42);
    });
  });

  describe('exists', () => {
    it('should return true when quote exists', async () => {
      (mockPrisma.quote.count as jest.Mock).mockResolvedValue(1);

      const result = await repository.exists('quote-1');

      expect(mockPrisma.quote.count).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
      });

      expect(result).toBe(true);
    });

    it('should return false when quote does not exist', async () => {
      (mockPrisma.quote.count as jest.Mock).mockResolvedValue(0);

      const result = await repository.exists('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete a quote successfully', async () => {
      (mockPrisma.quote.delete as jest.Mock).mockResolvedValue({});

      await repository.delete('quote-1');

      expect(mockPrisma.quote.delete).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
      });
    });

    it('should handle quote not found', async () => {
      const error = new Error('Record to delete does not exist');
      (mockPrisma.quote.delete as jest.Mock).mockRejectedValue(error);

      await expect(repository.delete('nonexistent')).rejects.toThrow(QuoteServiceError);
      await expect(repository.delete('nonexistent')).rejects.toMatchObject({
        code: ErrorCode.QUOTE_NOT_FOUND,
        statusCode: 404,
      });
    });
  });
});