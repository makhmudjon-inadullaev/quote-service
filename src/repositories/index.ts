import { prisma } from '../config/database';
import { QuoteRepository } from './QuoteRepository';

// Create repository instances with shared Prisma client
export const quoteRepository = new QuoteRepository(prisma);

// Export repository classes for testing
export { QuoteRepository };

// Export types
export type { CreateQuoteData, UpdateQuoteData, WeightedRandomOptions } from './QuoteRepository';