import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { ZodError, ZodSchema } from 'zod';
import { ErrorCode, QuoteServiceError } from '../types';

/**
 * Validation middleware options
 */
export interface ValidationOptions {
  params?: ZodSchema;
  query?: ZodSchema;
  body?: ZodSchema;
  response?: ZodSchema;
}

/**
 * Transform Zod validation errors into a standardized format
 */
export function transformZodError(error: ZodError): {
  code: ErrorCode;
  message: string;
  details: Array<{
    field: string;
    message: string;
    code: string;
    received?: unknown;
  }>;
} {
  const details = error.issues.map(issue => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
    code: issue.code,
    received: 'received' in issue ? issue.received : undefined,
  }));

  return {
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Validation failed',
    details,
  };
}

/**
 * Create validation middleware for Fastify routes
 */
export function createValidationMiddleware(options: ValidationOptions) {
  return async function validationMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    try {
      // Validate request parameters
      if (options.params) {
        request.params = options.params.parse(request.params);
      }

      // Validate query parameters
      if (options.query) {
        request.query = options.query.parse(request.query);
      }

      // Validate request body
      if (options.body) {
        request.body = options.body.parse(request.body);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = transformZodError(error);
        
        request.log.warn('Request validation failed', {
          path: request.url,
          method: request.method,
          errors: validationError.details,
        });

        return reply.code(400).send({
          error: validationError,
          statusCode: 400,
          timestamp: new Date().toISOString(),
          path: request.url,
        });
      }

      // Re-throw non-validation errors
      throw error;
    }
  };
}

/**
 * Validate response data (for development/testing)
 */
export function validateResponse<T>(
  schema: ZodSchema<T>,
  data: unknown,
  request?: FastifyRequest
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = transformZodError(error);
      
      if (request) {
        request.log.error('Response validation failed', {
          path: request.url,
          method: request.method,
          errors: validationError.details,
          responseData: data,
        });
      }

      // In development, throw detailed error
      if (process.env.NODE_ENV === 'development') {
        throw new QuoteServiceError(
          ErrorCode.VALIDATION_ERROR,
          `Response validation failed: ${validationError.message}`,
          500,
          validationError.details
        );
      }

      // In production, throw generic error to avoid exposing internals
      throw new QuoteServiceError(
        ErrorCode.DATABASE_ERROR,
        'Internal server error',
        500
      );
    }

    throw error;
  }
}

/**
 * Fastify plugin for automatic validation
 */
export async function validationPlugin(fastify: FastifyInstance) {
  // Add validation helper to Fastify instance
  fastify.decorate('validate', createValidationMiddleware);
  
  // Add response validation helper
  fastify.decorate('validateResponse', validateResponse);

  // Add validation error transformer
  fastify.decorate('transformZodError', transformZodError);
}

/**
 * Validation decorator for route handlers
 */
export function withValidation(options: ValidationOptions) {
  return function decorator(
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      request: FastifyRequest,
      reply: FastifyReply
    ) {
      // Apply validation middleware
      await createValidationMiddleware(options)(request, reply);
      
      // If reply was already sent (validation failed), return early
      if (reply.sent) {
        return;
      }

      // Call original method
      return originalMethod.call(this, request, reply);
    };

    return descriptor;
  };
}

/**
 * Utility function to create typed request interfaces
 */
export interface ValidatedRequest<
  TParams = unknown,
  TQuery = unknown,
  TBody = unknown
> extends FastifyRequest {
  params: TParams;
  query: TQuery;
  body: TBody;
}

/**
 * Type-safe validation helper
 */
export function createTypedValidation<
  TParams = unknown,
  TQuery = unknown,
  TBody = unknown
>(options: {
  params?: ZodSchema<TParams>;
  query?: ZodSchema<TQuery>;
  body?: ZodSchema<TBody>;
}) {
  return {
    middleware: createValidationMiddleware(options),
    types: {} as ValidatedRequest<TParams, TQuery, TBody>,
  };
}