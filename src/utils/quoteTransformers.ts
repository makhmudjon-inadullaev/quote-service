import { v4 as uuidv4 } from 'uuid';
import { Quote, ExternalQuote, ErrorCode, QuoteServiceError } from '../types';
import { 
  QuotableResponseSchema, 
  DummyJSONResponseSchema, 
  ExternalQuoteSchema
} from '../schemas/externalQuoteSchemas';

/**
 * Transform a quotable.io API response to internal Quote model
 */
export function transformQuotableResponse(response: unknown): Quote {
  try {
    // Validate the response structure
    const validatedResponse = QuotableResponseSchema.parse(response);
    
    const now = new Date();
    
    return {
      id: uuidv4(),
      text: validatedResponse.content,
      author: validatedResponse.author,
      tags: validatedResponse.tags || [],
      likes: 0,
      source: 'quotable',
      createdAt: now,
      updatedAt: now
    };
  } catch (error) {
    throw new QuoteServiceError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid quotable.io response format: ${error instanceof Error ? error.message : 'Unknown validation error'}`,
      400,
      { originalResponse: response, validationError: error }
    );
  }
}

/**
 * Transform a dummyjson.com API response to internal Quote model
 */
export function transformDummyJSONResponse(response: unknown): Quote {
  try {
    // Validate the response structure
    const validatedResponse = DummyJSONResponseSchema.parse(response);
    
    const now = new Date();
    
    return {
      id: uuidv4(),
      text: validatedResponse.quote,
      author: validatedResponse.author,
      tags: [], // DummyJSON doesn't provide tags
      likes: 0,
      source: 'dummyjson',
      createdAt: now,
      updatedAt: now
    };
  } catch (error) {
    throw new QuoteServiceError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid dummyjson.com response format: ${error instanceof Error ? error.message : 'Unknown validation error'}`,
      400,
      { originalResponse: response, validationError: error }
    );
  }
}

/**
 * Generic transformer that can handle both quotable.io and dummyjson.com responses
 */
export function transformExternalQuote(response: unknown): Quote {
  try {
    // First validate that it's a valid external quote format
    const validatedResponse = ExternalQuoteSchema.parse(response);
    
    // Determine the source and transform accordingly
    if (validatedResponse._id && validatedResponse.content) {
      // This is a quotable.io response
      return transformQuotableResponse(response);
    } else if (validatedResponse.id && validatedResponse.quote) {
      // This is a dummyjson.com response
      return transformDummyJSONResponse(response);
    } else {
      throw new Error('Unable to determine external quote format');
    }
  } catch (error) {
    if (error instanceof QuoteServiceError) {
      throw error;
    }
    
    throw new QuoteServiceError(
      ErrorCode.VALIDATION_ERROR,
      `Failed to transform external quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      400,
      { originalResponse: response, transformationError: error }
    );
  }
}

/**
 * Transform ExternalQuote interface to internal Quote model
 * This is used when we already have a typed ExternalQuote object
 */
export function transformExternalQuoteInterface(externalQuote: ExternalQuote): Quote {
  const now = new Date();
  
  // Determine source and extract text
  let text: string;
  let source: 'quotable' | 'dummyjson';
  
  if (externalQuote._id && externalQuote.content) {
    text = externalQuote.content;
    source = 'quotable';
  } else if (externalQuote.id && externalQuote.quote) {
    text = externalQuote.quote;
    source = 'dummyjson';
  } else {
    throw new QuoteServiceError(
      ErrorCode.VALIDATION_ERROR,
      'ExternalQuote must have either quotable format (_id, content) or dummyjson format (id, quote)',
      400,
      { externalQuote }
    );
  }
  
  return {
    id: uuidv4(),
    text,
    author: externalQuote.author,
    tags: externalQuote.tags || [],
    likes: 0,
    source,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Validate and sanitize quote text
 */
export function sanitizeQuoteText(text: string): string {
  if (!text || typeof text !== 'string') {
    throw new QuoteServiceError(
      ErrorCode.VALIDATION_ERROR,
      'Quote text must be a non-empty string',
      400
    );
  }
  
  // Remove excessive whitespace and normalize
  const sanitized = text.trim().replace(/\s+/g, ' ');
  
  if (sanitized.length === 0) {
    throw new QuoteServiceError(
      ErrorCode.VALIDATION_ERROR,
      'Quote text cannot be empty after sanitization',
      400
    );
  }
  
  if (sanitized.length > 1000) {
    throw new QuoteServiceError(
      ErrorCode.VALIDATION_ERROR,
      'Quote text is too long (maximum 1000 characters)',
      400
    );
  }
  
  return sanitized;
}

/**
 * Validate and sanitize author name
 */
export function sanitizeAuthorName(author: string): string {
  if (!author || typeof author !== 'string') {
    throw new QuoteServiceError(
      ErrorCode.VALIDATION_ERROR,
      'Author name must be a non-empty string',
      400
    );
  }
  
  // Remove excessive whitespace and normalize
  const sanitized = author.trim().replace(/\s+/g, ' ');
  
  if (sanitized.length === 0) {
    throw new QuoteServiceError(
      ErrorCode.VALIDATION_ERROR,
      'Author name cannot be empty after sanitization',
      400
    );
  }
  
  if (sanitized.length > 200) {
    throw new QuoteServiceError(
      ErrorCode.VALIDATION_ERROR,
      'Author name is too long (maximum 200 characters)',
      400
    );
  }
  
  return sanitized;
}

/**
 * Validate and sanitize tags array
 */
export function sanitizeTags(tags: unknown): string[] {
  if (!tags) {
    return [];
  }
  
  if (!Array.isArray(tags)) {
    throw new QuoteServiceError(
      ErrorCode.VALIDATION_ERROR,
      'Tags must be an array',
      400
    );
  }
  
  const sanitizedTags: string[] = [];
  
  for (const tag of tags) {
    if (typeof tag === 'string' && tag.trim().length > 0) {
      const sanitizedTag = tag.trim().toLowerCase().replace(/\s+/g, '-');
      if (sanitizedTag.length <= 50 && !sanitizedTags.includes(sanitizedTag)) {
        sanitizedTags.push(sanitizedTag);
      }
    }
  }
  
  // Limit to maximum 10 tags
  return sanitizedTags.slice(0, 10);
}

/**
 * Create a comprehensive transformation with full validation and sanitization
 */
export function transformAndValidateExternalQuote(response: unknown): Quote {
  try {
    // First do basic transformation
    const quote = transformExternalQuote(response);
    
    // Then apply additional sanitization
    return {
      ...quote,
      text: sanitizeQuoteText(quote.text),
      author: sanitizeAuthorName(quote.author),
      tags: sanitizeTags(quote.tags)
    };
  } catch (error) {
    if (error instanceof QuoteServiceError) {
      throw error;
    }
    
    throw new QuoteServiceError(
      ErrorCode.VALIDATION_ERROR,
      `Failed to transform and validate external quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      400,
      { originalResponse: response, error }
    );
  }
}