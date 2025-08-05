import { 
  transformQuotableResponse,
  transformDummyJSONResponse,
  transformExternalQuote,
  transformExternalQuoteInterface,
  sanitizeQuoteText,
  sanitizeAuthorName,
  sanitizeTags,
  transformAndValidateExternalQuote
} from './quoteTransformers';
import { ExternalQuote, ErrorCode, QuoteServiceError } from '../types';

// Mock uuid to make tests deterministic
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-123')
}));

describe('Quote Transformers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('transformQuotableResponse', () => {
    const validQuotableResponse = {
      _id: 'quotable-123',
      content: 'The only way to do great work is to love what you do.',
      author: 'Steve Jobs',
      tags: ['wisdom', 'work'],
      length: 52,
      dateAdded: '2021-01-01',
      dateModified: '2021-01-01'
    };

    it('should transform valid quotable.io response', () => {
      const result = transformQuotableResponse(validQuotableResponse);

      expect(result).toEqual({
        id: 'test-uuid-123',
        text: 'The only way to do great work is to love what you do.',
        author: 'Steve Jobs',
        tags: ['wisdom', 'work'],
        likes: 0,
        source: 'quotable',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });

    it('should handle response without tags', () => {
      const responseWithoutTags = {
        _id: 'quotable-123',
        content: 'Test quote',
        author: 'Test Author'
      };

      const result = transformQuotableResponse(responseWithoutTags);

      expect(result.tags).toEqual([]);
    });

    it('should throw QuoteServiceError for invalid response', () => {
      const invalidResponse = {
        _id: 'quotable-123',
        // missing content
        author: 'Steve Jobs'
      };

      expect(() => transformQuotableResponse(invalidResponse))
        .toThrow(QuoteServiceError);
      
      try {
        transformQuotableResponse(invalidResponse);
      } catch (error) {
        expect(error).toBeInstanceOf(QuoteServiceError);
        expect((error as QuoteServiceError).code).toBe(ErrorCode.VALIDATION_ERROR);
        expect((error as QuoteServiceError).statusCode).toBe(400);
      }
    });

    it('should throw QuoteServiceError for missing required fields', () => {
      const responses = [
        { content: 'Test', author: 'Author' }, // missing _id
        { _id: '123', author: 'Author' }, // missing content
        { _id: '123', content: 'Test' }, // missing author
        { _id: '', content: 'Test', author: 'Author' }, // empty _id
        { _id: '123', content: '', author: 'Author' }, // empty content
        { _id: '123', content: 'Test', author: '' } // empty author
      ];

      responses.forEach(response => {
        expect(() => transformQuotableResponse(response))
          .toThrow(QuoteServiceError);
      });
    });
  });

  describe('transformDummyJSONResponse', () => {
    const validDummyJSONResponse = {
      id: 1,
      quote: 'Life is what happens to you while you\'re busy making other plans.',
      author: 'John Lennon'
    };

    it('should transform valid dummyjson.com response', () => {
      const result = transformDummyJSONResponse(validDummyJSONResponse);

      expect(result).toEqual({
        id: 'test-uuid-123',
        text: 'Life is what happens to you while you\'re busy making other plans.',
        author: 'John Lennon',
        tags: [],
        likes: 0,
        source: 'dummyjson',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });

    it('should throw QuoteServiceError for invalid response', () => {
      const invalidResponse = {
        id: 1,
        // missing quote
        author: 'John Lennon'
      };

      expect(() => transformDummyJSONResponse(invalidResponse))
        .toThrow(QuoteServiceError);
    });

    it('should throw QuoteServiceError for invalid ID', () => {
      const invalidResponse = {
        id: -1, // negative ID
        quote: 'Test quote',
        author: 'Test Author'
      };

      expect(() => transformDummyJSONResponse(invalidResponse))
        .toThrow(QuoteServiceError);
    });
  });

  describe('transformExternalQuote', () => {
    it('should transform quotable.io format', () => {
      const quotableResponse = {
        _id: 'quotable-123',
        content: 'Test quote',
        author: 'Test Author',
        tags: ['test']
      };

      const result = transformExternalQuote(quotableResponse);

      expect(result.source).toBe('quotable');
      expect(result.text).toBe('Test quote');
      expect(result.tags).toEqual(['test']);
    });

    it('should transform dummyjson.com format', () => {
      const dummyJSONResponse = {
        id: 1,
        quote: 'Test quote',
        author: 'Test Author'
      };

      const result = transformExternalQuote(dummyJSONResponse);

      expect(result.source).toBe('dummyjson');
      expect(result.text).toBe('Test quote');
      expect(result.tags).toEqual([]);
    });

    it('should throw error for ambiguous format', () => {
      const ambiguousResponse = {
        author: 'Test Author'
        // missing both quotable and dummyjson identifiers
      };

      expect(() => transformExternalQuote(ambiguousResponse))
        .toThrow(QuoteServiceError);
    });

    it('should throw error for completely invalid format', () => {
      const invalidResponse = {
        invalid: 'data'
      };

      expect(() => transformExternalQuote(invalidResponse))
        .toThrow(QuoteServiceError);
    });
  });

  describe('transformExternalQuoteInterface', () => {
    it('should transform quotable format ExternalQuote', () => {
      const externalQuote: ExternalQuote = {
        _id: 'quotable-123',
        content: 'Test quote',
        author: 'Test Author',
        tags: ['wisdom']
      };

      const result = transformExternalQuoteInterface(externalQuote);

      expect(result).toEqual({
        id: 'test-uuid-123',
        text: 'Test quote',
        author: 'Test Author',
        tags: ['wisdom'],
        likes: 0,
        source: 'quotable',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });

    it('should transform dummyjson format ExternalQuote', () => {
      const externalQuote: ExternalQuote = {
        id: 1,
        quote: 'Test quote',
        author: 'Test Author'
      };

      const result = transformExternalQuoteInterface(externalQuote);

      expect(result).toEqual({
        id: 'test-uuid-123',
        text: 'Test quote',
        author: 'Test Author',
        tags: [],
        likes: 0,
        source: 'dummyjson',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });

    it('should throw error for invalid ExternalQuote', () => {
      const invalidExternalQuote: ExternalQuote = {
        author: 'Test Author'
        // missing both format identifiers
      };

      expect(() => transformExternalQuoteInterface(invalidExternalQuote))
        .toThrow(QuoteServiceError);
    });
  });

  describe('sanitizeQuoteText', () => {
    it('should sanitize valid quote text', () => {
      const text = '  The only way to do great work   is to love what you do.  ';
      const result = sanitizeQuoteText(text);
      
      expect(result).toBe('The only way to do great work is to love what you do.');
    });

    it('should handle multiple spaces', () => {
      const text = 'Quote   with    multiple     spaces';
      const result = sanitizeQuoteText(text);
      
      expect(result).toBe('Quote with multiple spaces');
    });

    it('should throw error for empty string', () => {
      expect(() => sanitizeQuoteText('')).toThrow(QuoteServiceError);
      expect(() => sanitizeQuoteText('   ')).toThrow(QuoteServiceError);
    });

    it('should throw error for non-string input', () => {
      expect(() => sanitizeQuoteText(null as any)).toThrow(QuoteServiceError);
      expect(() => sanitizeQuoteText(123 as any)).toThrow(QuoteServiceError);
      expect(() => sanitizeQuoteText(undefined as any)).toThrow(QuoteServiceError);
    });

    it('should throw error for text that is too long', () => {
      const longText = 'a'.repeat(1001);
      expect(() => sanitizeQuoteText(longText)).toThrow(QuoteServiceError);
    });
  });

  describe('sanitizeAuthorName', () => {
    it('should sanitize valid author name', () => {
      const author = '  Steve   Jobs  ';
      const result = sanitizeAuthorName(author);
      
      expect(result).toBe('Steve Jobs');
    });

    it('should throw error for empty string', () => {
      expect(() => sanitizeAuthorName('')).toThrow(QuoteServiceError);
      expect(() => sanitizeAuthorName('   ')).toThrow(QuoteServiceError);
    });

    it('should throw error for non-string input', () => {
      expect(() => sanitizeAuthorName(null as any)).toThrow(QuoteServiceError);
      expect(() => sanitizeAuthorName(123 as any)).toThrow(QuoteServiceError);
    });

    it('should throw error for author name that is too long', () => {
      const longAuthor = 'a'.repeat(201);
      expect(() => sanitizeAuthorName(longAuthor)).toThrow(QuoteServiceError);
    });
  });

  describe('sanitizeTags', () => {
    it('should sanitize valid tags array', () => {
      const tags = ['  Wisdom  ', 'WORK', 'life-advice', ''];
      const result = sanitizeTags(tags);
      
      expect(result).toEqual(['wisdom', 'work', 'life-advice']);
    });

    it('should handle empty array', () => {
      const result = sanitizeTags([]);
      expect(result).toEqual([]);
    });

    it('should handle null/undefined', () => {
      expect(sanitizeTags(null)).toEqual([]);
      expect(sanitizeTags(undefined)).toEqual([]);
    });

    it('should remove duplicates', () => {
      const tags = ['wisdom', 'WISDOM', 'Wisdom'];
      const result = sanitizeTags(tags);
      
      expect(result).toEqual(['wisdom']);
    });

    it('should limit to 10 tags', () => {
      const tags = Array.from({ length: 15 }, (_, i) => `tag${i}`);
      const result = sanitizeTags(tags);
      
      expect(result).toHaveLength(10);
    });

    it('should filter out long tags', () => {
      const tags = ['valid', 'a'.repeat(51)]; // second tag is too long
      const result = sanitizeTags(tags);
      
      expect(result).toEqual(['valid']);
    });

    it('should throw error for non-array input', () => {
      expect(() => sanitizeTags('not-an-array')).toThrow(QuoteServiceError);
      expect(() => sanitizeTags(123)).toThrow(QuoteServiceError);
    });

    it('should convert spaces to hyphens', () => {
      const tags = ['life advice', 'personal growth'];
      const result = sanitizeTags(tags);
      
      expect(result).toEqual(['life-advice', 'personal-growth']);
    });
  });

  describe('transformAndValidateExternalQuote', () => {
    it('should transform and validate quotable response', () => {
      const response = {
        _id: 'quotable-123',
        content: '  The only way to do great work is to love what you do.  ',
        author: '  Steve Jobs  ',
        tags: ['  Wisdom  ', 'WORK']
      };

      const result = transformAndValidateExternalQuote(response);

      expect(result).toEqual({
        id: 'test-uuid-123',
        text: 'The only way to do great work is to love what you do.',
        author: 'Steve Jobs',
        tags: ['wisdom', 'work'],
        likes: 0,
        source: 'quotable',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });

    it('should transform and validate dummyjson response', () => {
      const response = {
        id: 1,
        quote: '  Life is what happens to you.  ',
        author: '  John Lennon  '
      };

      const result = transformAndValidateExternalQuote(response);

      expect(result).toEqual({
        id: 'test-uuid-123',
        text: 'Life is what happens to you.',
        author: 'John Lennon',
        tags: [],
        likes: 0,
        source: 'dummyjson',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });

    it('should throw error for invalid response', () => {
      const invalidResponse = {
        _id: 'quotable-123',
        content: '', // empty content will fail sanitization
        author: 'Steve Jobs'
      };

      expect(() => transformAndValidateExternalQuote(invalidResponse))
        .toThrow(QuoteServiceError);
    });

    it('should throw error for response with invalid data types', () => {
      const invalidResponse = {
        _id: 'quotable-123',
        content: 123, // should be string
        author: 'Steve Jobs'
      };

      expect(() => transformAndValidateExternalQuote(invalidResponse))
        .toThrow(QuoteServiceError);
    });
  });
});