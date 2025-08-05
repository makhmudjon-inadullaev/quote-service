import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';

describe('Quotes Routes Unit Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Route Registration', () => {
    it('should register all quote routes', () => {
      const routes = app.printRoutes();
      
      // Check that our routes are registered
      expect(routes).toContain('random (GET, HEAD)');
      expect(routes).toContain('like (POST)');
      expect(routes).toContain('similar (GET, HEAD)');
    });

    it('should have proper route structure', () => {
      const routes = app.printRoutes({ includeHooks: false });
      
      // Verify the routes exist and have the expected structure
      expect(routes).toContain('api/quotes/');
      expect(routes).toContain('random (GET, HEAD)');
      expect(routes).toContain(':id');
      expect(routes).toContain('like (POST)');
      expect(routes).toContain('similar (GET, HEAD)');
    });
  });

  describe('Route Handlers', () => {
    it('should have handlers for all routes', async () => {
      // Test that routes exist by checking they don't return 404
      const randomResponse = await app.inject({
        method: 'GET',
        url: '/api/quotes/random'
      });
      expect(randomResponse.statusCode).not.toBe(404);

      const likeResponse = await app.inject({
        method: 'POST',
        url: '/api/quotes/test-id/like'
      });
      expect(likeResponse.statusCode).not.toBe(404);

      const similarResponse = await app.inject({
        method: 'GET',
        url: '/api/quotes/test-id/similar'
      });
      expect(similarResponse.statusCode).not.toBe(404);
    });
  });
});