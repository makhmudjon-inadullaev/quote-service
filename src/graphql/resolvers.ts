import { FastifyRequest } from 'fastify';
import { QuoteService } from '../services/QuoteService';
import { Quote, SimilarityScore } from '../types';
import { logger } from '../config/logger';
import { GraphQLValidators } from './validation';
import { withGraphQLErrorHandling } from './errorHandler';

export interface GraphQLContext {
  quoteService: QuoteService;
  request: FastifyRequest;
}

export interface QueryResolvers {
  randomQuote: (parent: unknown, args: unknown, context: GraphQLContext) => Promise<Quote>;
  quote: (parent: unknown, args: { id: string }, context: GraphQLContext) => Promise<Quote | null>;
  similarQuotes: (parent: unknown, args: { id: string; limit?: number }, context: GraphQLContext) => Promise<SimilarityScore[]>;
}

export interface MutationResolvers {
  likeQuote: (parent: unknown, args: { id: string }, context: GraphQLContext) => Promise<Quote>;
}

export interface QuoteResolvers {
  createdAt: (parent: Quote) => string;
  updatedAt: (parent: Quote) => string;
}

export interface Resolvers {
  Query: QueryResolvers;
  Mutation: MutationResolvers;
  Quote: QuoteResolvers;
}

export const resolvers: Resolvers = {
  Quote: {
    createdAt: (parent) => parent.createdAt.toISOString(),
    updatedAt: (parent) => parent.updatedAt.toISOString(),
  },

  Query: {
    randomQuote: withGraphQLErrorHandling(async (_parent, _args, context) => {
      logger.info('GraphQL randomQuote query requested');
      const quote = await context.quoteService.getRandomQuote();
      logger.info('GraphQL randomQuote query completed', { 
        id: quote.id, 
        author: quote.author,
        source: quote.source 
      });
      return quote;
    }, 'randomQuote'),

    quote: withGraphQLErrorHandling(async (_parent, args, context) => {
      // Validate input arguments
      const validatedArgs = GraphQLValidators.validateQuoteId(args, 'quote');
      
      logger.info('GraphQL quote query requested', { id: validatedArgs.id });

      const quote = await context.quoteService.getQuoteById(validatedArgs.id);
      
      if (!quote) {
        logger.info('GraphQL quote query - quote not found', { id: validatedArgs.id });
        return null;
      }

      logger.info('GraphQL quote query completed', { 
        id: quote.id, 
        author: quote.author 
      });
      
      return quote;
    }, 'quote'),

    similarQuotes: withGraphQLErrorHandling(async (_parent, args, context) => {
      // Validate input arguments
      const validatedArgs = GraphQLValidators.validateSimilarQuotesInput(args, 'similarQuotes');
      
      logger.info('GraphQL similarQuotes query requested', { 
        id: validatedArgs.id, 
        limit: validatedArgs.limit 
      });

      const similarities = await context.quoteService.getSimilarQuotes(
        validatedArgs.id, 
        validatedArgs.limit
      );
      
      logger.info('GraphQL similarQuotes query completed', { 
        id: validatedArgs.id, 
        count: similarities.length,
        limit: validatedArgs.limit 
      });
      
      return similarities;
    }, 'similarQuotes'),
  },

  Mutation: {
    likeQuote: withGraphQLErrorHandling(async (_parent, args, context) => {
      // Validate input arguments
      const validatedArgs = GraphQLValidators.validateQuoteId(args, 'likeQuote');
      
      logger.info('GraphQL likeQuote mutation requested', { id: validatedArgs.id });

      const updatedQuote = await context.quoteService.likeQuote(validatedArgs.id);
      
      logger.info('GraphQL likeQuote mutation completed', { 
        id: updatedQuote.id, 
        newLikes: updatedQuote.likes,
        author: updatedQuote.author 
      });
      
      return updatedQuote;
    }, 'likeQuote'),
  },
};