import { QuoteRepository, CreateQuoteData } from '../repositories/QuoteRepository';
import { ExternalAPIClient } from './ExternalAPIClient';
import { SimilarityEngine } from './SimilarityEngine';
import { cacheService } from './CacheService';
import { Quote, ExternalQuote, ErrorCode, QuoteServiceError, SimilarityScore } from '../types';
import { transformExternalQuoteInterface } from '../utils/quoteTransformers';
import { logger } from '../config/logger';

export interface QuoteServiceOptions {
  preferWeightedSelection?: boolean;
  fallbackToDatabase?: boolean;
  cacheExternalQuotes?: boolean;
}

export class QuoteService {
  private similarityEngine: SimilarityEngine;

  constructor(
    private quoteRepository: QuoteRepository,
    private externalAPIClient: ExternalAPIClient
  ) {
    this.similarityEngine = new SimilarityEngine();
  }

  /**
   * Get a random quote with external API integration and weighted selection
   * Implements requirements 1.1, 1.2, 4.1, 4.3, 4.4
   */
  async getRandomQuote(options: QuoteServiceOptions = {}): Promise<Quote> {
    const {
      preferWeightedSelection = true,
      fallbackToDatabase = true,
      cacheExternalQuotes = true
    } = options;

    try {
      // First, try to get a quote from external API
      let quote: Quote;
      
      try {
        const externalQuote = await this.externalAPIClient.fetchRandomQuote();
        const transformedQuote = transformExternalQuoteInterface(externalQuote);
        
        // Cache the external quote in database if enabled and return the cached version
        if (cacheExternalQuotes) {
          quote = await this.cacheExternalQuote(transformedQuote, externalQuote);
        } else {
          quote = transformedQuote;
        }
        
        logger.info('Retrieved quote from external API', { 
          source: quote.source, 
          author: quote.author,
          id: quote.id
        });
        
        return quote;
      } catch (externalError) {
        logger.warn('External API failed, attempting database fallback', { 
          error: externalError instanceof Error ? externalError.message : externalError 
        });
        
        if (!fallbackToDatabase) {
          // Re-throw the original external error without wrapping
          if (externalError instanceof QuoteServiceError) {
            throw externalError;
          }
          throw new QuoteServiceError(
            ErrorCode.EXTERNAL_API_ERROR,
            externalError instanceof Error ? externalError.message : 'External API error',
            503,
            externalError
          );
        }
        
        // Fallback to database with weighted selection
        const dbQuote = preferWeightedSelection 
          ? await this.quoteRepository.getWeightedRandom()
          : await this.quoteRepository.getRandom();
        
        if (!dbQuote) {
          throw new QuoteServiceError(
            ErrorCode.EXTERNAL_API_ERROR,
            'No quotes available from external API or database',
            503,
            { originalError: externalError }
          );
        }
        
        logger.info('Retrieved quote from database fallback', { 
          id: dbQuote.id, 
          author: dbQuote.author,
          likes: dbQuote.likes,
          weighted: preferWeightedSelection
        });
        
        return dbQuote;
      }
    } catch (error) {
      logger.error('Failed to get random quote', { error });
      
      if (error instanceof QuoteServiceError) {
        throw error;
      }
      
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to retrieve random quote',
        500,
        error
      );
    }
  }

  /**
   * Like a quote by incrementing its like count
   * Implements requirements 3.1, 3.3, 3.4, 3.5
   */
  async likeQuote(id: string): Promise<Quote> {
    try {
      // Validate quote ID format
      if (!id || typeof id !== 'string' || id.trim().length === 0) {
        throw new QuoteServiceError(
          ErrorCode.VALIDATION_ERROR,
          'Quote ID is required and must be a non-empty string',
          400,
          { id }
        );
      }

      // Check if quote exists before attempting to like it
      const exists = await this.quoteRepository.exists(id.trim());
      if (!exists) {
        throw new QuoteServiceError(
          ErrorCode.QUOTE_NOT_FOUND,
          'Quote not found',
          404,
          { id: id.trim() }
        );
      }

      // Increment the like count
      const updatedQuote = await this.quoteRepository.incrementLikes(id.trim());
      
      // Invalidate cache for this quote and random quotes since likes affect weighted selection
      await cacheService.invalidateQuote(updatedQuote.id);
      await cacheService.invalidateRandomQuotes();
      
      logger.info('Quote liked successfully', { 
        id: updatedQuote.id, 
        newLikes: updatedQuote.likes,
        author: updatedQuote.author
      });
      
      return updatedQuote;
    } catch (error) {
      logger.error('Failed to like quote', { error, id });
      
      if (error instanceof QuoteServiceError) {
        throw error;
      }
      
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to like quote',
        500,
        error
      );
    }
  }

  /**
   * Get a weighted random quote from database (used internally and for testing)
   */
  async getWeightedRandomQuote(excludeIds: string[] = []): Promise<Quote | null> {
    try {
      return await this.quoteRepository.getWeightedRandom({ excludeIds });
    } catch (error) {
      logger.error('Failed to get weighted random quote', { error, excludeIds });
      throw error;
    }
  }

  /**
   * Get a simple random quote from database (used internally and for testing)
   */
  async getSimpleRandomQuote(excludeIds: string[] = []): Promise<Quote | null> {
    try {
      return await this.quoteRepository.getRandom(excludeIds);
    } catch (error) {
      logger.error('Failed to get simple random quote', { error, excludeIds });
      throw error;
    }
  }

  /**
   * Cache an external quote in the database to avoid duplicates
   */
  private async cacheExternalQuote(quote: Quote, externalQuote: ExternalQuote): Promise<Quote> {
    try {
      // Determine external ID based on source
      let externalId: string | undefined;
      if (externalQuote._id) {
        externalId = externalQuote._id;
      } else if (externalQuote.id) {
        externalId = externalQuote.id.toString();
      }

      // Check if quote already exists in database
      if (externalId) {
        const existingQuote = await this.quoteRepository.findByExternalId(quote.source, externalId);
        if (existingQuote) {
          logger.debug('Quote already cached in database', { 
            id: existingQuote.id, 
            externalId,
            source: quote.source 
          });
          return existingQuote;
        }
      }

      // Create new quote in database
      const createData: CreateQuoteData = {
        text: quote.text,
        author: quote.author,
        tags: quote.tags,
        source: quote.source,
        externalId
      };

      const cachedQuote = await this.quoteRepository.create(createData);
      
      logger.debug('External quote cached in database', { 
        id: cachedQuote.id, 
        externalId,
        source: quote.source 
      });
      
      return cachedQuote;
    } catch (error) {
      // Don't fail the main operation if caching fails
      logger.warn('Failed to cache external quote, continuing with original', { 
        error: error instanceof Error ? error.message : error,
        source: quote.source
      });
      return quote;
    }
  }

  /**
   * Get quote by ID (utility method)
   */
  async getQuoteById(id: string): Promise<Quote | null> {
    try {
      if (!id || typeof id !== 'string' || id.trim().length === 0) {
        throw new QuoteServiceError(
          ErrorCode.VALIDATION_ERROR,
          'Quote ID is required and must be a non-empty string',
          400,
          { id }
        );
      }

      return await this.quoteRepository.findById(id.trim());
    } catch (error) {
      logger.error('Failed to get quote by ID', { error, id });
      
      if (error instanceof QuoteServiceError) {
        throw error;
      }
      
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to retrieve quote',
        500,
        error
      );
    }
  }

  /**
   * Check if a quote exists (utility method)
   */
  async quoteExists(id: string): Promise<boolean> {
    try {
      if (!id || typeof id !== 'string' || id.trim().length === 0) {
        return false;
      }

      return await this.quoteRepository.exists(id.trim());
    } catch (error) {
      logger.error('Failed to check quote existence', { error, id });
      return false;
    }
  }

  /**
   * Get similar quotes to a target quote
   * Implements requirements 5.1, 5.4, 5.5
   */
  async getSimilarQuotes(id: string, limit: number = 10): Promise<SimilarityScore[]> {
    try {
      // Validate input parameters
      if (!id || typeof id !== 'string' || id.trim().length === 0) {
        throw new QuoteServiceError(
          ErrorCode.VALIDATION_ERROR,
          'Quote ID is required and must be a non-empty string',
          400,
          { id }
        );
      }

      if (limit <= 0 || limit > 50) {
        throw new QuoteServiceError(
          ErrorCode.VALIDATION_ERROR,
          'Limit must be between 1 and 50',
          400,
          { limit }
        );
      }

      const trimmedId = id.trim();

      // Get the target quote
      const targetQuote = await this.quoteRepository.findById(trimmedId);
      if (!targetQuote) {
        throw new QuoteServiceError(
          ErrorCode.QUOTE_NOT_FOUND,
          'Quote not found',
          404,
          { id: trimmedId }
        );
      }

      // Check Redis cache first for performance optimization
      const cachedSimilarities = await cacheService.getSimilarQuotes(trimmedId);
      if (cachedSimilarities && cachedSimilarities.length > 0) {
        const limitedResults = cachedSimilarities.slice(0, limit);
        logger.debug('Retrieved similar quotes from Redis cache', { 
          targetId: trimmedId, 
          count: limitedResults.length 
        });
        return limitedResults;
      }

      // Get all quotes from database for similarity comparison
      const allQuotes = await this.quoteRepository.findAll();
      
      // Calculate similarities using the similarity engine
      const similarities = await this.similarityEngine.findSimilarQuotes(
        targetQuote,
        allQuotes,
        limit
      );

      // Cache the results in Redis for future requests
      await cacheService.setSimilarQuotes(trimmedId, similarities);

      logger.info('Found similar quotes', { 
        targetId: trimmedId, 
        targetAuthor: targetQuote.author,
        similarCount: similarities.length,
        limit 
      });

      return similarities;
    } catch (error) {
      logger.error('Failed to get similar quotes', { error, id, limit });
      
      if (error instanceof QuoteServiceError) {
        throw error;
      }
      
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Failed to retrieve similar quotes',
        500,
        error
      );
    }
  }


}