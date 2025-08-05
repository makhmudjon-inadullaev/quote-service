import { z, ZodError, ZodSchema } from 'zod';
import { GraphQLError } from 'graphql';
import { 
  GraphQLQuoteIdInputSchema, 
  GraphQLSimilarQuotesInputSchema
} from '../schemas/validation';
import { transformZodError } from '../middleware/validation';

/**
 * GraphQL validation error class
 */
export class GraphQLValidationError extends GraphQLError {
  constructor(message: string, details?: unknown) {
    super(message, {
      extensions: {
        code: 'VALIDATION_ERROR',
        details,
      },
    });
  }
}

/**
 * Validate GraphQL input arguments
 */
export function validateGraphQLInput<T>(
  schema: ZodSchema<T>,
  input: unknown,
  operationName?: string
): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = transformZodError(error);
      
      const errorMessage = operationName 
        ? `Validation failed for ${operationName}: ${validationError.message}`
        : `Validation failed: ${validationError.message}`;

      throw new GraphQLValidationError(errorMessage, validationError.details);
    }
    
    throw error;
  }
}

/**
 * Validation helpers for specific GraphQL operations
 */
export const GraphQLValidators = {
  /**
   * Validate quote ID input for queries and mutations
   */
  validateQuoteId(args: { id?: unknown }, operationName: string) {
    return validateGraphQLInput(
      GraphQLQuoteIdInputSchema,
      args,
      operationName
    );
  },

  /**
   * Validate similar quotes input
   */
  validateSimilarQuotesInput(args: { id?: unknown; limit?: unknown }, operationName: string) {
    return validateGraphQLInput(
      GraphQLSimilarQuotesInputSchema,
      args,
      operationName
    );
  },

  /**
   * Validate that a string is not empty or just whitespace
   */
  validateNonEmptyString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new GraphQLValidationError(`${fieldName} must be a string`);
    }
    
    if (value.trim().length === 0) {
      throw new GraphQLValidationError(`${fieldName} cannot be empty`);
    }
    
    return value.trim();
  },

  /**
   * Validate UUID format
   */
  validateUUID(value: unknown, fieldName: string): string {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (typeof value !== 'string') {
      throw new GraphQLValidationError(`${fieldName} must be a string`);
    }
    
    if (!uuidRegex.test(value)) {
      throw new GraphQLValidationError(`${fieldName} must be a valid UUID`);
    }
    
    return value;
  },

  /**
   * Validate integer within range
   */
  validateIntegerRange(
    value: unknown, 
    fieldName: string, 
    min?: number, 
    max?: number
  ): number {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new GraphQLValidationError(`${fieldName} must be an integer`);
    }
    
    if (min !== undefined && value < min) {
      throw new GraphQLValidationError(`${fieldName} must be at least ${min}`);
    }
    
    if (max !== undefined && value > max) {
      throw new GraphQLValidationError(`${fieldName} cannot exceed ${max}`);
    }
    
    return value;
  },
};

/**
 * Decorator for GraphQL resolver validation
 */
export function validateArgs<T>(schema: ZodSchema<T>, operationName?: string) {
  return function decorator(
    _target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (parent: unknown, args: unknown, context: unknown, info: unknown) {
      // Validate arguments
      const validatedArgs = validateGraphQLInput(schema, args, operationName || propertyKey);
      
      // Call original method with validated arguments
      return originalMethod.call(this, parent, validatedArgs, context, info);
    };

    return descriptor;
  };
}

/**
 * Utility to create GraphQL field validation
 */
export function createFieldValidator<T>(schema: ZodSchema<T>) {
  return (value: unknown, fieldName: string): T => {
    try {
      return schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = transformZodError(error);
        throw new GraphQLValidationError(
          `Invalid ${fieldName}: ${validationError.message}`,
          validationError.details
        );
      }
      throw error;
    }
  };
}

/**
 * Common GraphQL input validation schemas
 */
export const CommonGraphQLValidations = {
  id: z.string().uuid('ID must be a valid UUID'),
  limit: z.number().int().min(1).max(50).default(10),
  offset: z.number().int().min(0).default(0),
  search: z.string().min(1).max(100).optional(),
} as const;