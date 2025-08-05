import { Quote, SimilarityScore } from '../types';

/**
 * SimilarityEngine class for calculating text similarity between quotes
 * Implements keyword matching and semantic similarity analysis
 */
export class SimilarityEngine {
  private readonly MINIMUM_SIMILARITY_SCORE = 0.08;
  private readonly KEYWORD_WEIGHT = 0.4;
  private readonly SEMANTIC_WEIGHT = 0.6;

  /**
   * Find similar quotes to a target quote
   * @param targetQuote The quote to find similarities for
   * @param candidateQuotes Array of quotes to compare against
   * @param limit Maximum number of similar quotes to return
   * @returns Array of similarity scores ordered by relevance
   */
  async findSimilarQuotes(
    targetQuote: Quote,
    candidateQuotes: Quote[],
    limit: number = 10
  ): Promise<SimilarityScore[]> {
    const similarities: SimilarityScore[] = [];

    for (const candidate of candidateQuotes) {
      // Skip the target quote itself
      if (candidate.id === targetQuote.id) {
        continue;
      }

      const score = this.calculateOverallSimilarity(targetQuote, candidate);
      
      // Only include quotes that meet minimum similarity threshold
      if (score >= this.MINIMUM_SIMILARITY_SCORE) {
        similarities.push({
          quote: candidate,
          score
        });
      }
    }

    // Sort by similarity score in descending order and limit results
    return similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Calculate overall similarity between two quotes
   * Combines keyword matching and semantic similarity
   */
  private calculateOverallSimilarity(quote1: Quote, quote2: Quote): number {
    const keywordSimilarity = this.calculateKeywordSimilarity(quote1, quote2);
    const semanticSimilarity = this.calculateSemanticSimilarity(quote1, quote2);

    return (keywordSimilarity * this.KEYWORD_WEIGHT) + 
           (semanticSimilarity * this.SEMANTIC_WEIGHT);
  }

  /**
   * Calculate text similarity using keyword matching
   * Uses Jaccard similarity coefficient for keyword overlap
   */
  private calculateKeywordSimilarity(quote1: Quote, quote2: Quote): number {
    const keywords1 = this.extractKeywords(quote1.text);
    const keywords2 = this.extractKeywords(quote2.text);

    if (keywords1.length === 0 && keywords2.length === 0) {
      return 0;
    }

    const intersection = keywords1.filter(keyword => keywords2.includes(keyword));
    const union = [...new Set([...keywords1, ...keywords2])];

    // Jaccard similarity coefficient
    return intersection.length / union.length;
  }

  /**
   * Calculate semantic similarity between quotes
   * Considers author similarity, tag overlap, and text length similarity
   */
  private calculateSemanticSimilarity(quote1: Quote, quote2: Quote): number {
    let semanticScore = 0;
    let totalWeight = 0;

    // Author similarity (exact match gets high score)
    const authorWeight = 0.5;
    if (quote1.author.toLowerCase() === quote2.author.toLowerCase()) {
      semanticScore += 0.9 * authorWeight;
    } else {
      const authorSim = this.calculateAuthorSimilarity(quote1.author, quote2.author);
      if (authorSim > 0.7) {
        semanticScore += authorSim * authorWeight;
      }
    }
    totalWeight += authorWeight;

    // Tag similarity
    const tagWeight = 0.3;
    const tagSimilarity = this.calculateTagSimilarity(quote1.tags || [], quote2.tags || []);
    semanticScore += tagSimilarity * tagWeight;
    totalWeight += tagWeight;

    // Text length similarity (similar length quotes might be more related)
    const lengthWeight = 0.2;
    const lengthSimilarity = this.calculateLengthSimilarity(quote1.text, quote2.text);
    semanticScore += lengthSimilarity * lengthWeight;
    totalWeight += lengthWeight;

    return totalWeight > 0 ? semanticScore / totalWeight : 0;
  }

  /**
   * Extract meaningful keywords from quote text
   * Removes common stop words and normalizes text
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
      'can', 'shall', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
      'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its',
      'our', 'their', 'not', 'no', 'yes'
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .filter((word, index, arr) => arr.indexOf(word) === index); // Remove duplicates
  }

  /**
   * Calculate similarity between author names
   * Uses simple string similarity for author matching
   */
  private calculateAuthorSimilarity(author1: string, author2: string): number {
    const name1 = author1.toLowerCase().trim();
    const name2 = author2.toLowerCase().trim();

    if (name1 === name2) return 1;

    // Check if one name is contained in the other (e.g., "Mark Twain" vs "Twain")
    if (name1.includes(name2) || name2.includes(name1)) {
      return 0.8;
    }

    // Simple Levenshtein-like similarity
    const maxLength = Math.max(name1.length, name2.length);
    const distance = this.calculateLevenshteinDistance(name1, name2);
    
    return Math.max(0, (maxLength - distance) / maxLength);
  }

  /**
   * Calculate tag similarity using Jaccard coefficient
   */
  private calculateTagSimilarity(tags1: string[], tags2: string[]): number {
    if (tags1.length === 0 && tags2.length === 0) {
      return 0.5; // Neutral score when both have no tags
    }

    if (tags1.length === 0 || tags2.length === 0) {
      return 0; // No similarity if one has tags and other doesn't
    }

    const normalizedTags1 = tags1.map(tag => tag.toLowerCase());
    const normalizedTags2 = tags2.map(tag => tag.toLowerCase());

    const intersection = normalizedTags1.filter(tag => normalizedTags2.includes(tag));
    const union = [...new Set([...normalizedTags1, ...normalizedTags2])];

    return intersection.length / union.length;
  }

  /**
   * Calculate similarity based on text length
   * Quotes of similar length might be more related
   */
  private calculateLengthSimilarity(text1: string, text2: string): number {
    const len1 = text1.length;
    const len2 = text2.length;
    const maxLength = Math.max(len1, len2);
    const minLength = Math.min(len1, len2);

    if (maxLength === 0) return 1;

    return minLength / maxLength;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * Used for author name similarity
   */
  private calculateLevenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}