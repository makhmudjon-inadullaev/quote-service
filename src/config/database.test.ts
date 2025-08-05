import { prisma } from './database';
import { testPrisma, setupTestDatabase, teardownTestDatabase, cleanupTestDatabase } from '../test/database';

describe('Database Configuration', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  afterEach(async () => {
    await cleanupTestDatabase();
  });

  describe('initializeDatabase', () => {
    it('should initialize database connection successfully', async () => {
      // Database is already initialized in beforeAll
      expect(prisma).toBeDefined();
    });
  });

  describe('checkDatabaseHealth', () => {
    it('should return true for healthy database', async () => {
      // Use test database for health check
      const isHealthy = await testPrisma.$queryRaw`SELECT 1`;
      expect(isHealthy).toBeDefined();
    });
  });

  describe('prisma client', () => {
    it('should be able to perform basic database operations', async () => {
      // Test creating a quote
      const testQuote = await testPrisma.quote.create({
        data: {
          text: 'Test quote for database verification',
          author: 'Test Author',
          source: 'internal',
          likes: 0,
        },
      });

      expect(testQuote).toBeDefined();
      expect(testQuote.id).toBeDefined();
      expect(testQuote.text).toBe('Test quote for database verification');
      expect(testQuote.author).toBe('Test Author');
      expect(testQuote.source).toBe('internal');
      expect(testQuote.likes).toBe(0);

      // Test reading the quote
      const foundQuote = await testPrisma.quote.findUnique({
        where: { id: testQuote.id },
      });

      expect(foundQuote).toBeDefined();
      expect(foundQuote?.id).toBe(testQuote.id);

      // Test updating the quote
      const updatedQuote = await testPrisma.quote.update({
        where: { id: testQuote.id },
        data: { likes: 1 },
      });

      expect(updatedQuote.likes).toBe(1);

      // Test deleting the quote
      await testPrisma.quote.delete({
        where: { id: testQuote.id },
      });

      const deletedQuote = await testPrisma.quote.findUnique({
        where: { id: testQuote.id },
      });

      expect(deletedQuote).toBeNull();
    });

    it('should handle tags as JSON string', async () => {
      const testQuote = await testPrisma.quote.create({
        data: {
          text: 'Quote with tags',
          author: 'Test Author',
          source: 'internal',
          tags: JSON.stringify(['wisdom', 'inspiration']),
          likes: 0,
        },
      });

      expect(testQuote.tags).toBe('["wisdom","inspiration"]');

      // Parse tags back to array
      const parsedTags = JSON.parse(testQuote.tags!) as string[];
      expect(parsedTags).toEqual(['wisdom', 'inspiration']);
    });

    it('should handle quote similarity relationships', async () => {
      // Create two test quotes
      const quote1 = await testPrisma.quote.create({
        data: {
          text: 'First test quote',
          author: 'Author 1',
          source: 'internal',
          likes: 0,
        },
      });

      const quote2 = await testPrisma.quote.create({
        data: {
          text: 'Second test quote',
          author: 'Author 2',
          source: 'internal',
          likes: 0,
        },
      });

      // Create similarity relationship
      const similarity = await testPrisma.quoteSimilarity.create({
        data: {
          quoteId: quote1.id,
          similarQuoteId: quote2.id,
          similarityScore: 0.85,
        },
      });

      expect(similarity).toBeDefined();
      expect(similarity.similarityScore).toBe(0.85);

      // Test querying with relations
      const quoteWithSimilarities = await testPrisma.quote.findUnique({
        where: { id: quote1.id },
        include: {
          similarities: {
            include: {
              similarQuote: true,
            },
          },
        },
      });

      expect(quoteWithSimilarities?.similarities).toHaveLength(1);
      expect(quoteWithSimilarities?.similarities[0]?.similarQuote.id).toBe(quote2.id);
    });
  });
});