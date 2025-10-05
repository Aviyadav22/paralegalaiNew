/**
 * Gemini Reranker
 * Uses Google's Gemini API for reranking search results
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");

class GeminiReranker {
  constructor(apiKey, model = "gemini-2.0-flash-lite") {
    if (!apiKey) {
      throw new Error("Gemini API key is required for reranking");
    }
    this.apiKey = apiKey;
    this.model = model;
    this.client = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Rerank documents using Gemini
   * @param {string} query - The search query
   * @param {Array} documents - Array of documents to rerank
   * @returns {Promise<Array>} Documents with reranker scores
   */
  async rerank(query, documents) {
    try {
      if (!documents || documents.length === 0) {
        return [];
      }

      console.log(`[GeminiReranker] Reranking ${documents.length} documents`);

      // Gemini doesn't have a native reranking endpoint, so we'll use chat to score relevance
      const model = this.client.getGenerativeModel({ model: this.model });

      // Create scoring prompt
      const prompt = this.buildScoringPrompt(query, documents);

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse scores from response
      const scores = this.parseScores(text, documents.length);

      // Attach scores to documents
      const rankedDocs = documents.map((doc, idx) => ({
        ...doc,
        rerankerScore: scores[idx] || 0.5, // Default to 0.5 if parsing fails
      }));

      // Sort by reranker score
      rankedDocs.sort((a, b) => b.rerankerScore - a.rerankerScore);

      console.log(`[GeminiReranker] Reranking complete`);
      return rankedDocs;
    } catch (error) {
      console.error(`[GeminiReranker] Error:`, error.message);
      // Return documents with default scores
      return documents.map(doc => ({ ...doc, rerankerScore: 0.5 }));
    }
  }

  /**
   * Build scoring prompt for Gemini
   */
  buildScoringPrompt(query, documents) {
    const docList = documents
      .map((doc, idx) => {
        const text = doc.text || doc.pageContent || '';
        const title = doc.title || doc.metadata?.title || 'Untitled';
        const preview = text.substring(0, 500);
        return `[${idx}] Title: ${title}\nText: ${preview}...`;
      })
      .join('\n\n');

    return `You are a legal document relevance scorer. Given a query and a list of legal documents, score each document's relevance to the query on a scale of 0.0 to 1.0.

Query: "${query}"

Documents:
${docList}

Instructions:
1. Score each document based on how relevant it is to the query
2. Consider legal context, case facts, legal principles, and terminology
3. Return ONLY a JSON array of scores in the same order as documents
4. Format: [0.95, 0.82, 0.67, ...]

Scores:`;
  }

  /**
   * Parse scores from Gemini response
   */
  parseScores(text, expectedCount) {
    try {
      // Try to extract JSON array from response
      const jsonMatch = text.match(/\[([\d\s.,]+)\]/);
      if (jsonMatch) {
        const scoresStr = jsonMatch[1];
        const scores = scoresStr
          .split(',')
          .map(s => parseFloat(s.trim()))
          .filter(s => !isNaN(s));

        if (scores.length === expectedCount) {
          // Normalize scores to 0-1 range
          return scores.map(s => Math.min(Math.max(s, 0), 1));
        }
      }

      // Fallback: try to extract individual numbers
      const numbers = text.match(/\d+\.\d+/g);
      if (numbers && numbers.length >= expectedCount) {
        return numbers
          .slice(0, expectedCount)
          .map(n => Math.min(Math.max(parseFloat(n), 0), 1));
      }
    } catch (error) {
      console.warn(`[GeminiReranker] Score parsing failed:`, error.message);
    }

    // Return default scores
    return Array(expectedCount).fill(0.5);
  }

  /**
   * Batch rerank with rate limiting
   */
  async rerankBatch(query, documents, batchSize = 10) {
    const results = [];
    
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const rankedBatch = await this.rerank(query, batch);
      results.push(...rankedBatch);
      
      // Small delay to avoid rate limits
      if (i + batchSize < documents.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }
}

module.exports = { GeminiReranker };

