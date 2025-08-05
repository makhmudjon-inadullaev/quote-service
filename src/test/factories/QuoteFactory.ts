import { v4 as uuidv4 } from 'uuid';
import { Quote } from '../../types';

export interface QuoteFactoryOptions {
  id?: string;
  text?: string;
  author?: string;
  tags?: string[];
  likes?: number;
  source?: 'quotable' | 'dummyjson' | 'internal';
  createdAt?: Date;
  updatedAt?: Date;
}

export class QuoteFactory {
  private static defaultQuotes = [
    {
      text: 'The only way to do great work is to love what you do.',
      author: 'Steve Jobs',
      tags: ['work', 'passion', 'success']
    },
    {
      text: 'Innovation distinguishes between a leader and a follower.',
      author: 'Steve Jobs',
      tags: ['innovation', 'leadership']
    },
    {
      text: 'Life is what happens to you while you\'re busy making other plans.',
      author: 'John Lennon',
      tags: ['life', 'planning', 'wisdom']
    },
    {
      text: 'The future belongs to those who believe in the beauty of their dreams.',
      author: 'Eleanor Roosevelt',
      tags: ['dreams', 'future', 'belief']
    },
    {
      text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.',
      author: 'Winston Churchill',
      tags: ['success', 'failure', 'courage']
    },
    {
      text: 'The only impossible journey is the one you never begin.',
      author: 'Tony Robbins',
      tags: ['journey', 'beginning', 'motivation']
    },
    {
      text: 'In the middle of difficulty lies opportunity.',
      author: 'Albert Einstein',
      tags: ['difficulty', 'opportunity', 'wisdom']
    },
    {
      text: 'Believe you can and you\'re halfway there.',
      author: 'Theodore Roosevelt',
      tags: ['belief', 'confidence', 'motivation']
    }
  ];

  static create(options: QuoteFactoryOptions = {}): Quote {
    const defaultQuote = this.defaultQuotes[Math.floor(Math.random() * this.defaultQuotes.length)];
    const now = new Date();

    return {
      id: options.id || uuidv4(),
      text: options.text || defaultQuote.text,
      author: options.author || defaultQuote.author,
      tags: options.tags || defaultQuote.tags,
      likes: options.likes || 0,
      source: options.source || 'internal',
      createdAt: options.createdAt || now,
      updatedAt: options.updatedAt || now,
    };
  }

  static createMany(count: number, options: QuoteFactoryOptions = {}): Quote[] {
    return Array.from({ length: count }, (_, index) => 
      this.create({
        ...options,
        id: options.id ? `${options.id}-${index}` : undefined,
      })
    );
  }

  static createSimilarQuotes(baseText: string, count: number = 3): Quote[] {
    const keywords = baseText.toLowerCase().split(' ').filter(word => word.length > 3);
    const similarTexts = [
      `${keywords[0]} leads to great achievements in life`,
      `The power of ${keywords[1]} cannot be underestimated`,
      `Through ${keywords[0]} and ${keywords[1]}, we find our path`,
      `${keywords[0]} is the foundation of all ${keywords[1]}`,
      `When ${keywords[0]} meets opportunity, ${keywords[1]} follows`,
    ];

    return similarTexts.slice(0, count).map((text, index) => 
      this.create({
        text,
        author: `Similar Author ${index + 1}`,
        tags: keywords.slice(0, 2),
        likes: Math.floor(Math.random() * 10),
      })
    );
  }

  static createWithHighLikes(likes: number = 100): Quote {
    return this.create({
      text: 'This is a highly liked quote that should appear more frequently',
      author: 'Popular Author',
      tags: ['popular', 'liked'],
      likes,
    });
  }

  static createWithTags(tags: string[]): Quote {
    return this.create({
      text: `A quote about ${tags.join(' and ')}`,
      author: 'Tagged Author',
      tags,
    });
  }

  static createFromExternalAPI(source: 'quotable' | 'dummyjson' = 'quotable'): Quote {
    const externalQuotes = {
      quotable: [
        {
          text: 'The best time to plant a tree was 20 years ago. The second best time is now.',
          author: 'Chinese Proverb',
          tags: ['wisdom', 'time', 'action']
        },
        {
          text: 'Your limitation—it\'s only your imagination.',
          author: 'Unknown',
          tags: ['limitation', 'imagination', 'motivation']
        }
      ],
      dummyjson: [
        {
          text: 'Life is really simple, but we insist on making it complicated.',
          author: 'Confucius',
          tags: ['life', 'simplicity', 'wisdom']
        },
        {
          text: 'The way to get started is to quit talking and begin doing.',
          author: 'Walt Disney',
          tags: ['action', 'beginning', 'motivation']
        }
      ]
    };

    const sourceQuotes = externalQuotes[source];
    const randomQuote = sourceQuotes[Math.floor(Math.random() * sourceQuotes.length)];

    return this.create({
      ...randomQuote,
      source,
    });
  }
}