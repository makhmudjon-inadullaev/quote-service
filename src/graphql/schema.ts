export const typeDefs = `
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

  type SimilarQuote {
    quote: Quote!
    score: Float!
  }

  type Query {
    randomQuote: Quote!
    quote(id: ID!): Quote
    similarQuotes(id: ID!, limit: Int = 10): [SimilarQuote!]!
  }

  type Mutation {
    likeQuote(id: ID!): Quote!
  }
`;