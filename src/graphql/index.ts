import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import mercurius from 'mercurius';
import { typeDefs } from './schema';
import { resolvers, GraphQLContext } from './resolvers';
import { QuoteService } from '../services/QuoteService';
import { QuoteRepository } from '../repositories/QuoteRepository';
import { ExternalAPIClient } from '../services/ExternalAPIClient';
import { logger } from '../config/logger';
import { PrismaClient } from '@prisma/client';
// import { createGraphQLErrorFormatter } from './errorHandler';

export interface GraphQLPluginOptions {
  quoteService?: QuoteService;
}

export const graphqlPlugin: FastifyPluginAsync<GraphQLPluginOptions> = async (
  fastify: FastifyInstance,
  options: GraphQLPluginOptions
) => {
  // Initialize services if not provided
  let quoteService = options.quoteService;
  if (!quoteService) {
    const prisma = new PrismaClient();
    const quoteRepository = new QuoteRepository(prisma);
    const externalAPIClient = new ExternalAPIClient();
    quoteService = new QuoteService(quoteRepository, externalAPIClient);
  }

  // Register Mercurius GraphQL plugin
  await fastify.register(mercurius, {
    schema: typeDefs,
    resolvers: resolvers as any,
    context: (request): GraphQLContext => ({
      quoteService,
      request,
    }),
    graphiql: process.env.NODE_ENV !== 'production',
    ide: process.env.NODE_ENV !== 'production',
    path: '/graphql',
    errorHandler: (error, request, reply) => {
      const requestBody = request.body as any;
      const requestId = (request as any).requestId || request.id;
      
      logger.error('GraphQL request error', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        query: requestBody?.query,
        variables: requestBody?.variables,
        operationName: requestBody?.operationName,
        requestId,
      });

      reply.code(200).send({
        data: null,
        errors: [{
          message: error.message,
          extensions: {
            code: 'INTERNAL_ERROR',
            requestId,
          },
        }],
      });
    },
  });

  logger.info('GraphQL plugin registered successfully', {
    path: '/graphql',
    graphiql: process.env.NODE_ENV !== 'production',
  });
};