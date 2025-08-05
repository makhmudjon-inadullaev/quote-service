import { Quote } from '../../types';
import { QuoteFactory } from '../factories/QuoteFactory';

export class TestDataFixtures {
  // Predefined test quotes for consistent testing
  static readonly SAMPLE_QUOTES = [
    {
      text: 'The only way to do great work is to love what you do.',
      author: 'Steve Jobs',
      tags: ['work', 'passion', 'success'],
      likes: 25
    },
    {
      text: 'Innovation distinguishes between a leader and a follower.',
      author: 'Steve Jobs',
      tags: ['innovation', 'leadership'],
      likes: 18
    },
    {
      text: 'Life is what happens to you while you\'re busy making other plans.',
      author: 'John Lennon',
      tags: ['life', 'planning', 'wisdom'],
      likes: 42
    },
    {
      text: 'The future belongs to those who believe in the beauty of their dreams.',
      author: 'Eleanor Roosevelt',
      tags: ['dreams', 'future', 'belief'],
      likes: 33
    },
    {
      text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.',
      author: 'Winston Churchill',
      tags: ['success', 'failure', 'courage'],
      likes: 67
    }
  ];

  // Quotes specifically designed for similarity testing
  static readonly SIMILARITY_TEST_QUOTES = [
    {
      text: 'Hard work and dedication lead to success in any field',
      author: 'Success Expert',
      tags: ['work', 'dedication', 'success'],
      likes: 10
    },
    {
      text: 'Success requires persistent effort and unwavering dedication',
      author: 'Achievement Coach',
      tags: ['success', 'effort', 'dedication'],
      likes: 8
    },
    {
      text: 'Love conquers all obstacles and brings people together',
      author: 'Love Philosopher',
      tags: ['love', 'obstacles', 'unity'],
      likes: 15
    },
    {
      text: 'Wisdom comes from experience and careful observation',
      author: 'Wise Sage',
      tags: ['wisdom', 'experience', 'observation'],
      likes: 12
    },
    {
      text: 'Dedication and hard work are the foundations of achievement',
      author: 'Motivational Speaker',
      tags: ['dedication', 'work', 'achievement'],
      likes: 20
    }
  ];

  // Quotes for testing edge cases
  static readonly EDGE_CASE_QUOTES = [
    {
      text: 'A',
      author: 'Minimal Author',
      tags: ['minimal'],
      likes: 0
    },
    {
      text: 'This is an extremely long quote that goes on and on and on to test how the system handles very lengthy text content that might cause issues with similarity calculations or database storage or API responses when dealing with unusually verbose quotes',
      author: 'Verbose Author',
      tags: ['long', 'verbose', 'testing'],
      likes: 1
    },
    {
      text: 'Quote with special characters: !@#$%^&*()_+-=[]{}|;:,.<>?',
      author: 'Special Character Author',
      tags: ['special', 'characters'],
      likes: 2
    },
    {
      text: 'Quote with unicode: 你好世界 🌍 ñoño café',
      author: 'Unicode Author',
      tags: ['unicode', 'international'],
      likes: 3
    },
    {
      text: 'Quote with "quotes" and \'apostrophes\' and backslashes\\',
      author: 'Escape Character Author',
      tags: ['quotes', 'escaping'],
      likes: 4
    }
  ];

  // Performance test data
  static readonly PERFORMANCE_TEST_QUOTES = Array.from({ length: 100 }, (_, index) => ({
    text: `Performance test quote number ${index + 1} with some meaningful content about life, success, and motivation`,
    author: `Performance Author ${index + 1}`,
    tags: ['performance', 'test', `batch-${Math.floor(index / 10)}`],
    likes: Math.floor(Math.random() * 50)
  }));

  /**
   * Create a complete test dataset with various quote types
   */
  static createCompleteTestDataset(): Quote[] {
    return [
      ...this.SAMPLE_QUOTES.map(data => QuoteFactory.create(data)),
      ...this.SIMILARITY_TEST_QUOTES.map(data => QuoteFactory.create(data)),
      ...this.EDGE_CASE_QUOTES.map(data => QuoteFactory.create(data))
    ];
  }

  /**
   * Create quotes specifically for similarity testing
   */
  static createSimilarityTestDataset(): Quote[] {
    return this.SIMILARITY_TEST_QUOTES.map(data => QuoteFactory.create(data));
  }

  /**
   * Create quotes with specific like distributions for recommendation testing
   */
  static createRecommendationTestDataset(): Quote[] {
    return [
      // Low popularity quotes (0-5 likes)
      ...Array.from({ length: 10 }, (_, i) => 
        QuoteFactory.create({
          text: `Low popularity quote ${i + 1}`,
          author: `Low Author ${i + 1}`,
          tags: ['low', 'popularity'],
          likes: Math.floor(Math.random() * 6)
        })
      ),
      // Medium popularity quotes (6-20 likes)
      ...Array.from({ length: 8 }, (_, i) => 
        QuoteFactory.create({
          text: `Medium popularity quote ${i + 1}`,
          author: `Medium Author ${i + 1}`,
          tags: ['medium', 'popularity'],
          likes: 6 + Math.floor(Math.random() * 15)
        })
      ),
      // High popularity quotes (21-50 likes)
      ...Array.from({ length: 5 }, (_, i) => 
        QuoteFactory.create({
          text: `High popularity quote ${i + 1}`,
          author: `High Author ${i + 1}`,
          tags: ['high', 'popularity'],
          likes: 21 + Math.floor(Math.random() * 30)
        })
      ),
      // Viral quotes (50+ likes)
      ...Array.from({ length: 2 }, (_, i) => 
        QuoteFactory.create({
          text: `Viral quote ${i + 1}`,
          author: `Viral Author ${i + 1}`,
          tags: ['viral', 'popular'],
          likes: 50 + Math.floor(Math.random() * 100)
        })
      )
    ];
  }

  /**
   * Create quotes for performance testing
   */
  static createPerformanceTestDataset(size: number = 100): Quote[] {
    return Array.from({ length: size }, (_, index) => 
      QuoteFactory.create({
        text: `Performance test quote ${index + 1}: ${this.generateRandomText()}`,
        author: `Performance Author ${index + 1}`,
        tags: this.generateRandomTags(),
        likes: Math.floor(Math.random() * 100)
      })
    );
  }

  /**
   * Create quotes for concurrency testing
   */
  static createConcurrencyTestDataset(): Quote[] {
    return Array.from({ length: 20 }, (_, index) => 
      QuoteFactory.create({
        text: `Concurrency test quote ${index + 1}`,
        author: `Concurrent Author ${index + 1}`,
        tags: ['concurrency', 'test'],
        likes: 0 // Start with 0 likes for concurrency testing
      })
    );
  }

  /**
   * Create quotes for error testing scenarios
   */
  static createErrorTestDataset(): Quote[] {
    return [
      QuoteFactory.create({
        text: 'Valid quote for error testing',
        author: 'Error Test Author',
        tags: ['error', 'testing'],
        likes: 5
      })
    ];
  }

  /**
   * Generate random text for performance testing
   */
  private static generateRandomText(): string {
    const words = [
      'success', 'motivation', 'inspiration', 'wisdom', 'life', 'love', 'happiness',
      'achievement', 'dedication', 'perseverance', 'courage', 'strength', 'hope',
      'dreams', 'goals', 'passion', 'excellence', 'growth', 'learning', 'journey'
    ];
    
    const length = 10 + Math.floor(Math.random() * 20);
    const selectedWords = Array.from({ length }, () => 
      words[Math.floor(Math.random() * words.length)]
    );
    
    return selectedWords.join(' ');
  }

  /**
   * Generate random tags for testing
   */
  private static generateRandomTags(): string[] {
    const allTags = [
      'motivation', 'inspiration', 'success', 'life', 'wisdom', 'love',
      'happiness', 'achievement', 'growth', 'learning', 'courage', 'strength'
    ];
    
    const tagCount = 1 + Math.floor(Math.random() * 4);
    const shuffled = [...allTags].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, tagCount);
  }

  /**
   * Get test data for specific scenarios
   */
  static getTestDataForScenario(scenario: string): Quote[] {
    switch (scenario) {
      case 'similarity':
        return this.createSimilarityTestDataset();
      case 'recommendation':
        return this.createRecommendationTestDataset();
      case 'performance':
        return this.createPerformanceTestDataset();
      case 'concurrency':
        return this.createConcurrencyTestDataset();
      case 'error':
        return this.createErrorTestDataset();
      case 'complete':
      default:
        return this.createCompleteTestDataset();
    }
  }
}