import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { ExternalQuote, ErrorCode, QuoteServiceError } from '../types';
import { cacheService } from './CacheService';

export interface QuotableResponse {
  _id: string;
  content: string;
  author: string;
  tags: string[];
}

export interface DummyJSONResponse {
  id: number;
  quote: string;
  author: string;
}

export class ExternalAPIClient {
  private quotableClient: AxiosInstance;
  private dummyJSONClient: AxiosInstance;
  private readonly maxRetries: number = 3;
  private readonly baseDelay: number = 1000;

  constructor() {
    this.quotableClient = axios.create({
      baseURL: 'https://api.quotable.io',
      timeout: 5000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'quote-service/1.0.0'
      }
    });

    this.dummyJSONClient = axios.create({
      baseURL: 'https://dummyjson.com',
      timeout: 5000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'quote-service/1.0.0'
      }
    });
  }

  /**
   * Fetch a random quote from quotable.io
   */
  async fetchFromQuotable(): Promise<ExternalQuote> {
    const cacheKey = 'quotable_random';
    
    // Try to get from cache first
    const cached = await cacheService.getExternalApiResponse(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.quotableClient.get<QuotableResponse>('/random');
      });

      const externalQuote = {
        _id: response.data._id,
        content: response.data.content,
        author: response.data.author,
        tags: response.data.tags
      };

      // Cache the response
      await cacheService.setExternalApiResponse(cacheKey, externalQuote);

      return externalQuote;
    } catch (error) {
      throw new QuoteServiceError(
        ErrorCode.EXTERNAL_API_ERROR,
        `Failed to fetch quote from quotable.io: ${error instanceof Error ? error.message : 'Unknown error'}`,
        503,
        { source: 'quotable', originalError: error }
      );
    }
  }

  /**
   * Fetch a random quote from dummyjson.com as fallback
   */
  async fetchFromDummyJSON(): Promise<ExternalQuote> {
    const cacheKey = 'dummyjson_random';
    
    // Try to get from cache first
    const cached = await cacheService.getExternalApiResponse(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.dummyJSONClient.get<DummyJSONResponse>('/quotes/random');
      });

      const externalQuote = {
        id: response.data.id,
        quote: response.data.quote,
        author: response.data.author
      };

      // Cache the response
      await cacheService.setExternalApiResponse(cacheKey, externalQuote);

      return externalQuote;
    } catch (error) {
      throw new QuoteServiceError(
        ErrorCode.EXTERNAL_API_ERROR,
        `Failed to fetch quote from dummyjson.com: ${error instanceof Error ? error.message : 'Unknown error'}`,
        503,
        { source: 'dummyjson', originalError: error }
      );
    }
  }

  /**
   * Fetch a random quote with fallback strategy
   * First tries quotable.io, then falls back to dummyjson.com
   */
  async fetchRandomQuote(): Promise<ExternalQuote> {
    try {
      return await this.fetchFromQuotable();
    } catch (quotableError) {
      console.warn('Quotable.io failed, trying fallback:', quotableError);
      
      try {
        return await this.fetchFromDummyJSON();
      } catch (fallbackError) {
        throw new QuoteServiceError(
          ErrorCode.EXTERNAL_API_ERROR,
          'All external quote services are unavailable',
          503,
          { 
            quotableError: quotableError instanceof Error ? quotableError.message : quotableError,
            dummyJSONError: fallbackError instanceof Error ? fallbackError.message : fallbackError
          }
        );
      }
    }
  }

  /**
   * Retry logic with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<AxiosResponse<T>>,
    attempt: number = 1
  ): Promise<AxiosResponse<T>> {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= this.maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = this.baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      
      console.warn(`API request failed (attempt ${attempt}/${this.maxRetries}), retrying in ${Math.round(delay)}ms:`, 
        error instanceof Error ? error.message : error);
      
      await this.sleep(delay);
      return this.retryWithBackoff(operation, attempt + 1);
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}