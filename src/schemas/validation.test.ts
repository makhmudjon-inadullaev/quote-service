import {
  QuoteSchema,
  ExternalQuoteSchema,
  SimilarityScoreSchema,
  QuoteIdParamSchema,

  SimilarQuotesQuerySchema,
  RandomQuoteResponseSchema,
  LikeQuoteResponseSchema,
  SimilarQuotesResponseSchema,
  GraphQLQuoteIdInputSchema,
  GraphQLSimilarQuotesInputSchema,
  ErrorResponseSchema,
  ValidationErrorResponseSchema,
  CreateQuoteRequestSchema,
  UpdateQuoteRequestSchema,
  VALIDATION_CONSTANTS
} from './validation';

describe('Validation Schemas', () => {
  describe('QuoteSchema', () => {
    const validQuote = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      text: 'This is a test quote',
      author: 'Test Author',
      tags: ['wisdom', 'inspiration'],
      likes: 5,
      source: 'quotable' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should validate a valid quote', () => {
      expect(() => QuoteSchema.parse(validQuote)).not.toThrow();
    });

    it('should reject invalid UUID', () => {
      const invalidQuote = { ...validQuote, id: 'invalid-uuid' };
      expect(() => QuoteSchema.parse(invalidQuote)).toThrow('Must be a valid UUID');
    });

    it('should reject empty text', () => {
      const invalidQuote = { ...validQuote, text: '' };
      expect(() => QuoteSchema.parse(invalidQuote)).toThrow('Quote text cannot be empty');
    });

    it('should reject text that is too long', () => {
      const invalidQuote = { ...validQuote, text: 'a'.repeat(1001) };
      expect(() => QuoteSchema.parse(invalidQuote)).toThrow('Quote text cannot exceed 1000 characters');
    });

    it('should reject empty author', () => {
      const invalidQuote = { ...validQuote, author: '' };
      expect(() => QuoteSchema.parse(invalidQuote)).toThrow('Author cannot be empty');
    });

    it('should reject author that is too long', () => {
      const invalidQuote = { ...validQuote, author: 'a'.repeat(256) };
      expect(() => QuoteSchema.parse(invalidQuote)).toThrow('Author cannot exceed 255 characters');
    });

    it('should reject negative likes', () => {
      const invalidQuote = { ...validQuote, likes: -1 };
      expect(() => QuoteSchema.parse(invalidQuote)).toThrow('Likes must be non-negative');
    });

    it('should reject invalid source', () => {
      const invalidQuote = { ...validQuote, source: 'invalid' as any };
      expect(() => QuoteSchema.parse(invalidQuote)).toThrow('Source must be one of: quotable, dummyjson, internal');
    });

    it('should reject too many tags', () => {
      const invalidQuote = { ...validQuote, tags: Array(11).fill('tag') };
      expect(() => QuoteSchema.parse(invalidQuote)).toThrow('Cannot have more than 10 tags');
    });

    it('should reject tags that are too long', () => {
      const invalidQuote = { ...validQuote, tags: ['a'.repeat(51)] };
      expect(() => QuoteSchema.parse(invalidQuote)).toThrow('Tag cannot exceed 50 characters');
    });

    it('should accept quote without tags', () => {
      const quoteWithoutTags = { ...validQuote, tags: undefined };
      expect(() => QuoteSchema.parse(quoteWithoutTags)).not.toThrow();
    });
  });

  describe('ExternalQuoteSchema', () => {
    it('should validate quotable.io format', () => {
      const quotableQuote = {
        _id: '123',
        content: 'Test quote',
        author: 'Test Author',
        tags: ['wisdom']
      };
      expect(() => ExternalQuoteSchema.parse(quotableQuote)).not.toThrow();
    });

    it('should validate dummyjson format', () => {
      const dummyQuote = {
        id: 123,
        quote: 'Test quote',
        author: 'Test Author',
        tags: ['wisdom']
      };
      expect(() => ExternalQuoteSchema.parse(dummyQuote)).not.toThrow();
    });

    it('should reject quote without proper format', () => {
      const invalidQuote = {
        author: 'Test Author',
        tags: ['wisdom']
      };
      expect(() => ExternalQuoteSchema.parse(invalidQuote)).toThrow(
        'External quote must have either quotable.io format (_id, content) or dummyjson format (id, quote)'
      );
    });

    it('should reject quote without author', () => {
      const invalidQuote = {
        _id: '123',
        content: 'Test quote'
      };
      expect(() => ExternalQuoteSchema.parse(invalidQuote)).toThrow();
    });
  });

  describe('SimilarityScoreSchema', () => {
    const validQuote = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      text: 'Test quote',
      author: 'Test Author',
      likes: 0,
      source: 'quotable' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should validate valid similarity score', () => {
      const validSimilarity = {
        quote: validQuote,
        score: 0.85
      };
      expect(() => SimilarityScoreSchema.parse(validSimilarity)).not.toThrow();
    });

    it('should reject negative score', () => {
      const invalidSimilarity = {
        quote: validQuote,
        score: -0.1
      };
      expect(() => SimilarityScoreSchema.parse(invalidSimilarity)).toThrow('Similarity score must be non-negative');
    });

    it('should reject score greater than 1', () => {
      const invalidSimilarity = {
        quote: validQuote,
        score: 1.1
      };
      expect(() => SimilarityScoreSchema.parse(invalidSimilarity)).toThrow('Similarity score cannot exceed 1');
    });
  });

  describe('Parameter Validation Schemas', () => {
    describe('QuoteIdParamSchema', () => {
      it('should validate valid UUID', () => {
        const validParams = { id: '123e4567-e89b-12d3-a456-426614174000' };
        expect(() => QuoteIdParamSchema.parse(validParams)).not.toThrow();
      });

      it('should reject invalid UUID', () => {
        const invalidParams = { id: 'invalid-uuid' };
        expect(() => QuoteIdParamSchema.parse(invalidParams)).toThrow('Must be a valid UUID');
      });
    });

    describe('SimilarQuotesQuerySchema', () => {
      it('should validate valid limit', () => {
        const validQuery = { limit: 10 };
        expect(() => SimilarQuotesQuerySchema.parse(validQuery)).not.toThrow();
      });

      it('should use default limit when not provided', () => {
        const result = SimilarQuotesQuerySchema.parse({});
        expect(result.limit).toBe(VALIDATION_CONSTANTS.DEFAULT_SIMILAR_QUOTES_LIMIT);
      });

      it('should coerce string to number', () => {
        const result = SimilarQuotesQuerySchema.parse({ limit: '15' });
        expect(result.limit).toBe(15);
      });

      it('should reject limit below minimum', () => {
        const invalidQuery = { limit: 0 };
        expect(() => SimilarQuotesQuerySchema.parse(invalidQuery)).toThrow('Limit must be at least 1');
      });

      it('should reject limit above maximum', () => {
        const invalidQuery = { limit: 51 };
        expect(() => SimilarQuotesQuerySchema.parse(invalidQuery)).toThrow('Limit cannot exceed 50');
      });

      it('should reject non-integer limit', () => {
        const invalidQuery = { limit: 10.5 };
        expect(() => SimilarQuotesQuerySchema.parse(invalidQuery)).toThrow('Limit must be an integer');
      });
    });
  });

  describe('GraphQL Input Schemas', () => {
    describe('GraphQLQuoteIdInputSchema', () => {
      it('should validate valid input', () => {
        const validInput = { id: '123e4567-e89b-12d3-a456-426614174000' };
        expect(() => GraphQLQuoteIdInputSchema.parse(validInput)).not.toThrow();
      });

      it('should reject invalid UUID', () => {
        const invalidInput = { id: 'invalid-uuid' };
        expect(() => GraphQLQuoteIdInputSchema.parse(invalidInput)).toThrow('Must be a valid UUID');
      });
    });

    describe('GraphQLSimilarQuotesInputSchema', () => {
      it('should validate valid input with limit', () => {
        const validInput = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          limit: 15
        };
        expect(() => GraphQLSimilarQuotesInputSchema.parse(validInput)).not.toThrow();
      });

      it('should use default limit when not provided', () => {
        const input = { id: '123e4567-e89b-12d3-a456-426614174000' };
        const result = GraphQLSimilarQuotesInputSchema.parse(input);
        expect(result.limit).toBe(VALIDATION_CONSTANTS.DEFAULT_SIMILAR_QUOTES_LIMIT);
      });

      it('should reject invalid UUID', () => {
        const invalidInput = { id: 'invalid-uuid', limit: 10 };
        expect(() => GraphQLSimilarQuotesInputSchema.parse(invalidInput)).toThrow('Must be a valid UUID');
      });

      it('should reject invalid limit', () => {
        const invalidInput = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          limit: 0
        };
        expect(() => GraphQLSimilarQuotesInputSchema.parse(invalidInput)).toThrow('Limit must be at least 1');
      });
    });
  });

  describe('Response Schemas', () => {
    const validQuote = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      text: 'Test quote',
      author: 'Test Author',
      likes: 0,
      source: 'quotable' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    describe('RandomQuoteResponseSchema', () => {
      it('should validate valid response', () => {
        const validResponse = {
          quote: validQuote,
          requestId: '123e4567-e89b-12d3-a456-426614174001'
        };
        expect(() => RandomQuoteResponseSchema.parse(validResponse)).not.toThrow();
      });

      it('should reject invalid requestId', () => {
        const invalidResponse = {
          quote: validQuote,
          requestId: 'invalid-uuid'
        };
        expect(() => RandomQuoteResponseSchema.parse(invalidResponse)).toThrow('Must be a valid UUID');
      });
    });

    describe('LikeQuoteResponseSchema', () => {
      it('should validate valid response', () => {
        const validResponse = {
          quote: validQuote,
          success: true
        };
        expect(() => LikeQuoteResponseSchema.parse(validResponse)).not.toThrow();
      });

      it('should reject non-boolean success', () => {
        const invalidResponse = {
          quote: validQuote,
          success: 'true' as any
        };
        expect(() => LikeQuoteResponseSchema.parse(invalidResponse)).toThrow();
      });
    });

    describe('SimilarQuotesResponseSchema', () => {
      it('should validate valid response', () => {
        const validResponse = {
          quotes: [{ quote: validQuote, score: 0.85 }],
          totalCount: 1
        };
        expect(() => SimilarQuotesResponseSchema.parse(validResponse)).not.toThrow();
      });

      it('should reject negative totalCount', () => {
        const invalidResponse = {
          quotes: [],
          totalCount: -1
        };
        expect(() => SimilarQuotesResponseSchema.parse(invalidResponse)).toThrow('Total count must be non-negative');
      });
    });
  });

  describe('Error Response Schemas', () => {
    describe('ErrorResponseSchema', () => {
      it('should validate valid error response', () => {
        const validError = {
          error: {
            code: 'QUOTE_NOT_FOUND',
            message: 'Quote not found',
            details: { id: '123' }
          },
          statusCode: 404,
          timestamp: new Date().toISOString(),
          path: '/api/quotes/123'
        };
        expect(() => ErrorResponseSchema.parse(validError)).not.toThrow();
      });

      it('should reject invalid status code', () => {
        const invalidError = {
          error: {
            code: 'ERROR',
            message: 'Error message'
          },
          statusCode: 999,
          timestamp: new Date().toISOString(),
          path: '/api/test'
        };
        expect(() => ErrorResponseSchema.parse(invalidError)).toThrow('Invalid HTTP status code');
      });

      it('should reject invalid timestamp', () => {
        const invalidError = {
          error: {
            code: 'ERROR',
            message: 'Error message'
          },
          statusCode: 400,
          timestamp: 'invalid-date',
          path: '/api/test'
        };
        expect(() => ErrorResponseSchema.parse(invalidError)).toThrow('Invalid timestamp format');
      });
    });

    describe('ValidationErrorResponseSchema', () => {
      it('should validate valid validation error response', () => {
        const validError = {
          error: {
            code: 'VALIDATION_ERROR' as const,
            message: 'Validation failed',
            details: [{
              field: 'id',
              message: 'Invalid UUID',
              code: 'invalid_string'
            }]
          },
          statusCode: 400 as const,
          timestamp: new Date().toISOString(),
          path: '/api/quotes/invalid'
        };
        expect(() => ValidationErrorResponseSchema.parse(validError)).not.toThrow();
      });
    });
  });

  describe('Request Schemas', () => {
    describe('CreateQuoteRequestSchema', () => {
      it('should validate valid create request', () => {
        const validRequest = {
          text: 'New quote text',
          author: 'New Author',
          tags: ['wisdom', 'inspiration']
        };
        expect(() => CreateQuoteRequestSchema.parse(validRequest)).not.toThrow();
      });

      it('should accept request without tags', () => {
        const validRequest = {
          text: 'New quote text',
          author: 'New Author'
        };
        expect(() => CreateQuoteRequestSchema.parse(validRequest)).not.toThrow();
      });

      it('should reject empty text', () => {
        const invalidRequest = {
          text: '',
          author: 'Author'
        };
        expect(() => CreateQuoteRequestSchema.parse(invalidRequest)).toThrow('Quote text cannot be empty');
      });
    });

    describe('UpdateQuoteRequestSchema', () => {
      it('should validate partial update', () => {
        const validRequest = {
          text: 'Updated text'
        };
        expect(() => UpdateQuoteRequestSchema.parse(validRequest)).not.toThrow();
      });

      it('should validate empty update', () => {
        const validRequest = {};
        expect(() => UpdateQuoteRequestSchema.parse(validRequest)).not.toThrow();
      });

      it('should reject invalid partial data', () => {
        const invalidRequest = {
          text: ''
        };
        expect(() => UpdateQuoteRequestSchema.parse(invalidRequest)).toThrow('Quote text cannot be empty');
      });
    });
  });

  describe('Validation Constants', () => {
    it('should export validation constants', () => {
      expect(VALIDATION_CONSTANTS.MAX_TEXT_LENGTH).toBe(1000);
      expect(VALIDATION_CONSTANTS.MAX_AUTHOR_LENGTH).toBe(255);
      expect(VALIDATION_CONSTANTS.MAX_TAG_LENGTH).toBe(50);
      expect(VALIDATION_CONSTANTS.MAX_TAGS_COUNT).toBe(10);
      expect(VALIDATION_CONSTANTS.MAX_SIMILAR_QUOTES_LIMIT).toBe(50);
      expect(VALIDATION_CONSTANTS.MIN_SIMILAR_QUOTES_LIMIT).toBe(1);
      expect(VALIDATION_CONSTANTS.DEFAULT_SIMILAR_QUOTES_LIMIT).toBe(10);
    });
  });
});