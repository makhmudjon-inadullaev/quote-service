import Fastify, { FastifyInstance } from 'fastify';
import { graphqlPlugin } from './index';
import { QuoteService } from '../services/QuoteService';

// Mock the logger
jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock the services

describe('GraphQL Plugin', () => {
  let app: FastifyInstance;
  let mockQuoteService: jest.Mocked<QuoteService>;

  beforeAll(async () => {
    // Create a minimal Fastify app for testing
    app = Fastify({ logger: false });
    
    // Create mock services
    mockQuoteService = {
      getRandomQuote: jest.fn(),
      getQuoteById: jest.fn(),
      getSimilarQuotes: jest.fn(),
      likeQuote: jest.fn(),
    } as unknown as jest.Mocked<QuoteService>;
    
    // Register the GraphQL plugin with mock services
    await app.register(graphqlPlugin, { quoteService: mockQuoteService });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GraphQL endpoint registration', () => {
    it('should register GraphQL endpoint at /graphql', async () => {
      // Test that the GraphQL endpoint is available
      const response = await app.inject({
        method: 'POST',
        url: '/graphql',
        payload: {
          query: '{ __schema { types { name } } }',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.data).toBeDefined();
      expect(result.data.__schema).toBeDefined();
    });

    it('should have Quote type in schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/graphql',
        payload: {
          query: `
            {
              __type(name: "Quote") {
                name
                fields {
                  name
                  type {
                    name
                  }
                }
              }
            }
          `,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.data.__type).toBeDefined();
      expect(result.data.__type.name).toBe('Quote');
      
      const fieldNames = result.data.__type.fields.map((field: any) => field.name);
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('text');
      expect(fieldNames).toContain('author');
      expect(fieldNames).toContain('tags');
      expect(fieldNames).toContain('likes');
      expect(fieldNames).toContain('source');
      expect(fieldNames).toContain('createdAt');
      expect(fieldNames).toContain('updatedAt');
    });

    it('should have SimilarQuote type in schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/graphql',
        payload: {
          query: `
            {
              __type(name: "SimilarQuote") {
                name
                fields {
                  name
                  type {
                    name
                  }
                }
              }
            }
          `,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.data.__type).toBeDefined();
      expect(result.data.__type.name).toBe('SimilarQuote');
      
      const fieldNames = result.data.__type.fields.map((field: any) => field.name);
      expect(fieldNames).toContain('quote');
      expect(fieldNames).toContain('score');
    });

    it('should have Query type with expected fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/graphql',
        payload: {
          query: `
            {
              __type(name: "Query") {
                name
                fields {
                  name
                  args {
                    name
                    type {
                      name
                    }
                  }
                }
              }
            }
          `,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.data.__type).toBeDefined();
      expect(result.data.__type.name).toBe('Query');
      
      const fieldNames = result.data.__type.fields.map((field: any) => field.name);
      expect(fieldNames).toContain('randomQuote');
      expect(fieldNames).toContain('quote');
      expect(fieldNames).toContain('similarQuotes');
    });

    it('should have Mutation type with expected fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/graphql',
        payload: {
          query: `
            {
              __type(name: "Mutation") {
                name
                fields {
                  name
                  args {
                    name
                    type {
                      name
                    }
                  }
                }
              }
            }
          `,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.data.__type).toBeDefined();
      expect(result.data.__type.name).toBe('Mutation');
      
      const fieldNames = result.data.__type.fields.map((field: any) => field.name);
      expect(fieldNames).toContain('likeQuote');
    });
  });

  describe('Error handling', () => {
    it('should handle GraphQL syntax errors', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/graphql',
        payload: {
          query: '{ invalidQuery {',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.errors).toBeDefined();
      expect(result.errors[0].message).toContain('validation error');
    });

    it('should handle invalid field queries', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/graphql',
        payload: {
          query: '{ randomQuote { invalidField } }',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.errors).toBeDefined();
      expect(result.errors[0].message).toContain('validation error');
    });
  });
});