import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { Quote } from '../types';
import { QuoteRepository } from '../repositories/QuoteRepository';

// Create a separate Prisma client for testing
export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./test.db',
    },
  },
  log: [], // Disable logging in tests
});

// Create repository instance for testing
export const testQuoteRepository = new QuoteRepository(testPrisma);

// Clean up test database after each test
export async function cleanupTestDatabase(): Promise<void> {
  try {
    // Delete all records in reverse order to handle foreign key constraints
    await testPrisma.quoteSimilarity.deleteMany();
    await testPrisma.quote.deleteMany();
  } catch (error) {
    console.warn('Warning: Failed to cleanup test database:', error);
  }
}

// Setup test database
export async function setupTestDatabase(): Promise<void> {
  try {
    await testPrisma.$connect();
    
    // Ensure database schema is up to date
    try {
      execSync('npx prisma migrate deploy', { 
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: 'file:./test.db' }
      });
    } catch (migrateError) {
      console.warn('Warning: Database migration failed, continuing with existing schema');
    }
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
}

// Teardown test database
export async function teardownTestDatabase(): Promise<void> {
  try {
    await cleanupTestDatabase();
    await testPrisma.$disconnect();
  } catch (error) {
    console.warn('Warning: Failed to teardown test database:', error);
  }
}

// Seed test database with specific data
export async function seedTestDatabase(quotes: Quote[]): Promise<Quote[]> {
  const createdQuotes: Quote[] = [];
  
  for (const quote of quotes) {
    try {
      const created = await testQuoteRepository.create(quote);
      createdQuotes.push(created);
    } catch (error) {
      console.warn(`Warning: Failed to seed quote: ${quote.text}`, error);
    }
  }
  
  return createdQuotes;
}

// Get database statistics for testing
export async function getDatabaseStats(): Promise<{
  quoteCount: number;
  similarityCount: number;
  totalLikes: number;
  avgLikes: number;
}> {
  const quoteCount = await testPrisma.quote.count();
  const similarityCount = await testPrisma.quoteSimilarity.count();
  
  const likesAgg = await testPrisma.quote.aggregate({
    _sum: { likes: true },
    _avg: { likes: true }
  });
  
  return {
    quoteCount,
    similarityCount,
    totalLikes: likesAgg._sum.likes || 0,
    avgLikes: likesAgg._avg.likes || 0
  };
}

// Reset database to clean state
export async function resetTestDatabase(): Promise<void> {
  await cleanupTestDatabase();
  
  // Optionally recreate schema if needed
  try {
    execSync('npx prisma db push --force-reset', { 
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: 'file:./test.db' }
    });
  } catch (error) {
    console.warn('Warning: Database reset failed, using cleanup only');
  }
}

// Transaction helper for testing
export async function withTransaction<T>(
  operation: (prisma: any) => Promise<T>
): Promise<T> {
  return await testPrisma.$transaction(async (tx) => {
    return await operation(tx);
  });
}