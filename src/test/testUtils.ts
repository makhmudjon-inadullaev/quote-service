import { 
  testPrisma, 
  testQuoteRepository,
  cleanupTestDatabase as cleanup, 
  setupTestDatabase, 
  teardownTestDatabase as teardown,
  seedTestDatabase,
  getDatabaseStats,
  resetTestDatabase,
  withTransaction
} from './database';
import { Quote } from '../types';
import { TestDataFixtures } from './fixtures/testData';

// Re-export database utilities with consistent naming
export const initializeTestDatabase = setupTestDatabase;
export const cleanupTestDatabase = cleanup;
export const teardownTestDatabase = teardown;

// Export test prisma client and repository for direct database operations in tests
export { testPrisma, testQuoteRepository };

// Export additional database utilities
export { seedTestDatabase, getDatabaseStats, resetTestDatabase, withTransaction };

// Test helper functions
export class TestHelpers {
  static testQuoteRepository: any; // Will be set below
  /**
   * Create and seed database with test data for a specific scenario
   */
  static async setupTestScenario(scenario: string): Promise<Quote[]> {
    await cleanupTestDatabase();
    const testData = TestDataFixtures.getTestDataForScenario(scenario);
    return await seedTestDatabase(testData);
  }

  /**
   * Wait for a specified amount of time (useful for timing tests)
   */
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate a unique test identifier
   */
  static generateTestId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Measure execution time of an async operation
   */
  static async measureTime<T>(operation: () => Promise<T>): Promise<{ result: T; timeMs: number }> {
    const startTime = Date.now();
    const result = await operation();
    const timeMs = Date.now() - startTime;
    return { result, timeMs };
  }

  /**
   * Retry an operation with exponential backoff
   */
  static async retry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 100
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        const delay = baseDelay * Math.pow(2, attempt);
        await this.wait(delay);
      }
    }
    
    throw lastError!;
  }

  /**
   * Assert that an array is sorted by a specific property
   */
  static assertSortedBy<T>(array: T[], property: keyof T, order: 'asc' | 'desc' = 'desc'): void {
    for (let i = 0; i < array.length - 1; i++) {
      const current = array[i][property] as any;
      const next = array[i + 1][property] as any;
      
      if (order === 'desc') {
        expect(current).toBeGreaterThanOrEqual(next);
      } else {
        expect(current).toBeLessThanOrEqual(next);
      }
    }
  }

  /**
   * Verify that a quote object has all required properties
   */
  static assertValidQuote(quote: any): void {
    expect(quote).toHaveProperty('id');
    expect(quote).toHaveProperty('text');
    expect(quote).toHaveProperty('author');
    expect(quote).toHaveProperty('likes');
    expect(quote).toHaveProperty('source');
    expect(quote).toHaveProperty('createdAt');
    expect(quote).toHaveProperty('updatedAt');
    
    expect(typeof quote.id).toBe('string');
    expect(typeof quote.text).toBe('string');
    expect(typeof quote.author).toBe('string');
    expect(typeof quote.likes).toBe('number');
    expect(['quotable', 'dummyjson', 'internal']).toContain(quote.source);
    expect(quote.likes).toBeGreaterThanOrEqual(0);
  }

  /**
   * Verify that a similarity score object is valid
   */
  static assertValidSimilarityScore(similarity: any): void {
    expect(similarity).toHaveProperty('quote');
    expect(similarity).toHaveProperty('score');
    
    this.assertValidQuote(similarity.quote);
    expect(typeof similarity.score).toBe('number');
    expect(similarity.score).toBeGreaterThanOrEqual(0);
    expect(similarity.score).toBeLessThanOrEqual(1);
  }

  /**
   * Verify that an API error response has the correct format
   */
  static assertValidErrorResponse(errorBody: any, expectedCode?: string): void {
    expect(errorBody).toHaveProperty('error');
    expect(errorBody.error).toHaveProperty('code');
    expect(errorBody.error).toHaveProperty('message');
    expect(typeof errorBody.error.code).toBe('string');
    expect(typeof errorBody.error.message).toBe('string');
    
    if (expectedCode) {
      expect(errorBody.error.code).toBe(expectedCode);
    }
  }

  /**
   * Create a mock external API response
   */
  static createMockExternalQuote(source: 'quotable' | 'dummyjson' = 'quotable'): any {
    if (source === 'quotable') {
      return {
        _id: 'mock-external-id',
        content: 'Mock external quote content',
        author: 'Mock External Author',
        tags: ['mock', 'external']
      };
    } else {
      return {
        id: 123,
        quote: 'Mock external quote content',
        author: 'Mock External Author'
      };
    }
  }

  /**
   * Verify that response headers include expected values
   */
  static assertResponseHeaders(headers: any, expectedHeaders: { [key: string]: any }): void {
    for (const [key, expectedValue] of Object.entries(expectedHeaders)) {
      expect(headers[key]).toBeDefined();
      if (expectedValue !== undefined) {
        expect(headers[key]).toBe(expectedValue);
      }
    }
  }

  /**
   * Generate test data with specific characteristics
   */
  static generateTestQuotes(count: number, options: {
    minLikes?: number;
    maxLikes?: number;
    tags?: string[];
    author?: string;
  } = {}): Quote[] {
    const quotes: Quote[] = [];
    
    for (let i = 0; i < count; i++) {
      const likes = options.minLikes !== undefined && options.maxLikes !== undefined
        ? options.minLikes + Math.floor(Math.random() * (options.maxLikes - options.minLikes + 1))
        : Math.floor(Math.random() * 50);
      
      quotes.push({
        id: `test-quote-${i}`,
        text: `Test quote ${i + 1} with some meaningful content`,
        author: options.author || `Test Author ${i + 1}`,
        tags: options.tags || ['test', `category-${i % 3}`],
        likes,
        source: 'internal',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    return quotes;
  }
}

// Add testQuoteRepository to TestHelpers for backward compatibility
TestHelpers.testQuoteRepository = testQuoteRepository;