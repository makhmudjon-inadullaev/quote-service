import { z } from 'zod';
import { GraphQLError } from 'graphql';
import {
  GraphQLValidationError,
  validateGraphQLInput,
  GraphQLValidators,
  validateArgs,
  createFieldValidator,
  CommonGraphQLValidations
} from './validation';

describe('GraphQL Validation', () => {
  describe('GraphQLValidationError', () => {
    it('should create GraphQL validation error with correct properties', () => {
      const details = [{ field: 'id', message: 'Invalid UUID', code: 'invalid_string' }];
      const error = new GraphQLValidationError('Validation failed', details);

      expect(error).toBeInstanceOf(GraphQLError);
      expect(error.message).toBe('Validation failed');
      expect(error.extensions?.code).toBe('VALIDATION_ERROR');
      expect(error.extensions?.details).toEqual(details);
    });

    it('should create error without details', () => {
      const error = new GraphQLValidationError('Simple validation error');

      expect(error.message).toBe('Simple validation error');
      expect(error.extensions?.code).toBe('VALIDATION_ERROR');
      expect(error.extensions?.details).toBeUndefined();
    });
  });

  describe('validateGraphQLInput', () => {
    const testSchema = z.object({
      id: z.string().uuid(),
      name: z.string().min(1),
    });

    it('should validate valid input successfully', () => {
      const validInput = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Name',
      };

      const result = validateGraphQLInput(testSchema, validInput);
      expect(result).toEqual(validInput);
    });

    it('should throw GraphQLValidationError for invalid input', () => {
      const invalidInput = {
        id: 'invalid-uuid',
        name: '',
      };

      expect(() => validateGraphQLInput(testSchema, invalidInput)).toThrow(GraphQLValidationError);
      expect(() => validateGraphQLInput(testSchema, invalidInput)).toThrow('Validation failed');
    });

    it('should include operation name in error message', () => {
      const invalidInput = { id: 'invalid-uuid' };

      expect(() => validateGraphQLInput(testSchema, invalidInput, 'getUser')).toThrow(
        'Validation failed for getUser'
      );
    });

    it('should include validation details in error', () => {
      const invalidInput = { id: 'invalid-uuid', name: '' };

      try {
        validateGraphQLInput(testSchema, invalidInput);
      } catch (error) {
        if (error instanceof GraphQLValidationError) {
          expect(error.extensions?.details).toHaveLength(2);
          expect((error.extensions?.details as any)[0]).toMatchObject({
            field: 'id',
            code: 'invalid_string',
          });
          expect((error.extensions?.details as any)[1]).toMatchObject({
            field: 'name',
            code: 'too_small',
          });
        }
      }
    });

    it('should re-throw non-Zod errors', () => {
      const faultySchema = {
        parse: () => {
          throw new Error('Non-Zod error');
        },
      } as any;

      expect(() => validateGraphQLInput(faultySchema, {})).toThrow('Non-Zod error');
    });
  });

  describe('GraphQLValidators', () => {
    describe('validateQuoteId', () => {
      it('should validate valid quote ID', () => {
        const args = { id: '123e4567-e89b-12d3-a456-426614174000' };
        const result = GraphQLValidators.validateQuoteId(args, 'testOperation');
        
        expect(result).toEqual(args);
      });

      it('should throw error for invalid UUID', () => {
        const args = { id: 'invalid-uuid' };
        
        expect(() => GraphQLValidators.validateQuoteId(args, 'testOperation')).toThrow(
          GraphQLValidationError
        );
        expect(() => GraphQLValidators.validateQuoteId(args, 'testOperation')).toThrow(
          'Validation failed for testOperation'
        );
      });

      it('should throw error for missing ID', () => {
        const args = {};
        
        expect(() => GraphQLValidators.validateQuoteId(args, 'testOperation')).toThrow(
          GraphQLValidationError
        );
      });
    });

    describe('validateSimilarQuotesInput', () => {
      it('should validate valid input with limit', () => {
        const args = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          limit: 15,
        };
        const result = GraphQLValidators.validateSimilarQuotesInput(args, 'similarQuotes');
        
        expect(result).toEqual(args);
      });

      it('should use default limit when not provided', () => {
        const args = { id: '123e4567-e89b-12d3-a456-426614174000' };
        const result = GraphQLValidators.validateSimilarQuotesInput(args, 'similarQuotes');
        
        expect(result.limit).toBe(10);
      });

      it('should throw error for invalid limit', () => {
        const args = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          limit: 0,
        };
        
        expect(() => GraphQLValidators.validateSimilarQuotesInput(args, 'similarQuotes')).toThrow(
          GraphQLValidationError
        );
      });
    });

    describe('validateNonEmptyString', () => {
      it('should validate non-empty string', () => {
        const result = GraphQLValidators.validateNonEmptyString('test string', 'testField');
        expect(result).toBe('test string');
      });

      it('should trim whitespace', () => {
        const result = GraphQLValidators.validateNonEmptyString('  test string  ', 'testField');
        expect(result).toBe('test string');
      });

      it('should throw error for non-string input', () => {
        expect(() => GraphQLValidators.validateNonEmptyString(123, 'testField')).toThrow(
          'testField must be a string'
        );
      });

      it('should throw error for empty string', () => {
        expect(() => GraphQLValidators.validateNonEmptyString('', 'testField')).toThrow(
          'testField cannot be empty'
        );
      });

      it('should throw error for whitespace-only string', () => {
        expect(() => GraphQLValidators.validateNonEmptyString('   ', 'testField')).toThrow(
          'testField cannot be empty'
        );
      });
    });

    describe('validateUUID', () => {
      it('should validate valid UUID', () => {
        const uuid = '123e4567-e89b-12d3-a456-426614174000';
        const result = GraphQLValidators.validateUUID(uuid, 'testField');
        expect(result).toBe(uuid);
      });

      it('should throw error for non-string input', () => {
        expect(() => GraphQLValidators.validateUUID(123, 'testField')).toThrow(
          'testField must be a string'
        );
      });

      it('should throw error for invalid UUID format', () => {
        expect(() => GraphQLValidators.validateUUID('invalid-uuid', 'testField')).toThrow(
          'testField must be a valid UUID'
        );
      });

      it('should throw error for empty string', () => {
        expect(() => GraphQLValidators.validateUUID('', 'testField')).toThrow(
          'testField must be a valid UUID'
        );
      });
    });

    describe('validateIntegerRange', () => {
      it('should validate integer within range', () => {
        const result = GraphQLValidators.validateIntegerRange(15, 'testField', 1, 50);
        expect(result).toBe(15);
      });

      it('should validate integer without range constraints', () => {
        const result = GraphQLValidators.validateIntegerRange(100, 'testField');
        expect(result).toBe(100);
      });

      it('should throw error for non-number input', () => {
        expect(() => GraphQLValidators.validateIntegerRange('15', 'testField')).toThrow(
          'testField must be an integer'
        );
      });

      it('should throw error for non-integer number', () => {
        expect(() => GraphQLValidators.validateIntegerRange(15.5, 'testField')).toThrow(
          'testField must be an integer'
        );
      });

      it('should throw error for value below minimum', () => {
        expect(() => GraphQLValidators.validateIntegerRange(0, 'testField', 1, 50)).toThrow(
          'testField must be at least 1'
        );
      });

      it('should throw error for value above maximum', () => {
        expect(() => GraphQLValidators.validateIntegerRange(51, 'testField', 1, 50)).toThrow(
          'testField cannot exceed 50'
        );
      });

      it('should allow value equal to minimum', () => {
        const result = GraphQLValidators.validateIntegerRange(1, 'testField', 1, 50);
        expect(result).toBe(1);
      });

      it('should allow value equal to maximum', () => {
        const result = GraphQLValidators.validateIntegerRange(50, 'testField', 1, 50);
        expect(result).toBe(50);
      });
    });
  });

  describe('validateArgs decorator', () => {
    const testSchema = z.object({
      id: z.string().uuid(),
      name: z.string().min(1),
    });

    it('should validate arguments and call original method', () => {
      class TestResolver {
        @validateArgs(testSchema, 'testOperation')
        testMethod(_parent: unknown, args: any, _context: unknown, _info: unknown) {
          return { success: true, args };
        }
      }

      const resolver = new TestResolver();
      const validArgs = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Name',
      };

      const result = resolver.testMethod(null, validArgs, null, null);
      expect(result).toEqual({ success: true, args: validArgs });
    });

    it('should throw validation error for invalid arguments', () => {
      class TestResolver {
        @validateArgs(testSchema, 'testOperation')
        testMethod(_parent: unknown, _args: any, _context: unknown, _info: unknown) {
          return { success: true };
        }
      }

      const resolver = new TestResolver();
      const invalidArgs = { id: 'invalid-uuid', name: '' };

      expect(() => resolver.testMethod(null, invalidArgs, null, null)).toThrow(
        GraphQLValidationError
      );
    });

    it('should use property key as operation name when not provided', () => {
      class TestResolver {
        @validateArgs(testSchema)
        testMethod(_parent: unknown, _args: any, _context: unknown, _info: unknown) {
          return { success: true };
        }
      }

      const resolver = new TestResolver();
      const invalidArgs = { id: 'invalid-uuid' };

      try {
        resolver.testMethod(null, invalidArgs, null, null);
      } catch (error) {
        if (error instanceof GraphQLValidationError) {
          expect(error.message).toContain('testMethod');
        }
      }
    });
  });

  describe('createFieldValidator', () => {
    const testSchema = z.string().uuid();

    it('should validate field successfully', () => {
      const validator = createFieldValidator(testSchema);
      const validValue = '123e4567-e89b-12d3-a456-426614174000';
      
      const result = validator(validValue, 'testField');
      expect(result).toBe(validValue);
    });

    it('should throw GraphQLValidationError for invalid field', () => {
      const validator = createFieldValidator(testSchema);
      
      expect(() => validator('invalid-uuid', 'testField')).toThrow(GraphQLValidationError);
      expect(() => validator('invalid-uuid', 'testField')).toThrow('Invalid testField');
    });

    it('should include validation details in error', () => {
      const complexSchema = z.object({
        id: z.string().uuid(),
        count: z.number().int().min(1),
      });
      const validator = createFieldValidator(complexSchema);
      
      try {
        validator({ id: 'invalid', count: 0 }, 'testField');
      } catch (error) {
        if (error instanceof GraphQLValidationError) {
          expect(error.extensions?.details).toHaveLength(2);
        }
      }
    });

    it('should re-throw non-Zod errors', () => {
      const faultySchema = {
        parse: () => {
          throw new Error('Non-Zod error');
        },
      } as any;
      const validator = createFieldValidator(faultySchema);

      expect(() => validator({}, 'testField')).toThrow('Non-Zod error');
    });
  });

  describe('CommonGraphQLValidations', () => {
    it('should export common validation schemas', () => {
      expect(CommonGraphQLValidations.id).toBeDefined();
      expect(CommonGraphQLValidations.limit).toBeDefined();
      expect(CommonGraphQLValidations.offset).toBeDefined();
      expect(CommonGraphQLValidations.search).toBeDefined();
    });

    it('should validate ID correctly', () => {
      const validId = '123e4567-e89b-12d3-a456-426614174000';
      const result = CommonGraphQLValidations.id.parse(validId);
      expect(result).toBe(validId);
    });

    it('should validate limit with default', () => {
      const result = CommonGraphQLValidations.limit.parse(undefined);
      expect(result).toBe(10);
    });

    it('should validate offset with default', () => {
      const result = CommonGraphQLValidations.offset.parse(undefined);
      expect(result).toBe(0);
    });

    it('should validate optional search', () => {
      const result = CommonGraphQLValidations.search.parse(undefined);
      expect(result).toBeUndefined();
      
      const searchResult = CommonGraphQLValidations.search.parse('test query');
      expect(searchResult).toBe('test query');
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle circular references in validation details', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;
      
      const error = new GraphQLValidationError('Test error', circularObj);
      expect(error.extensions?.details).toBe(circularObj);
    });

    it('should handle undefined and null inputs gracefully', () => {
      const schema = z.string().optional();
      
      expect(() => validateGraphQLInput(schema, undefined)).not.toThrow();
      expect(() => validateGraphQLInput(schema, null)).toThrow(GraphQLValidationError);
    });

    it('should handle complex nested validation errors', () => {
      const complexSchema = z.object({
        user: z.object({
          profile: z.object({
            settings: z.object({
              notifications: z.boolean(),
              theme: z.enum(['light', 'dark']),
            }),
          }),
        }),
      });

      const invalidInput = {
        user: {
          profile: {
            settings: {
              notifications: 'yes',
              theme: 'blue',
            },
          },
        },
      };

      try {
        validateGraphQLInput(complexSchema, invalidInput);
      } catch (error) {
        if (error instanceof GraphQLValidationError) {
          expect(error.extensions?.details).toHaveLength(2);
          expect((error.extensions?.details as any)[0].field).toBe('user.profile.settings.notifications');
          expect((error.extensions?.details as any)[1].field).toBe('user.profile.settings.theme');
        }
      }
    });
  });
});