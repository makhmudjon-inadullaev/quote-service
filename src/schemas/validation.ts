import { z } from 'zod';

// Base validation constants
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXT_LENGTH = 1000;
const MAX_AUTHOR_LENGTH = 255;
const MAX_TAG_LENGTH = 50;
const MAX_TAGS_COUNT = 10;
const MAX_SIMILAR_QUOTES_LIMIT = 50;
const MIN_SIMILAR_QUOTES_LIMIT = 1;
const DEFAULT_SIMILAR_QUOTES_LIMIT = 10;

// Custom validation helpers
const uuidValidation = z.string().regex(UUID_REGEX, 'Must be a valid UUID');
const nonEmptyString = (field: string, maxLength?: number) => {
  let schema = z.string().min(1, `${field} cannot be empty`).trim();
  if (maxLength) {
    schema = schema.max(maxLength, `${field} cannot exceed ${maxLength} characters`);
  }
  return schema;
};

// Core Quote schema
export const QuoteSchema = z.object({
  id: uuidValidation,
  text: nonEmptyString('Quote text', MAX_TEXT_LENGTH),
  author: nonEmptyString('Author', MAX_AUTHOR_LENGTH),
  tags: z.array(
    nonEmptyString('Tag', MAX_TAG_LENGTH)
  ).max(MAX_TAGS_COUNT, `Cannot have more than ${MAX_TAGS_COUNT} tags`).optional(),
  likes: z.number().int().min(0, 'Likes must be non-negative'),
  source: z.enum(['quotable', 'dummyjson', 'internal'], {
    errorMap: () => ({ message: 'Source must be one of: quotable, dummyjson, internal' })
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// External Quote schema with better validation
export const ExternalQuoteSchema = z.object({
  _id: z.string().optional(),
  id: z.number().optional(),
  content: z.string().optional(),
  quote: z.string().optional(),
  author: nonEmptyString('Author'),
  tags: z.array(z.string()).optional(),
}).refine(
  (data) => {
    const hasQuotableFormat = data._id && data.content;
    const hasDummyJSONFormat = data.id && data.quote;
    return hasQuotableFormat || hasDummyJSONFormat;
  },
  {
    message: 'External quote must have either quotable.io format (_id, content) or dummyjson format (id, quote)'
  }
);

// Similarity Score schema
export const SimilarityScoreSchema = z.object({
  quote: QuoteSchema,
  score: z.number().min(0, 'Similarity score must be non-negative').max(1, 'Similarity score cannot exceed 1'),
});

// REST API Request Parameter Schemas
export const QuoteIdParamSchema = z.object({
  id: uuidValidation,
});

export const SimilarQuotesParamsSchema = z.object({
  id: uuidValidation,
});

// REST API Query Parameter Schemas
export const SimilarQuotesQuerySchema = z.object({
  limit: z.coerce.number()
    .int('Limit must be an integer')
    .min(MIN_SIMILAR_QUOTES_LIMIT, `Limit must be at least ${MIN_SIMILAR_QUOTES_LIMIT}`)
    .max(MAX_SIMILAR_QUOTES_LIMIT, `Limit cannot exceed ${MAX_SIMILAR_QUOTES_LIMIT}`)
    .default(DEFAULT_SIMILAR_QUOTES_LIMIT)
});

// REST API Response Schemas
export const RandomQuoteResponseSchema = z.object({
  quote: QuoteSchema,
  requestId: uuidValidation,
});

export const LikeQuoteResponseSchema = z.object({
  quote: QuoteSchema,
  success: z.boolean(),
});

export const SimilarQuotesResponseSchema = z.object({
  quotes: z.array(SimilarityScoreSchema),
  totalCount: z.number().int().min(0, 'Total count must be non-negative'),
});

// GraphQL Input Validation Schemas
export const GraphQLQuoteIdInputSchema = z.object({
  id: uuidValidation,
});

export const GraphQLSimilarQuotesInputSchema = z.object({
  id: uuidValidation,
  limit: z.number()
    .int('Limit must be an integer')
    .min(MIN_SIMILAR_QUOTES_LIMIT, `Limit must be at least ${MIN_SIMILAR_QUOTES_LIMIT}`)
    .max(MAX_SIMILAR_QUOTES_LIMIT, `Limit cannot exceed ${MAX_SIMILAR_QUOTES_LIMIT}`)
    .optional()
    .default(DEFAULT_SIMILAR_QUOTES_LIMIT)
});

// Error Response Schema
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1, 'Error code is required'),
    message: z.string().min(1, 'Error message is required'),
    details: z.unknown().optional(),
  }),
  statusCode: z.number().int().min(100).max(599, 'Invalid HTTP status code'),
  timestamp: z.string().datetime('Invalid timestamp format'),
  path: z.string().min(1, 'Request path is required'),
});

// Validation Error Detail Schema
export const ValidationErrorDetailSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string(),
  received: z.unknown().optional(),
});

export const ValidationErrorResponseSchema = z.object({
  error: z.object({
    code: z.literal('VALIDATION_ERROR'),
    message: z.string(),
    details: z.array(ValidationErrorDetailSchema),
  }),
  statusCode: z.literal(400),
  timestamp: z.string().datetime(),
  path: z.string(),
});

// Request body schemas for future extensibility
export const CreateQuoteRequestSchema = z.object({
  text: nonEmptyString('Quote text', MAX_TEXT_LENGTH),
  author: nonEmptyString('Author', MAX_AUTHOR_LENGTH),
  tags: z.array(
    nonEmptyString('Tag', MAX_TAG_LENGTH)
  ).max(MAX_TAGS_COUNT).optional(),
});

export const UpdateQuoteRequestSchema = z.object({
  text: nonEmptyString('Quote text', MAX_TEXT_LENGTH).optional(),
  author: nonEmptyString('Author', MAX_AUTHOR_LENGTH).optional(),
  tags: z.array(
    nonEmptyString('Tag', MAX_TAG_LENGTH)
  ).max(MAX_TAGS_COUNT).optional(),
});

// Type exports
export type QuoteType = z.infer<typeof QuoteSchema>;
export type ExternalQuoteType = z.infer<typeof ExternalQuoteSchema>;
export type SimilarityScoreType = z.infer<typeof SimilarityScoreSchema>;
export type QuoteIdParamType = z.infer<typeof QuoteIdParamSchema>;
export type SimilarQuotesParamsType = z.infer<typeof SimilarQuotesParamsSchema>;
export type SimilarQuotesQueryType = z.infer<typeof SimilarQuotesQuerySchema>;
export type RandomQuoteResponseType = z.infer<typeof RandomQuoteResponseSchema>;
export type LikeQuoteResponseType = z.infer<typeof LikeQuoteResponseSchema>;
export type SimilarQuotesResponseType = z.infer<typeof SimilarQuotesResponseSchema>;
export type GraphQLQuoteIdInputType = z.infer<typeof GraphQLQuoteIdInputSchema>;
export type GraphQLSimilarQuotesInputType = z.infer<typeof GraphQLSimilarQuotesInputSchema>;
export type ErrorResponseType = z.infer<typeof ErrorResponseSchema>;
export type ValidationErrorDetailType = z.infer<typeof ValidationErrorDetailSchema>;
export type ValidationErrorResponseType = z.infer<typeof ValidationErrorResponseSchema>;
export type CreateQuoteRequestType = z.infer<typeof CreateQuoteRequestSchema>;
export type UpdateQuoteRequestType = z.infer<typeof UpdateQuoteRequestSchema>;

// Validation constants export
export const VALIDATION_CONSTANTS = {
  MAX_TEXT_LENGTH,
  MAX_AUTHOR_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TAGS_COUNT,
  MAX_SIMILAR_QUOTES_LIMIT,
  MIN_SIMILAR_QUOTES_LIMIT,
  DEFAULT_SIMILAR_QUOTES_LIMIT,
} as const;