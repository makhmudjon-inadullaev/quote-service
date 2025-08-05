import Fastify, { FastifyInstance } from 'fastify';
import { config } from './config/env';
import { initializeDatabase, disconnectDatabase } from './config/database';
import { errorHandlerPlugin } from './middleware/errorHandler';
import { validationPlugin } from './middleware/validation';
import { rateLimitPlugin } from './middleware/rateLimit';
import { performancePlugin } from './middleware/performance';
import { monitoringPlugin } from './monitoring/plugin';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV !== 'test' ? {
      level: config.LOG_LEVEL,
      transport: config.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      } : undefined,
    } : false,
    disableRequestLogging: config.NODE_ENV === 'test',
    trustProxy: config.TRUST_PROXY,
    bodyLimit: config.MAX_REQUEST_SIZE,
    keepAliveTimeout: config.KEEP_ALIVE_TIMEOUT,
    ...(config.NODE_ENV === 'production' && {
      ignoreTrailingSlash: true,
      caseSensitive: false,
    }),
  });

  // Register error handling middleware (must be first)
  await app.register(errorHandlerPlugin);

  // Register validation middleware
  await app.register(validationPlugin);

  // Register rate limiting middleware
  await app.register(rateLimitPlugin);

  // Register performance monitoring middleware
  await app.register(performancePlugin);

  // Register comprehensive monitoring plugin
  await app.register(monitoringPlugin);

  // Register CORS plugin with production-ready configuration
  await app.register(import('@fastify/cors'), {
    origin: config.CORS_ORIGIN ? 
      (config.CORS_ORIGIN.includes(',') ? 
        config.CORS_ORIGIN.split(',').map(origin => origin.trim()) : 
        config.CORS_ORIGIN) : 
      (config.NODE_ENV === 'production' ? false : true),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', config.REQUEST_ID_HEADER],
  });

  // Register helmet for security headers in production
  if (config.NODE_ENV === 'production') {
    await app.register(import('@fastify/helmet'), {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    });
  }

  // Register environment variables plugin
  await app.register(import('@fastify/env'), {
    confKey: 'config',
    schema: {
      type: 'object',
      required: [],
      properties: {
        NODE_ENV: { type: 'string' },
        PORT: { type: 'number' },
        HOST: { type: 'string' },
      },
    },
    data: config,
  });

  // Initialize database connection
  await initializeDatabase();

  // Register health check routes
  const { healthRoutes } = await import('./routes/health');
  await app.register(healthRoutes);

  // Graceful shutdown hook
  app.addHook('onClose', async (instance) => {
    instance.log.info('Closing application...');
    await disconnectDatabase();
    instance.log.info('Database connection closed');
  });

  // Register API routes
  await app.register(import('./routes/quotes'), { prefix: '/api/quotes' });

  // Register GraphQL API
  const { graphqlPlugin } = await import('./graphql');
  await app.register(graphqlPlugin);

  // Root endpoint with enhanced information
  app.get('/', async () => {
    return {
      name: 'Quote Service API',
      version: process.env.npm_package_version || '1.0.0',
      description: 'A web service that provides random quotes through REST and GraphQL APIs',
      environment: config.NODE_ENV,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/health',
        rest: '/api',
        graphql: '/graphql',
        ...(config.NODE_ENV === 'development' && {
          graphiql: '/graphiql',
        }),
      },
      features: {
        cors: config.CORS_ORIGIN ? 'configured' : 'permissive',
        rateLimit: 'enabled',
        caching: config.REDIS_URL ? 'redis' : 'memory',
        monitoring: config.METRICS_ENABLED ? 'enabled' : 'disabled',
      },
    };
  });

  return app;
}