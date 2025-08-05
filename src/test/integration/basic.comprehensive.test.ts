import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import { initializeTestDatabase, cleanupTestDatabase, TestHelpers } from '../testUtils';
// TestDataFixtures used indirectly through TestHelpers.setupTestScenario

describe('Basic Comprehensive Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await initializeTestDatabase();
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestDatabase();
  });

  describe('Application Health', () => {
    it('should start successfully and respond to health checks', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('timestamp');
    });

    it('should respond to root endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('name');
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('endpoints');
    });
  });

  describe('Basic API Functionality', () => {
    it('should handle random quote requests', async () => {
      // Seed with test data
      await TestHelpers.setupTestScenario('complete');

      const response = await app.inject({
        method: 'GET',
        url: '/api/quotes/random'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('quote');
      expect(body).toHaveProperty('requestId');
      
      TestHelpers.assertValidQuote(body.quote);
    });

    it('should handle GraphQL queries', async () => {
      await TestHelpers.setupTestScenario('complete');

      const response = await app.inject({
        method: 'POST',
        url: '/graphql',
        payload: {
          query: 'query { randomQuote { id text author } }'
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.errors).toBeUndefined();
      expect(result.data.randomQuote).toBeDefined();
      expect(result.data.randomQuote).toHaveProperty('id');
      expect(result.data.randomQuote).toHaveProperty('text');
      expect(result.data.randomQuote).toHaveProperty('author');
    });
  });

  describe('Performance Basics', () => {
    it('should respond within acceptable time limits', async () => {
      await TestHelpers.setupTestScenario('performance');

      const { timeMs } = await TestHelpers.measureTime(async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/quotes/random'
        });
        expect(response.statusCode).toBe(200);
        return response;
      });

      console.log(`Random quote response time: ${timeMs}ms`);
      expect(timeMs).toBeLessThan(2000); // Should respond within 2 seconds
    });

    it('should handle multiple concurrent requests', async () => {
      await TestHelpers.setupTestScenario('concurrency');

      const concurrentRequests = 5;
      const promises = Array.from({ length: concurrentRequests }, () =>
        app.inject({ method: 'GET', url: '/api/quotes/random' })
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid endpoints gracefully', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/nonexistent'
      });

      expect(response.statusCode).toBe(404);
    });

    it('should handle malformed GraphQL queries', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/graphql',
        payload: {
          query: 'invalid graphql query'
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.errors).toBeDefined();
    });
  });
});