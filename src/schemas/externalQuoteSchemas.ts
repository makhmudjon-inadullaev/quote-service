import { z } from 'zod';

// Schema for quotable.io API response
export const QuotableResponseSchema = z.object({
  _id: z.string().min(1, 'Quote ID is required'),
  content: z.string().min(1, 'Quote content is required'),
  author: z.string().min(1, 'Author is required'),
  tags: z.array(z.string()).optional().default([]),
  length: z.number().optional(),
  dateAdded: z.string().optional(),
  dateModified: z.string().optional()
});

// Schema for dummyjson.com API response
export const DummyJSONResponseSchema = z.object({
  id: z.number().positive('Quote ID must be positive'),
  quote: z.string().min(1, 'Quote content is required'),
  author: z.string().min(1, 'Author is required')
});

// Generic external quote schema that can handle both formats
export const ExternalQuoteSchema = z.object({
  // Quotable.io fields
  _id: z.string().optional(),
  content: z.string().optional(),
  
  // DummyJSON fields
  id: z.number().optional(),
  quote: z.string().optional(),
  
  // Common fields
  author: z.string().min(1, 'Author is required'),
  tags: z.array(z.string()).optional().default([])
}).refine(
  (data) => {
    // Must have either quotable.io format or dummyjson format
    const hasQuotableFormat = data._id && data.content;
    const hasDummyJSONFormat = data.id && data.quote;
    return hasQuotableFormat || hasDummyJSONFormat;
  },
  {
    message: 'External quote must have either quotable.io format (_id, content) or dummyjson format (id, quote)'
  }
);

// Schema for our internal Quote model (for validation)
export const InternalQuoteSchema = z.object({
  id: z.string().uuid('Quote ID must be a valid UUID'),
  text: z.string().min(1, 'Quote text is required').max(1000, 'Quote text too long'),
  author: z.string().min(1, 'Author is required').max(200, 'Author name too long'),
  tags: z.array(z.string()).optional().default([]),
  likes: z.number().int().min(0, 'Likes must be non-negative').default(0),
  source: z.enum(['quotable', 'dummyjson', 'internal']),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type QuotableResponse = z.infer<typeof QuotableResponseSchema>;
export type DummyJSONResponse = z.infer<typeof DummyJSONResponseSchema>;
export type ValidatedExternalQuote = z.infer<typeof ExternalQuoteSchema>;
export type ValidatedInternalQuote = z.infer<typeof InternalQuoteSchema>;