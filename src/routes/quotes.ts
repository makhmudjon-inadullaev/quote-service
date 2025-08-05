import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { QuoteService } from '../services/QuoteService';
import { QuoteRepository } from '../repositories/QuoteRepository';
import { ExternalAPIClient } from '../services/ExternalAPIClient';
import { prisma } from '../config/database';
import { 
  RandomQuoteResponse, 
  LikeQuoteResponse, 
  SimilarQuotesResponse,
  QuoteServiceError,
  ErrorCode 
} from '../types';
import { 
  QuoteIdParamSchema,
  SimilarQuotesParamsSchema,
  SimilarQuotesQuerySchema,
  RandomQuoteResponseSchema,
  LikeQuoteResponseSchema,
  SimilarQuotesResponseSchema
} from '../schemas/validation';
import { createValidationMiddleware, validateResponse, ValidatedRequest } from '../middleware/validation';
import { v4 as uuidv4 } from 'uuid';

// Initialize services
const quoteRepository = new QuoteRepository(prisma);
const externalAPIClient = new ExternalAPIClient();
const quoteService = new QuoteService(quoteRepository, externalAPIClient);

export default async function quotesRoutes(fastify: FastifyInstance) {
  // GET /api/quotes/random - Get a random quote
  fastify.get('/random', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const requestId = uuidv4();
      
      // Add request ID to logger context
      request.log.info('Random quote request received', { requestId });
      
      const quote = await quoteService.getRandomQuote();
      
      const response: RandomQuoteResponse = {
        quote,
        requestId
      };

      // Validate response in development
      if (process.env.NODE_ENV === 'development') {
        validateResponse(RandomQuoteResponseSchema, response, request);
      }
      
      request.log.info('Random quote request completed', { 
        requestId, 
        quoteId: quote.id,
        author: quote.author,
        source: quote.source
      });
      
      return reply.code(200).send(response);
    } catch (error) {
      return handleQuoteError(error, reply, request);
    }
  });

  // POST /api/quotes/:id/like - Like a quote
  fastify.post<{
    Params: { id: string }
  }>('/:id/like', {
    preHandler: createValidationMiddleware({
      params: QuoteIdParamSchema
    })
  }, async (request: ValidatedRequest<{ id: string }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      
      request.log.info('Like quote request received', { quoteId: id });
      
      const quote = await quoteService.likeQuote(id);
      
      const response: LikeQuoteResponse = {
        quote,
        success: true
      };

      // Validate response in development
      if (process.env.NODE_ENV === 'development') {
        validateResponse(LikeQuoteResponseSchema, response, request);
      }
      
      request.log.info('Quote liked successfully', { 
        quoteId: id,
        newLikes: quote.likes,
        author: quote.author
      });
      
      return reply.code(200).send(response);
    } catch (error) {
      return handleQuoteError(error, reply, request);
    }
  });

  // GET /api/quotes/:id/similar - Get similar quotes
  fastify.get<{
    Params: { id: string },
    Querystring: { limit?: number }
  }>('/:id/similar', {
    preHandler: createValidationMiddleware({
      params: SimilarQuotesParamsSchema,
      query: SimilarQuotesQuerySchema
    })
  }, async (request: ValidatedRequest<{ id: string }, { limit?: number }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { limit } = request.query;
      
      request.log.info('Similar quotes request received', { quoteId: id, limit });
      
      const similarities = await quoteService.getSimilarQuotes(id, limit);
      
      const response: SimilarQuotesResponse = {
        quotes: similarities,
        totalCount: similarities.length
      };

      // Validate response in development
      if (process.env.NODE_ENV === 'development') {
        validateResponse(SimilarQuotesResponseSchema, response, request);
      }
      
      request.log.info('Similar quotes request completed', { 
        quoteId: id,
        limit,
        foundCount: similarities.length
      });
      
      return reply.code(200).send(response);
    } catch (error) {
      return handleQuoteError(error, reply, request);
    }
  });
}

/**
 * Centralized error handling for quote routes
 */
function handleQuoteError(error: unknown, reply: FastifyReply, request: FastifyRequest) {
  // Don't handle errors if reply was already sent (e.g., by validation middleware)
  if (reply.sent) {
    return;
  }

  if (error instanceof QuoteServiceError) {
    request.log.warn('Quote service error', {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      details: error.details
    });
    
    return reply.code(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      },
      statusCode: error.statusCode,
      timestamp: new Date().toISOString(),
      path: request.url
    });
  }
  
  // Handle Zod validation errors (fallback - should be handled by middleware)
  if (error && typeof error === 'object' && 'issues' in error) {
    request.log.warn('Validation error', { error });
    
    return reply.code(400).send({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: (error as any).issues
      },
      statusCode: 400,
      timestamp: new Date().toISOString(),
      path: request.url
    });
  }
  
  // Handle unexpected errors
  request.log.error('Unexpected error in quote route', { error });
  
  return reply.code(500).send({
    error: {
      code: ErrorCode.DATABASE_ERROR,
      message: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    },
    statusCode: 500,
    timestamp: new Date().toISOString(),
    path: request.url
  });
}