import { GraphQLError, GraphQLFormattedError } from 'graphql';
import { FastifyRequest } from 'fastify';
import { ErrorCode, QuoteServiceError } from '../types';
import { GraphQLValidationError } from './validation';

/**
 * GraphQL error codes mapping
 */
export enum GraphQLErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  QUOTE_NOT_FOUND = 'QUOTE_NOT_FOUND',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
}

/**
 * GraphQL error extensions interface
 */
export interface GraphQLErrorExtensions {
  code: GraphQLErrorCode;
  details?: unknown;
  timestamp?: string;
  path?: string;
  requestId?: string;
}

/**
 * Create a standardized GraphQL error
 */
export function createGraphQLError(
  message: string,
  code: GraphQLErrorCode,
  details?: unknown,
  originalError?: Error
): GraphQLError {
  return new GraphQLError(message, {
    extensions: {
      code,
      details,
      timestamp: new Date().toISOString(),
    },
    originalError,
  });
}

/**
 * Format GraphQL errors for consistent response structure
 */
export function formatGraphQLError(
  error: GraphQLError,
  request?: FastifyRequest
): GraphQLFormattedError {
  const requestId = request ? (request as any).requestId || request.id : undefined;

  // Handle validation errors
  if (error instanceof GraphQLValidationError || error.extensions?.code === 'VALIDATION_ERROR') {
    if (request) {
      request.log.warn('GraphQL validation error', {
        message: error.message,
        details: error.extensions?.details,
        requestId,
        path: error.path,
      });
    }

    return {
      message: error.message,
      extensions: {
        code: GraphQLErrorCode.VALIDATION_ERROR,
        details: error.extensions?.details,
        timestamp: new Date().toISOString(),
        requestId,
      },
      locations: error.locations,
      path: error.path,
    };
  }

  // Handle application errors (QuoteServiceError)
  if (error.originalError instanceof QuoteServiceError) {
    const appError = error.originalError;
    const graphqlCode = mapApplicationErrorToGraphQL(appError.code);

    if (request) {
      request.log.warn('GraphQL application error', {
        code: appError.code,
        message: appError.message,
        details: appError.details,
        requestId,
        path: error.path,
      });
    }

    return {
      message: appError.message,
      extensions: {
        code: graphqlCode,
        details: appError.details,
        timestamp: new Date().toISOString(),
        requestId,
      },
      locations: error.locations,
      path: error.path,
    };
  }

  // Handle syntax errors (GraphQL parsing errors)
  if (error.extensions?.code === 'GRAPHQL_PARSE_FAILED' || 
      error.extensions?.code === 'GRAPHQL_VALIDATION_FAILED') {
    if (request) {
      request.log.warn('GraphQL syntax error', {
        message: error.message,
        requestId,
        path: error.path,
      });
    }

    return {
      message: 'GraphQL syntax error',
      extensions: {
        code: GraphQLErrorCode.VALIDATION_ERROR,
        details: {
          syntaxError: error.message,
        },
        timestamp: new Date().toISOString(),
        requestId,
      },
      locations: error.locations,
      path: error.path,
    };
  }

  // Handle rate limiting errors
  if (error.extensions?.code === 'RATE_LIMITED') {
    if (request) {
      request.log.warn('GraphQL rate limit exceeded', {
        message: error.message,
        requestId,
        path: error.path,
      });
    }

    return {
      message: 'Rate limit exceeded. Please try again later.',
      extensions: {
        code: GraphQLErrorCode.RATE_LIMIT_EXCEEDED,
        timestamp: new Date().toISOString(),
        requestId,
      },
      locations: error.locations,
      path: error.path,
    };
  }

  // Handle all other errors as internal errors
  if (request) {
    request.log.error('GraphQL internal error', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        extensions: error.extensions,
      },
      requestId,
      path: error.path,
    });
  }

  // In production, don't expose internal error details
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    message: isProduction ? 'An unexpected error occurred' : error.message,
    extensions: {
      code: GraphQLErrorCode.INTERNAL_ERROR,
      details: isProduction ? undefined : {
        originalMessage: error.message,
        stack: error.stack,
      },
      timestamp: new Date().toISOString(),
      requestId,
    },
    locations: error.locations,
    path: error.path,
  };
}

/**
 * Map application error codes to GraphQL error codes
 */
function mapApplicationErrorToGraphQL(errorCode: ErrorCode): GraphQLErrorCode {
  switch (errorCode) {
    case ErrorCode.QUOTE_NOT_FOUND:
      return GraphQLErrorCode.QUOTE_NOT_FOUND;
    case ErrorCode.EXTERNAL_API_ERROR:
      return GraphQLErrorCode.EXTERNAL_API_ERROR;
    case ErrorCode.VALIDATION_ERROR:
      return GraphQLErrorCode.VALIDATION_ERROR;
    case ErrorCode.RATE_LIMIT_EXCEEDED:
      return GraphQLErrorCode.RATE_LIMIT_EXCEEDED;
    case ErrorCode.DATABASE_ERROR:
    default:
      return GraphQLErrorCode.DATABASE_ERROR;
  }
}

/**
 * Create error formatter function for Mercurius
 */
export function createGraphQLErrorFormatter(request?: FastifyRequest) {
  return (error: GraphQLError): GraphQLFormattedError => {
    return formatGraphQLError(error, request);
  };
}

/**
 * GraphQL context error handler
 */
export function handleGraphQLContextError(
  error: unknown,
  operationName: string,
  request?: FastifyRequest
): never {
  const requestId = request ? (request as any).requestId || request.id : undefined;

  if (error instanceof QuoteServiceError) {
    if (request) {
      request.log.warn('GraphQL context error', {
        operation: operationName,
        code: error.code,
        message: error.message,
        requestId,
      });
    }
    
    throw createGraphQLError(
      error.message,
      mapApplicationErrorToGraphQL(error.code),
      error.details,
      error
    );
  }

  if (error instanceof GraphQLValidationError) {
    throw error; // Re-throw as-is
  }

  // Handle unexpected errors
  if (request) {
    request.log.error('Unexpected GraphQL context error', {
      operation: operationName,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
      requestId,
    });
  }

  throw createGraphQLError(
    'An unexpected error occurred',
    GraphQLErrorCode.INTERNAL_ERROR,
    process.env.NODE_ENV === 'development' ? error : undefined,
    error instanceof Error ? error : undefined
  );
}

/**
 * Utility to wrap GraphQL resolvers with error handling
 */
export function withGraphQLErrorHandling<TArgs extends any[], TReturn>(
  resolver: (...args: TArgs) => Promise<TReturn>,
  operationName: string
) {
  return async (...args: TArgs): Promise<TReturn> => {
    try {
      return await resolver(...args);
    } catch (error) {
      // Extract request from context if available
      const context = args[2] as any;
      const request = context?.request;
      
      handleGraphQLContextError(error, operationName, request);
    }
  };
}

/**
 * Create GraphQL error response for testing
 */
export function createGraphQLErrorResponse(
  errors: GraphQLFormattedError[],
  data?: any
) {
  return {
    errors,
    data: data || null,
  };
}