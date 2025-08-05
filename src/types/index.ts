export interface Quote {
  id: string;
  text: string;
  author: string;
  tags?: string[];
  likes: number;
  source: 'quotable' | 'dummyjson' | 'internal';
  createdAt: Date;
  updatedAt: Date;
}

export interface ExternalQuote {
  _id?: string;
  id?: number;
  content?: string;
  quote?: string;
  author: string;
  tags?: string[];
}

export interface SimilarityScore {
  quote: Quote;
  score: number;
}

// REST API Response Types
export interface RandomQuoteResponse {
  quote: Quote;
  requestId: string;
}

export interface LikeQuoteRequest {
  id: string;
}

export interface LikeQuoteResponse {
  quote: Quote;
  success: boolean;
}

export interface SimilarQuotesResponse {
  quotes: SimilarityScore[];
  totalCount: number;
}

// Error Types
export enum ErrorCode {
  QUOTE_NOT_FOUND = 'QUOTE_NOT_FOUND',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  DATABASE_ERROR = 'DATABASE_ERROR'
}

export interface APIError {
  code: ErrorCode;
  message: string;
  details?: unknown;
  statusCode: number;
}

export class QuoteServiceError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'QuoteServiceError';
  }
}