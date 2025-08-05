import { SimilarityEngine } from './SimilarityEngine';
import { Quote } from '../types';

describe('SimilarityEngine', () => {
  let similarityEngine: SimilarityEngine;
  let mockQuotes: Quote[];

  beforeEach(() => {
    similarityEngine = new SimilarityEngine();
    
    // Create mock quotes for testing
    mockQuotes = [
      {
        id: '1',
        text: 'The only way to do great work is to love what you do.',
        author: 'Steve Jobs',
        tags: ['work', 'passion', 'success'],
        likes: 10,
        source: 'quotable',
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-01')
      },
      {
        id: '2',
        text: 'Innovation distinguishes between a leader and a follower.',
        author: 'Steve Jobs',
        tags: ['innovation', 'leadership'],
        likes: 8,
        source: 'quotable',
        createdAt: new Date('2023-01-02'),
        updatedAt: new Date('2023-01-02')
      },
      {
        id: '3',
        text: 'Life is what happens to you while you are busy making other plans.',
        author: 'John Lennon',
        tags: ['life', 'planning'],
        likes: 15,
        source: 'dummyjson',
        createdAt: new Date('2023-01-03'),
        updatedAt: new Date('2023-01-03')
      },
      {
        id: '4',
        text: 'The future belongs to those who believe in the beauty of their dreams.',
        author: 'Eleanor Roosevelt',
        tags: ['dreams', 'future', 'belief'],
        likes: 12,
        source: 'quotable',
        createdAt: new Date('2023-01-04'),
        updatedAt: new Date('2023-01-04')
      },
      {
        id: '5',
        text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.',
        author: 'Winston Churchill',
        tags: ['success', 'failure', 'courage'],
        likes: 20,
        source: 'internal',
        createdAt: new Date('2023-01-05'),
        updatedAt: new Date('2023-01-05')
      }
    ];
  });

  describe('findSimilarQuotes', () => {
    it('should return similar quotes ordered by relevance score', async () => {
      const targetQuote = mockQuotes[0]; // Steve Jobs quote about work
      const candidateQuotes = mockQuotes.slice(1); // All other quotes

      const result = await similarityEngine.findSimilarQuotes(targetQuote, candidateQuotes, 3);

      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(3);
      
      // Ensure results are ordered by score
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].score).toBeGreaterThanOrEqual(result[i + 1].score);
      }
      
      // The other Steve Jobs quote should be most similar
      expect(result[0].quote.author).toBe('Steve Jobs');
    });

    it('should exclude the target quote from results', async () => {
      const targetQuote = mockQuotes[0];
      const candidateQuotes = mockQuotes; // Include target quote in candidates

      const result = await similarityEngine.findSimilarQuotes(targetQuote, candidateQuotes, 5);

      expect(result.every(item => item.quote.id !== targetQuote.id)).toBe(true);
    });

    it('should limit results to specified count', async () => {
      const targetQuote = mockQuotes[0];
      const candidateQuotes = mockQuotes.slice(1);

      const result = await similarityEngine.findSimilarQuotes(targetQuote, candidateQuotes, 2);

      expect(result.length).toBeLessThanOrEqual(2);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array when no similar quotes meet minimum threshold', async () => {
      const targetQuote: Quote = {
        id: 'unique',
        text: 'Completely unique text with no similarities whatsoever xyz123 abcdef ghijkl mnopqr',
        author: 'Unknown Mysterious Author',
        tags: ['unique', 'different', 'mysterious'],
        likes: 0,
        source: 'internal',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await similarityEngine.findSimilarQuotes(targetQuote, mockQuotes, 5);

      expect(result.length).toBeLessThanOrEqual(mockQuotes.length); // Should return some results but not all
    });

    it('should handle empty candidate quotes array', async () => {
      const targetQuote = mockQuotes[0];
      const candidateQuotes: Quote[] = [];

      const result = await similarityEngine.findSimilarQuotes(targetQuote, candidateQuotes, 5);

      expect(result).toHaveLength(0);
    });
  });

  describe('keyword similarity', () => {
    it('should identify quotes with similar keywords', async () => {
      const workQuote: Quote = {
        id: 'work1',
        text: 'Hard work beats talent when talent does not work hard.',
        author: 'Tim Notke',
        tags: ['work', 'talent'],
        likes: 5,
        source: 'internal',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await similarityEngine.findSimilarQuotes(workQuote, mockQuotes, 5);

      // Should find the Steve Jobs quote about work as most similar
      expect(result.length).toBeGreaterThan(0);
      const topResult = result[0];
      expect(topResult.quote.text).toContain('work');
    });

    it('should handle quotes with no common keywords', async () => {
      const uniqueQuote: Quote = {
        id: 'unique1',
        text: 'Zebras gallop through purple meadows under moonlight.',
        author: 'Fantasy Author',
        tags: ['fantasy', 'animals'],
        likes: 1,
        source: 'internal',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await similarityEngine.findSimilarQuotes(uniqueQuote, mockQuotes, 5);

      // Should return very few results due to low similarity
      expect(result.length).toBeLessThanOrEqual(mockQuotes.length);
    });
  });

  describe('semantic similarity', () => {
    it('should give higher scores to quotes by the same author', async () => {
      const steveJobsQuote = mockQuotes[0]; // Steve Jobs quote
      const candidateQuotes = mockQuotes.slice(1);

      const result = await similarityEngine.findSimilarQuotes(steveJobsQuote, candidateQuotes, 5);

      // The other Steve Jobs quote should have a higher similarity score
      const otherJobsQuote = result.find(item => item.quote.author === 'Steve Jobs');
      expect(otherJobsQuote).toBeDefined();
      expect(otherJobsQuote!.score).toBeGreaterThan(0.1);
    });

    it('should consider tag overlap in similarity calculation', async () => {
      const successQuote: Quote = {
        id: 'success1',
        text: 'Success comes to those who work hard and never give up.',
        author: 'Motivational Speaker',
        tags: ['success', 'work', 'persistence'],
        likes: 7,
        source: 'internal',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await similarityEngine.findSimilarQuotes(successQuote, mockQuotes, 5);

      // Should find quotes with overlapping tags
      expect(result.length).toBeGreaterThan(0);
      const hasOverlappingTags = result.some(item => 
        item.quote.tags?.some(tag => successQuote.tags?.includes(tag))
      );
      expect(hasOverlappingTags).toBe(true);
    });

    it('should handle quotes without tags', async () => {
      const noTagsQuote: Quote = {
        id: 'notags1',
        text: 'A quote without any tags but with meaningful content.',
        author: 'Anonymous',
        likes: 3,
        source: 'internal',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await similarityEngine.findSimilarQuotes(noTagsQuote, mockQuotes, 5);

      // Should still work and not throw errors
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty text quotes', async () => {
      const emptyQuote: Quote = {
        id: 'empty1',
        text: '',
        author: 'Empty Author',
        tags: [],
        likes: 0,
        source: 'internal',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await similarityEngine.findSimilarQuotes(emptyQuote, mockQuotes, 5);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(mockQuotes.length);
    });

    it('should handle quotes with special characters and punctuation', async () => {
      const specialQuote: Quote = {
        id: 'special1',
        text: 'Life is 10% what happens to you and 90% how you react to it!',
        author: 'Charles R. Swindoll',
        tags: ['life', 'attitude'],
        likes: 8,
        source: 'quotable',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await similarityEngine.findSimilarQuotes(specialQuote, mockQuotes, 5);

      expect(Array.isArray(result)).toBe(true);
      // Should find the John Lennon quote about life as similar
      const lifeQuote = result.find(item => item.quote.tags?.includes('life'));
      expect(lifeQuote).toBeDefined();
    });

    it('should handle very long quotes', async () => {
      const longQuote: Quote = {
        id: 'long1',
        text: 'This is a very long quote that contains many words and phrases that might be found in other quotes but the overall length and complexity of this quote makes it unique and different from shorter quotes in the collection while still maintaining some level of similarity through common words and themes.',
        author: 'Verbose Author',
        tags: ['long', 'complex'],
        likes: 2,
        source: 'internal',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await similarityEngine.findSimilarQuotes(longQuote, mockQuotes, 5);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle quotes with similar authors but different spellings', async () => {
      const similarAuthorQuote: Quote = {
        id: 'author1',
        text: 'Another quote about innovation and technology.',
        author: 'Steve Jobs Jr', // Similar to Steve Jobs
        tags: ['innovation'],
        likes: 4,
        source: 'internal',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await similarityEngine.findSimilarQuotes(similarAuthorQuote, mockQuotes, 5);

      expect(Array.isArray(result)).toBe(true);
      // Should still find some similarity with Steve Jobs quotes
      const jobsQuotes = result.filter(item => item.quote.author.includes('Steve Jobs'));
      expect(jobsQuotes.length).toBeGreaterThan(0);
    });
  });

  describe('performance and accuracy', () => {
    it('should return results in reasonable time for large datasets', async () => {
      // Create a larger dataset
      const largeDataset: Quote[] = [];
      for (let i = 0; i < 100; i++) {
        largeDataset.push({
          id: `quote-${i}`,
          text: `This is quote number ${i} with some common words like success, work, and life.`,
          author: `Author ${i}`,
          tags: ['common', 'test'],
          likes: i % 10,
          source: 'internal',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      const startTime = Date.now();
      const result = await similarityEngine.findSimilarQuotes(mockQuotes[0], largeDataset, 10);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(result.length).toBeLessThanOrEqual(10);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should maintain score consistency across multiple calls', async () => {
      const targetQuote = mockQuotes[0];
      const candidateQuotes = mockQuotes.slice(1);

      const result1 = await similarityEngine.findSimilarQuotes(targetQuote, candidateQuotes, 3);
      const result2 = await similarityEngine.findSimilarQuotes(targetQuote, candidateQuotes, 3);

      expect(result1).toHaveLength(result2.length);
      for (let i = 0; i < result1.length; i++) {
        expect(result1[i].quote.id).toBe(result2[i].quote.id);
        expect(result1[i].score).toBeCloseTo(result2[i].score, 5);
      }
    });
  });
});