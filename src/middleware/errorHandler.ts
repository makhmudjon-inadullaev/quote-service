import { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { ErrorCode, QuoteServiceError } from '../types';
import { transformZodError } from './validation';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  statusCode: number;
  timestamp: string;
  path: string;
  requestId?: string;
}

/**
 * Error type mapping for different error scenarios
 */
const ERROR_TYPE_MAPPING = {
  [ErrorCode.QUOTE_NOT_FOUND]: 404,
  [ErrorCode.EXTERNAL_API_ERROR]: 503,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.DATABASE_ERROR]: 500,
} as const;

/**
 * Create standardized error response
 */
export function createErrorResponse(
  error: {
    code: string;
    message: string;
    details?: unknown;
  },
  statusCode: number,
  request: FastifyRequest,
  requestId?: string
): ErrorResponse {
  return {
    error,
    statusCode,
    timestamp: new Date().toISOString(),
    path: request.url,
    requestId,
  };
}

/**
 * Global error handler for Fastify
 */
export async function globalErrorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Don't handle if reply was already sent
  if (reply.sent) {
    return;
  }

  const requestId = (request as any).requestId || request.id;

  // Handle QuoteServiceError (our custom application errors)
  if (error instanceof QuoteServiceError) {
    const statusCode = ERROR_TYPE_MAPPING[error.code] || error.statusCode || 500;
    
    request.log.warn('Application error occurred', {
      code: error.code,
      message: error.message,
      statusCode,
      details: error.details,
      requestId,
      path: request.url,
      method: request.method,
    });

    const errorResponse = createErrorResponse(
      {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      statusCode,
      request,
      requestId
    );

    return reply.code(statusCode).send(errorResponse);
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const validationError = transformZodError(error);
    
    request.log.warn('Validation error occurred', {
      errors: validationError.details,
      requestId,
      path: request.url,
      method: request.method,
    });

    const errorResponse = createErrorResponse(
      validationError,
      400,
      request,
      requestId
    );

    return reply.code(400).send(errorResponse);
  }

  // Handle Fastify validation errors
  if (error.validation) {
    request.log.warn('Fastify validation error occurred', {
      validation: error.validation,
      validationContext: error.validationContext,
      requestId,
      path: request.url,
      method: request.method,
    });

    const errorResponse = createErrorResponse(
      {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: error.validation,
      },
      400,
      request,
      requestId
    );

    return reply.code(400).send(errorResponse);
  }

  // Handle rate limiting errors
  if (error.statusCode === 429) {
    request.log.warn('Rate limit exceeded', {
      requestId,
      path: request.url,
      method: request.method,
      ip: request.ip,
    });

    const errorResponse = createErrorResponse(
      {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Rate limit exceeded. Please try again later.',
        details: {
          retryAfter: reply.getHeader('retry-after') || '60',
        },
      },
      429,
      request,
      requestId
    );

    return reply.code(429).send(errorResponse);
  }

  // Handle timeout errors
  if (error.code === 'ETIMEDOUT' || error.statusCode === 408) {
    request.log.warn('Request timeout occurred', {
      requestId,
      path: request.url,
      method: request.method,
      timeout: error.message,
    });

    const errorResponse = createErrorResponse(
      {
        code: ErrorCode.EXTERNAL_API_ERROR,
        message: 'Request timeout. Please try again.',
      },
      408,
      request,
      requestId
    );

    return reply.code(408).send(errorResponse);
  }

  // Handle payload too large errors
  if (error.statusCode === 413) {
    request.log.warn('Payload too large', {
      requestId,
      path: request.url,
      method: request.method,
      contentLength: request.headers['content-length'],
    });

    const errorResponse = createErrorResponse(
      {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request payload too large',
      },
      413,
      request,
      requestId
    );

    return reply.code(413).send(errorResponse);
  }

  // Handle not found errors
  if (error.statusCode === 404) {
    request.log.info('Route not found', {
      requestId,
      path: request.url,
      method: request.method,
    });

    const errorResponse = createErrorResponse(
      {
        code: 'ROUTE_NOT_FOUND',
        message: 'The requested resource was not found',
      },
      404,
      request,
      requestId
    );

    return reply.code(404).send(errorResponse);
  }

  // Handle method not allowed errors
  if (error.statusCode === 405) {
    request.log.info('Method not allowed', {
      requestId,
      path: request.url,
      method: request.method,
    });

    const errorResponse = createErrorResponse(
      {
        code: 'METHOD_NOT_ALLOWED',
        message: 'HTTP method not allowed for this resource',
      },
      405,
      request,
      requestId
    );

    return reply.code(405).send(errorResponse);
  }

  // Handle all other errors as internal server errors
  const statusCode = error.statusCode || 500;
  
  request.log.error('Unexpected error occurred', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    requestId,
    path: request.url,
    method: request.method,
    statusCode,
  });

  const errorResponse = createErrorResponse(
    {
      code: ErrorCode.DATABASE_ERROR,
      message: 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    },
    statusCode,
    request,
    requestId
  );

  return reply.code(statusCode).send(errorResponse);
}

/**
 * Not found handler for unmatched routes
 */
export async function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId = (request as any).requestId || request.id;
  
  request.log.info('Route not found', {
    requestId,
    path: request.url,
    method: request.method,
  });

  const errorResponse = createErrorResponse(
    {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
    },
    404,
    request,
    requestId
  );

  return reply.code(404).send(errorResponse);
}

/**
 * Fastify plugin for error handling
 */
export async function errorHandlerPlugin(fastify: FastifyInstance) {
  // Register global error handler
  fastify.setErrorHandler(globalErrorHandler);
  
  // Register not found handler
  fastify.setNotFoundHandler(notFoundHandler);

  // Add request ID to all requests for better error tracking
  fastify.addHook('onRequest', async (request) => {
    if (!(request as any).requestId) {
      (request as any).requestId = request.id;
    }
  });

  // Log all requests for debugging
  fastify.addHook('onRequest', async (request) => {
    request.log.info('Request received', {
      requestId: (request as any).requestId,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
  });

  // Log response times
  fastify.addHook('onResponse', async (request, reply) => {
    const responseTime = reply.getResponseTime();
    
    request.log.info('Request completed', {
      requestId: (request as any).requestId,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: `${responseTime}ms`,
    });
  });
}

/**
 * Utility function to create application errors
 */
export function createApplicationError(
  code: ErrorCode,
  message: string,
  details?: unknown
): QuoteServiceError {
  const statusCode = ERROR_TYPE_MAPPING[code] || 500;
  return new QuoteServiceError(code, message, statusCode, details);
}

/**
 * Utility function to handle async route errors
 */
export function asyncHandler<T extends any[]>(
  handler: (...args: T) => Promise<any>
) {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (error) {
      // Let the global error handler deal with it
      throw error;
    }
  };
}