import { Quote as PrismaQuote, QuoteSimilarity as PrismaQuoteSimilarity } from '@prisma/client';
import { Quote, SimilarityScore } from '../types';

/**
 * Transform Prisma Quote to application Quote type
 * Handles JSON parsing for tags field
 */
export function transformPrismaQuote(prismaQuote: PrismaQuote): Quote {
  return {
    id: prismaQuote.id,
    text: prismaQuote.text,
    author: prismaQuote.author,
    tags: prismaQuote.tags ? JSON.parse(prismaQuote.tags) as string[] : undefined,
    likes: prismaQuote.likes,
    source: prismaQuote.source as 'quotable' | 'dummyjson' | 'internal',
    createdAt: prismaQuote.createdAt,
    updatedAt: prismaQuote.updatedAt,
  };
}

/**
 * Transform application Quote to Prisma-compatible format
 * Handles JSON stringification for tags field
 */
export function transformToQuoteInput(quote: Omit<Quote, 'id' | 'createdAt' | 'updatedAt'>) {
  return {
    text: quote.text,
    author: quote.author,
    tags: quote.tags ? JSON.stringify(quote.tags) : null,
    likes: quote.likes,
    source: quote.source,
  };
}

/**
 * Transform Prisma QuoteSimilarity with related quotes to SimilarityScore
 */
export function transformPrismaQuoteSimilarity(
  prismaQuoteSimilarity: PrismaQuoteSimilarity & { similarQuote: PrismaQuote }
): SimilarityScore {
  return {
    quote: transformPrismaQuote(prismaQuoteSimilarity.similarQuote),
    score: prismaQuoteSimilarity.similarityScore,
  };
}

/**
 * Validate and sanitize tags array
 */
export function sanitizeTags(tags?: string[]): string[] | undefined {
  if (!tags || !Array.isArray(tags)) {
    return undefined;
  }
  
  return tags
    .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    .map(tag => tag.trim().toLowerCase())
    .slice(0, 10); // Limit to 10 tags maximum
}

/**
 * Generate a unique external ID for quotes from external sources
 */
export function generateExternalId(source: string, originalId: string | number): string {
  return `${source}_${originalId}`;
}