# Quote Service

A high-performance web service that provides random quotes through both REST and GraphQL APIs. Built with Fastify.js, TypeScript, and modern development practices.

## Features

- 🚀 **High Performance**: Built on Fastify.js for maximum throughput
- 🔄 **Dual APIs**: Both REST and GraphQL endpoints
- 📊 **Quote Liking**: Users can like quotes with intelligent recommendations
- 🔍 **Similarity Matching**: Find quotes similar to any given quote
- 🛡️ **Type Safety**: Full TypeScript implementation with Zod validation
- 📈 **Production Ready**: Comprehensive logging, error handling, and monitoring
- 🧪 **Well Tested**: Unit, integration, and performance tests

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Web Framework**: Fastify.js
- **GraphQL**: Mercurius
- **Database**: Prisma with SQLite (dev) / PostgreSQL (prod)
- **Validation**: Zod
- **Caching**: Redis
- **Testing**: Jest with Supertest
- **Linting**: ESLint with TypeScript rules

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Redis (optional, for caching)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Set up the database:
   ```bash
   npm run prisma:migrate
   npm run prisma:generate
   ```

### Development

Start the development server:
```bash
npm run dev
```

The service will be available at:
- **REST API**: http://localhost:3000/api
- **GraphQL**: http://localhost:3000/graphql
- **Health Check**: http://localhost:3000/health

### Testing

**Important**: Before running tests, make sure the application is started first to avoid test failures:

```bash
# Start the application first
npm run dev
```

Then in a separate terminal, run tests:
```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Building

Build for production:
```bash
npm run build
npm start
```

## API Documentation

### REST Endpoints

#### Get Random Quote
```http
GET /api/quotes/random
```

#### Like a Quote
```http
POST /api/quotes/:id/like
```

#### Get Similar Quotes
```http
GET /api/quotes/:id/similar?limit=10
```

### GraphQL Schema

```graphql
type Query {
  randomQuote: Quote!
  quote(id: ID!): Quote
  similarQuotes(id: ID!, limit: Int = 10): [SimilarQuote!]!
}

type Mutation {
  likeQuote(id: ID!): Quote!
}

type Quote {
  id: ID!
  text: String!
  author: String!
  tags: [String!]
  likes: Int!
  source: String!
  createdAt: String!
  updatedAt: String!
}
```

## Project Structure

```
src/
├── config/          # Configuration and environment setup
├── graphql/         # GraphQL schema and resolvers
├── repositories/    # Data access layer
├── routes/          # REST API routes
├── schemas/         # Zod validation schemas
├── services/        # Business logic
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
└── test/            # Test setup and utilities
```

## Environment Variables

See `.env.example` for all available configuration options.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request
