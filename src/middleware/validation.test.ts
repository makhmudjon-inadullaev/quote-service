import { FastifyRequest, FastifyReply } from 'fastify';
import { z, ZodError } from 'zod';
import {
  createValidationMiddleware,
  transformZodError,
  validateResponse,
  withValidation,
  ValidationOptions
} from './validation';
import { ErrorCode, QuoteServiceError } from '../types';

// Mock Fastify request and reply
const createMockRequest = (overrides: Partial<FastifyRequest> = {}): FastifyRequest => ({
  params: {},
  query: {},
  body: {},
  url: '/test',
  method: 'GET',
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
  } as any;
  return reply;
};

describe('Validation Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('transformZodError', () => {
    it('should transform Zod error to standardized format', () => {
      const schema = z.object({
        id: z.string().uuid(),
        name: z.string().min(1),
      });

      try {
        schema.parse({ id: 'invalid', name: '' });
      } catch (error) {
        if (error instanceof ZodError) {
          const transformed = transformZodError(error);
          
          expect(transformed.code).toBe(ErrorCode.VALIDATION_ERROR);
          expect(transformed.message).toBe('Validation failed');
          expect(transformed.details).toHaveLength(2);
          expect(transformed.details[0]).toMatchObject({
            field: 'id',
            code: 'invalid_string',
            message: expect.stringContaining('Invalid uuid'),
          });
          expect(transformed.details[1]).toMatchObject({
            field: 'name',
            code: 'too_small',
            message: expect.stringContaining('at least 1'),
          });
        }
      }
    });

    it('should handle nested field paths', () => {
      const schema = z.object({
        user: z.object({
          profile: z.object({
            email: z.string().email(),
          }),
        }),
      });

      try {
        schema.parse({ user: { profile: { email: 'invalid-email' } } });
      } catch (error) {
        if (error instanceof ZodError) {
          const transformed = transformZodError(error);
          expect(transformed.details[0].field).toBe('user.profile.email');
        }
      }
    });
  });

  describe('createValidationMiddleware', () => {
    const testSchema = z.object({
      id: z.string().uuid(),
    });

    it('should validate params successfully', async () => {
      const options: ValidationOptions = { params: testSchema };
      const middleware = createValidationMiddleware(options);
      
      const request = createMockRequest({
        params: { id: '123e4567-e89b-12d3-a456-426614174000' },
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
      expect(request.params).toEqual({ id: '123e4567-e89b-12d3-a456-426614174000' });
    });

    it('should validate query successfully', async () => {
      const querySchema = z.object({
        limit: z.coerce.number().int().min(1).max(50),
      });
      const options: ValidationOptions = { query: querySchema };
      const middleware = createValidationMiddleware(options);
      
      const request = createMockRequest({
        query: { limit: '10' },
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
      expect(request.query).toEqual({ limit: 10 });
    });

    it('should validate body successfully', async () => {
      const bodySchema = z.object({
        text: z.string().min(1),
        author: z.string().min(1),
      });
      const options: ValidationOptions = { body: bodySchema };
      const middleware = createValidationMiddleware(options);
      
      const request = createMockRequest({
        body: { text: 'Test quote', author: 'Test Author' },
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
      expect(request.body).toEqual({ text: 'Test quote', author: 'Test Author' });
    });

    it('should return 400 error for invalid params', async () => {
      const options: ValidationOptions = { params: testSchema };
      const middleware = createValidationMiddleware(options);
      
      const request = createMockRequest({
        params: { id: 'invalid-uuid' },
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Validation failed',
          details: expect.arrayContaining([
            expect.objectContaining({
              field: 'id',
              code: 'invalid_string',
            }),
          ]),
        },
        statusCode: 400,
        timestamp: expect.any(String),
        path: '/test',
      });
    });

    it('should log validation errors', async () => {
      const options: ValidationOptions = { params: testSchema };
      const middleware = createValidationMiddleware(options);
      
      const request = createMockRequest({
        params: { id: 'invalid-uuid' },
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(request.log.warn).toHaveBeenCalledWith(
        'Request validation failed',
        expect.objectContaining({
          path: '/test',
          method: 'GET',
          errors: expect.any(Array),
        })
      );
    });

    it('should re-throw non-Zod errors', async () => {
      const faultySchema = {
        parse: () => {
          throw new Error('Non-Zod error');
        },
      } as any;
      
      const options: ValidationOptions = { params: faultySchema };
      const middleware = createValidationMiddleware(options);
      
      const request = createMockRequest();
      const reply = createMockReply();

      await expect(middleware(request, reply)).rejects.toThrow('Non-Zod error');
    });
  });

  describe('validateResponse', () => {
    const responseSchema = z.object({
      id: z.string().uuid(),
      message: z.string(),
    });

    it('should validate valid response data', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        message: 'Success',
      };

      const result = validateResponse(responseSchema, validData);
      expect(result).toEqual(validData);
    });

    it('should throw QuoteServiceError for invalid response in development', () => {
      process.env.NODE_ENV = 'development';
      
      const invalidData = {
        id: 'invalid-uuid',
        message: 'Success',
      };

      expect(() => validateResponse(responseSchema, invalidData)).toThrow(QuoteServiceError);
      expect(() => validateResponse(responseSchema, invalidData)).toThrow('Response validation failed');
    });

    it('should throw generic error for invalid response in production', () => {
      process.env.NODE_ENV = 'production';
      
      const invalidData = {
        id: 'invalid-uuid',
        message: 'Success',
      };

      expect(() => validateResponse(responseSchema, invalidData)).toThrow(QuoteServiceError);
      expect(() => validateResponse(responseSchema, invalidData)).toThrow('Internal server error');
    });

    it('should log validation errors when request is provided', () => {
      process.env.NODE_ENV = 'development';
      
      const request = createMockRequest();
      const invalidData = {
        id: 'invalid-uuid',
        message: 'Success',
      };

      expect(() => validateResponse(responseSchema, invalidData, request)).toThrow();
      expect(request.log.error).toHaveBeenCalledWith(
        'Response validation failed',
        expect.objectContaining({
          path: '/test',
          method: 'GET',
          errors: expect.any(Array),
          responseData: invalidData,
        })
      );
    });

    it('should re-throw non-Zod errors', () => {
      const faultySchema = {
        parse: () => {
          throw new Error('Non-Zod error');
        },
      } as any;

      expect(() => validateResponse(faultySchema, {})).toThrow('Non-Zod error');
    });
  });

  describe('withValidation decorator', () => {
    it('should create a decorated method that validates input', async () => {
      const schema = z.object({
        id: z.string().uuid(),
      });
      
      class TestController {
        @withValidation({ params: schema })
        async testMethod(request: FastifyRequest, _reply: FastifyReply) {
          return { success: true, id: (request.params as any).id };
        }
      }

      const controller = new TestController();
      const request = createMockRequest({
        params: { id: '123e4567-e89b-12d3-a456-426614174000' },
      });
      const reply = createMockReply();

      const result = await controller.testMethod(request, reply);
      
      expect(result).toEqual({
        success: true,
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
    });

    it('should return early if validation fails', async () => {
      const schema = z.object({
        id: z.string().uuid(),
      });
      
      class TestController {
        @withValidation({ params: schema })
        async testMethod(_request: FastifyRequest, _reply: FastifyReply) {
          return { success: true };
        }
      }

      const controller = new TestController();
      const request = createMockRequest({
        params: { id: 'invalid-uuid' },
      });
      const reply = createMockReply();
      reply.sent = true; // Simulate reply being sent by validation

      const result = await controller.testMethod(request, reply);
      
      expect(result).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty validation options', async () => {
      const options: ValidationOptions = {};
      const middleware = createValidationMiddleware(options);
      
      const request = createMockRequest();
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should handle undefined request properties', async () => {
      const schema = z.object({
        id: z.string().uuid().optional(),
      });
      const options: ValidationOptions = { params: schema };
      const middleware = createValidationMiddleware(options);
      
      const request = createMockRequest({
        params: undefined as any,
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
    });

    it('should preserve original request properties when validation passes', async () => {
      const schema = z.object({
        id: z.string(),
      });
      const options: ValidationOptions = { params: schema };
      const middleware = createValidationMiddleware(options);
      
      const originalParams = { id: 'test-id', extra: 'value' };
      const request = createMockRequest({
        params: originalParams,
      });
      const reply = createMockReply();

      await middleware(request, reply);

      // Should only contain validated fields
      expect(request.params).toEqual({ id: 'test-id' });
    });
  });
});