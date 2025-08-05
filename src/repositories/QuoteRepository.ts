import { PrismaClient } from '@prisma/client';
import { Quote, ErrorCode, QuoteServiceError, SimilarityScore } from '../types';
import { transformPrismaQuote, sanitizeTags } from '../utils/database';
import { logger } from '../config/logger';

export interface CreateQuoteData {
  text: string;
  author: string;
  tags?: string[];
  source: 'quotable' | 'dummyjson' | 'internal';
  externalId?: string;
}

export interface UpdateQuoteData {
  text?: string;
  author?: string;
  tags?: string[];
  likes?: number;
}

export interface WeightedRandomOptions {
  excludeIds?: string[];
  minLikes?: number;
}

export class QuoteRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new quote in the database
   */
  async create(data: CreateQuoteData): Promise<Quote> {
    try {
      const sanitizedTags = sanitizeTags(data.tags);
      
      const prismaQuote = await this.prisma.quote.create({
        data: {
          text: data.text,
          author: data.author,
          tags: sanitizedTags ? JSON.stringify(sanitizedTags) : null,
          source: data.source,
          externalId: data.externalId,
          likes: 0,
        },
      });

      logger.debug('Quote created successfully', { id: prismaQuote.id });
      return transformPrismaQuote(prismaQuote);
    } catch (error) {
      logger.error('Failed to create quote', { error, data });
      
      // Handle unique constraint violation
      if (error instanceof Error && error.message.includes('unique constraint')) {
        throw new QuoteServiceError(
          ErrorCode.VALIDATION_ERROR,
          'Quote with this external ID already exists',
          409,
          { source: data.source, externalId: data.externalId }
        );
      }
      
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to create quote',
        500,
        error
      );
    }
  }

  /**
   * Find a quote by ID
   */
  async findById(id: string): Promise<Quote | null> {
    try {
      const prismaQuote = await this.prisma.quote.findUnique({
        where: { id },
      });

      if (!prismaQuote) {
        return null;
      }

      return transformPrismaQuote(prismaQuote);
    } catch (error) {
      logger.error('Failed to find quote by ID', { error, id });
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to retrieve quote',
        500,
        error
      );
    }
  }

  /**
   * Find quotes by external source and ID
   */
  async findByExternalId(source: string, externalId: string): Promise<Quote | null> {
    try {
      const prismaQuote = await this.prisma.quote.findUnique({
        where: {
          unique_external: {
            source,
            externalId,
          },
        },
      });

      if (!prismaQuote) {
        return null;
      }

      return transformPrismaQuote(prismaQuote);
    } catch (error) {
      logger.error('Failed to find quote by external ID', { error, source, externalId });
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to retrieve quote',
        500,
        error
      );
    }
  }

  /**
   * Update a quote by ID
   */
  async update(id: string, data: UpdateQuoteData): Promise<Quote> {
    try {
      const updateData: any = {};
      
      if (data.text !== undefined) updateData.text = data.text;
      if (data.author !== undefined) updateData.author = data.author;
      if (data.likes !== undefined) updateData.likes = data.likes;
      if (data.tags !== undefined) {
        const sanitizedTags = sanitizeTags(data.tags);
        updateData.tags = sanitizedTags ? JSON.stringify(sanitizedTags) : null;
      }

      const prismaQuote = await this.prisma.quote.update({
        where: { id },
        data: updateData,
      });

      logger.debug('Quote updated successfully', { id });
      return transformPrismaQuote(prismaQuote);
    } catch (error) {
      logger.error('Failed to update quote', { error, id, data });
      
      // Handle record not found
      if (error instanceof Error && error.message.includes('Record to update not found')) {
        throw new QuoteServiceError(
          ErrorCode.QUOTE_NOT_FOUND,
          'Quote not found',
          404,
          { id }
        );
      }
      
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to update quote',
        500,
        error
      );
    }
  }

  /**
   * Delete a quote by ID
   */
  async delete(id: string): Promise<void> {
    try {
      await this.prisma.quote.delete({
        where: { id },
      });

      logger.debug('Quote deleted successfully', { id });
    } catch (error) {
      logger.error('Failed to delete quote', { error, id });
      
      // Handle record not found
      if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
        throw new QuoteServiceError(
          ErrorCode.QUOTE_NOT_FOUND,
          'Quote not found',
          404,
          { id }
        );
      }
      
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to delete quote',
        500,
        error
      );
    }
  }

  /**
   * Increment the like count for a quote
   */
  async incrementLikes(id: string): Promise<Quote> {
    try {
      const prismaQuote = await this.prisma.quote.update({
        where: { id },
        data: {
          likes: {
            increment: 1,
          },
        },
      });

      logger.debug('Quote likes incremented', { id, newLikes: prismaQuote.likes });
      return transformPrismaQuote(prismaQuote);
    } catch (error) {
      logger.error('Failed to increment quote likes', { error, id });
      
      // Handle record not found
      if (error instanceof Error && error.message.includes('Record to update not found')) {
        throw new QuoteServiceError(
          ErrorCode.QUOTE_NOT_FOUND,
          'Quote not found',
          404,
          { id }
        );
      }
      
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to update quote likes',
        500,
        error
      );
    }
  }

  /**
   * Get a weighted random quote based on likes
   * Quotes with more likes have higher probability of being selected
   */
  async getWeightedRandom(options: WeightedRandomOptions = {}): Promise<Quote | null> {
    try {
      const { excludeIds = [], minLikes = 0 } = options;

      // First, get all quotes with their likes for weighted selection
      const quotes = await this.prisma.quote.findMany({
        where: {
          likes: {
            gte: minLikes,
          },
          id: {
            notIn: excludeIds,
          },
        },
        orderBy: {
          likes: 'desc',
        },
      });

      if (quotes.length === 0) {
        return null;
      }

      // If only one quote, return it
      if (quotes.length === 1) {
        return transformPrismaQuote(quotes[0]);
      }

      // Calculate weights based on likes
      // Use likes + 1 to ensure quotes with 0 likes still have a chance
      const weights = quotes.map(quote => quote.likes + 1);
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

      // Generate random number between 0 and totalWeight
      const random = Math.random() * totalWeight;
      
      // Find the selected quote based on weighted probability
      let currentWeight = 0;
      for (let i = 0; i < quotes.length; i++) {
        currentWeight += weights[i];
        if (random <= currentWeight) {
          logger.debug('Weighted random quote selected', { 
            id: quotes[i].id, 
            likes: quotes[i].likes,
            weight: weights[i],
            totalWeight 
          });
          return transformPrismaQuote(quotes[i]);
        }
      }

      // Fallback to last quote (should not happen with proper math)
      return transformPrismaQuote(quotes[quotes.length - 1]);
    } catch (error) {
      logger.error('Failed to get weighted random quote', { error, options });
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to retrieve random quote',
        500,
        error
      );
    }
  }

  /**
   * Get a simple random quote (uniform distribution)
   */
  async getRandom(excludeIds: string[] = []): Promise<Quote | null> {
    try {
      const count = await this.prisma.quote.count({
        where: {
          id: {
            notIn: excludeIds,
          },
        },
      });

      if (count === 0) {
        return null;
      }

      // Generate random offset
      const randomOffset = Math.floor(Math.random() * count);

      const prismaQuote = await this.prisma.quote.findFirst({
        where: {
          id: {
            notIn: excludeIds,
          },
        },
        skip: randomOffset,
      });

      if (!prismaQuote) {
        return null;
      }

      return transformPrismaQuote(prismaQuote);
    } catch (error) {
      logger.error('Failed to get random quote', { error, excludeIds });
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to retrieve random quote',
        500,
        error
      );
    }
  }

  /**
   * Find quotes by author
   */
  async findByAuthor(author: string, limit: number = 10): Promise<Quote[]> {
    try {
      const quotes = await this.prisma.quote.findMany({
        where: {
          author: {
            contains: author,
          },
        },
        take: limit,
        orderBy: {
          likes: 'desc',
        },
      });

      return quotes.map(transformPrismaQuote);
    } catch (error) {
      logger.error('Failed to find quotes by author', { error, author, limit });
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to retrieve quotes by author',
        500,
        error
      );
    }
  }

  /**
   * Get quotes with pagination
   */
  async findMany(
    offset: number = 0,
    limit: number = 10,
    orderBy: 'likes' | 'createdAt' = 'likes'
  ): Promise<Quote[]> {
    try {
      const quotes = await this.prisma.quote.findMany({
        skip: offset,
        take: limit,
        orderBy: {
          [orderBy]: 'desc',
        },
      });

      return quotes.map(transformPrismaQuote);
    } catch (error) {
      logger.error('Failed to find quotes with pagination', { error, offset, limit, orderBy });
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to retrieve quotes',
        500,
        error
      );
    }
  }

  /**
   * Get total count of quotes
   */
  async count(): Promise<number> {
    try {
      return await this.prisma.quote.count();
    } catch (error) {
      logger.error('Failed to count quotes', { error });
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to count quotes',
        500,
        error
      );
    }
  }

  /**
   * Check if a quote exists by ID
   */
  async exists(id: string): Promise<boolean> {
    try {
      const count = await this.prisma.quote.count({
        where: { id },
      });
      return count > 0;
    } catch (error) {
      logger.error('Failed to check quote existence', { error, id });
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to check quote existence',
        500,
        error
      );
    }
  }

  /**
   * Find all quotes (used for similarity calculations)
   */
  async findAll(): Promise<Quote[]> {
    try {
      const quotes = await this.prisma.quote.findMany({
        orderBy: {
          likes: 'desc',
        },
      });

      return quotes.map(transformPrismaQuote);
    } catch (error) {
      logger.error('Failed to find all quotes', { error });
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to retrieve all quotes',
        500,
        error
      );
    }
  }

  /**
   * Get cached similarities for a quote
   */
  async getCachedSimilarities(quoteId: string, limit: number): Promise<SimilarityScore[]> {
    try {
      const similarities = await this.prisma.quoteSimilarity.findMany({
        where: {
          quoteId: quoteId,
        },
        include: {
          similarQuote: true,
        },
        orderBy: {
          similarityScore: 'desc',
        },
        take: limit,
      });

      return similarities.map(similarity => ({
        quote: transformPrismaQuote(similarity.similarQuote),
        score: parseFloat(similarity.similarityScore.toString()),
      }));
    } catch (error) {
      logger.error('Failed to get cached similarities', { error, quoteId, limit });
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to retrieve cached similarities',
        500,
        error
      );
    }
  }

  /**
   * Cache similarity results for a quote
   */
  async cacheSimilarities(quoteId: string, similarities: SimilarityScore[]): Promise<void> {
    try {
      // First, delete existing cached similarities for this quote
      await this.prisma.quoteSimilarity.deleteMany({
        where: {
          quoteId: quoteId,
        },
      });

      // Then, insert new similarities
      if (similarities.length > 0) {
        const similarityData = similarities.map(similarity => ({
          quoteId: quoteId,
          similarQuoteId: similarity.quote.id,
          similarityScore: similarity.score,
        }));

        await this.prisma.quoteSimilarity.createMany({
          data: similarityData,
        });
      }

      logger.debug('Cached similarities successfully', { 
        quoteId, 
        count: similarities.length 
      });
    } catch (error) {
      logger.error('Failed to cache similarities', { error, quoteId, count: similarities.length });
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to cache similarities',
        500,
        error
      );
    }
  }

  /**
   * Clear cached similarities for a quote (useful when quote is updated)
   */
  async clearCachedSimilarities(quoteId: string): Promise<void> {
    try {
      await this.prisma.quoteSimilarity.deleteMany({
        where: {
          OR: [
            { quoteId: quoteId },
            { similarQuoteId: quoteId },
          ],
        },
      });

      logger.debug('Cleared cached similarities', { quoteId });
    } catch (error) {
      logger.error('Failed to clear cached similarities', { error, quoteId });
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to clear cached similarities',
        500,
        error
      );
    }
  }
}