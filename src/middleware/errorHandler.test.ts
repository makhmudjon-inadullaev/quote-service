import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { ZodError, z } from 'zod';
import {
  globalErrorHandler,
  notFoundHandler,
  createErrorResponse,
  createApplicationError,
  asyncHandler
} from './errorHandler';
import { ErrorCode, QuoteServiceError } from '../types';

// Mock Fastify request and reply
const createMockRequest = (overrides: Partial<FastifyRequest> = {}): FastifyRequest => ({
  url: '/test',
  method: 'GET',
  id: 'req-123',
  ip: '127.0.0.1',
  headers: {
    'user-agent': 'test-agent',
  },
  log: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as any,
  ...overrides,
} as FastifyRequest);

const createMockReply = (): FastifyReply => {
  const reply = {
    code: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    sent: false,
    statusCode: 200,
    getHeader: jest.fn(),
    getResponseTime: jest.fn().mockReturnValue(100),
  } as any;
  return reply;
};

describe('Error Handler Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createErrorResponse', () => {
    it('should create standardized error response', () => {
      const request = createMockRequest();
      const error = {
        code: 'TEST_ERROR',
        message: 'Test error message',
        details: { field: 'test' },
      };

      const response = createErrorResponse(error, 400, request, 'req-123');

      expect(response).toEqual({
        error,
        statusCode: 400,
        timestamp: expect.any(String),
        path: '/test',
        requestId: 'req-123',
      });
    });

    it('should create response without requestId', () => {
      const request = createMockRequest();
      const error = {
        code: 'TEST_ERROR',
        message: 'Test error message',
      };

      const response = createErrorResponse(error, 500, request);

      expect(response.requestId).toBeUndefined();
    });
  });

  describe('globalErrorHandler', () => {
    it('should handle QuoteServiceError correctly', async () => {
      const request = createMockRequest();
      const reply = createMockReply();
      const error = new QuoteServiceError(
        ErrorCode.QUOTE_NOT_FOUND,
        'Quote not found',
        404,
        { id: '123' }
      );

      await globalErrorHandler(error as FastifyError, request, reply);

      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.QUOTE_NOT_FOUND,
          message: 'Quote not found',
          details: { id: '123' },
        },
        statusCode: 404,
        timestamp: expect.any(String),
        path: '/test',
        requestId: 'req-123',
      });
      expect(request.log.warn).toHaveBeenCalled();
    });

    it('should handle ZodError correctly', async () => {
      const request = createMockRequest();
      const reply = createMockReply();
      
      const schema = z.object({ id: z.string().uuid() });
      let zodError: ZodError;
      
      try {
        schema.parse({ id: 'invalid' });
      } catch (error) {
        zodError = error as ZodError;
      }

      await globalErrorHandler(zodError! as any, request, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            details: expect.any(Array),
          }),
          statusCode: 400,
        })
      );
    });

    it('should handle Fastify validation errors', async () => {
      const request = createMockRequest();
      const reply = createMockReply();
      const error = {
        validation: [{ instancePath: '/id', schemaPath: '#/properties/id/format', keyword: 'format', params: {}, message: 'Invalid format' }],
        validationContext: 'params',
        code: 'FST_ERR_VALIDATION',
        name: 'FastifyError',
        message: 'Validation failed'
      } as FastifyError;

      await globalErrorHandler(error, request, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Request validation failed',
          }),
          statusCode: 400,
        })
      );
    });

    it('should handle rate limiting errors', async () => {
      const request = createMockRequest();
      const reply = createMockReply();
      (reply.getHeader as jest.Mock).mockReturnValue('60');
      
      const error = { statusCode: 429 } as FastifyError;

      await globalErrorHandler(error, request, reply);

      expect(reply.code).toHaveBeenCalledWith(429);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.RATE_LIMIT_EXCEEDED,
            message: 'Rate limit exceeded. Please try again later.',
            details: { retryAfter: '60' },
          }),
          statusCode: 429,
        })
      );
    });

    it('should handle timeout errors', async () => {
      const request = createMockRequest();
      const reply = createMockReply();
      const error = { code: 'ETIMEDOUT', message: 'Request timeout' } as FastifyError;

      await globalErrorHandler(error, request, reply);

      expect(reply.code).toHaveBeenCalledWith(408);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.EXTERNAL_API_ERROR,
            message: 'Request timeout. Please try again.',
          }),
          statusCode: 408,
        })
      );
    });

    it('should handle payload too large errors', async () => {
      const request = createMockRequest({
        headers: { 'content-length': '10000000' },
      });
      const reply = createMockReply();
      const error = { statusCode: 413 } as FastifyError;

      await globalErrorHandler(error, request, reply);

      expect(reply.code).toHaveBeenCalledWith(413);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Request payload too large',
          }),
          statusCode: 413,
        })
      );
    });

    it('should handle not found errors', async () => {
      const request = createMockRequest();
      const reply = createMockReply();
      const error = { statusCode: 404 } as FastifyError;

      await globalErrorHandler(error, request, reply);

      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'ROUTE_NOT_FOUND',
            message: 'The requested resource was not found',
          }),
          statusCode: 404,
        })
      );
    });

    it('should handle method not allowed errors', async () => {
      const request = createMockRequest();
      const reply = createMockReply();
      const error = { statusCode: 405 } as FastifyError;

      await globalErrorHandler(error, request, reply);

      expect(reply.code).toHaveBeenCalledWith(405);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'METHOD_NOT_ALLOWED',
            message: 'HTTP method not allowed for this resource',
          }),
          statusCode: 405,
        })
      );
    });

    it('should handle unexpected errors', async () => {
      const request = createMockRequest();
      const reply = createMockReply();
      const error = new Error('Unexpected error') as FastifyError;

      await globalErrorHandler(error, request, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.DATABASE_ERROR,
            message: 'An unexpected error occurred',
          }),
          statusCode: 500,
        })
      );
      expect(request.log.error).toHaveBeenCalled();
    });

    it('should include error details in development mode', async () => {
      process.env.NODE_ENV = 'development';
      
      const request = createMockRequest();
      const reply = createMockReply();
      const error = new Error('Test error') as FastifyError;
      error.stack = 'Error stack trace';

      await globalErrorHandler(error, request, reply);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: expect.objectContaining({
              name: 'Error',
              message: 'Test error',
              stack: 'Error stack trace',
            }),
          }),
        })
      );
    });

    it('should not include error details in production mode', async () => {
      process.env.NODE_ENV = 'production';
      
      const request = createMockRequest();
      const reply = createMockReply();
      const error = new Error('Test error') as FastifyError;

      await globalErrorHandler(error, request, reply);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: undefined,
          }),
        })
      );
    });

    it('should not handle errors if reply was already sent', async () => {
      const request = createMockRequest();
      const reply = createMockReply();
      reply.sent = true;
      
      const error = new Error('Test error') as FastifyError;

      await globalErrorHandler(error, request, reply);

      expect(reply.code).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should use custom status code from error', async () => {
      const request = createMockRequest();
      const reply = createMockReply();
      const error = { statusCode: 422, message: 'Custom error' } as FastifyError;

      await globalErrorHandler(error, request, reply);

      expect(reply.code).toHaveBeenCalledWith(422);
    });
  });

  describe('notFoundHandler', () => {
    it('should handle not found routes', async () => {
      const request = createMockRequest({
        url: '/nonexistent',
        method: 'POST',
      });
      const reply = createMockReply();

      await notFoundHandler(request, reply);

      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: 'Route POST /nonexistent not found',
        },
        statusCode: 404,
        timestamp: expect.any(String),
        path: '/nonexistent',
        requestId: 'req-123',
      });
      expect(request.log.info).toHaveBeenCalled();
    });
  });

  describe('createApplicationError', () => {
    it('should create QuoteServiceError with correct status code', () => {
      const error = createApplicationError(
        ErrorCode.QUOTE_NOT_FOUND,
        'Quote not found',
        { id: '123' }
      );

      expect(error).toBeInstanceOf(QuoteServiceError);
      expect(error.code).toBe(ErrorCode.QUOTE_NOT_FOUND);
      expect(error.message).toBe('Quote not found');
      expect(error.statusCode).toBe(404);
      expect(error.details).toEqual({ id: '123' });
    });

    it('should use default status code for unknown error codes', () => {
      const error = createApplicationError(
        'UNKNOWN_ERROR' as ErrorCode,
        'Unknown error'
      );

      expect(error.statusCode).toBe(500);
    });
  });

  describe('asyncHandler', () => {
    it('should handle successful async operations', async () => {
      const handler = asyncHandler(async (value: string) => {
        return `processed: ${value}`;
      });

      const result = await handler('test');
      expect(result).toBe('processed: test');
    });

    it('should re-throw errors from async operations', async () => {
      const handler = asyncHandler(async () => {
        throw new Error('Async error');
      });

      await expect(handler()).rejects.toThrow('Async error');
    });

    it('should preserve error types', async () => {
      const customError = new QuoteServiceError(
        ErrorCode.QUOTE_NOT_FOUND,
        'Quote not found'
      );
      
      const handler = asyncHandler(async () => {
        throw customError;
      });

      await expect(handler()).rejects.toBe(customError);
    });
  });

  describe('Edge cases', () => {
    it('should handle errors without message', async () => {
      const request = createMockRequest();
      const reply = createMockReply();
      const error = { name: 'CustomError' } as FastifyError;

      await globalErrorHandler(error, request, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalled();
    });

    it('should handle errors with circular references', async () => {
      const request = createMockRequest();
      const reply = createMockReply();
      const error: any = { message: 'Circular error' };
      error.self = error;

      await globalErrorHandler(error as FastifyError, request, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalled();
    });

    it('should handle request without requestId', async () => {
      const request = createMockRequest();
      delete (request as any).requestId;
      delete (request as any).id;
      
      const reply = createMockReply();
      const error = new Error('Test error') as FastifyError;

      await globalErrorHandler(error, request, reply);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: undefined,
        })
      );
    });
  });
});