/**
 * OpenAI Reranker
 * Uses OpenAI's chat models to score document relevance
 */

class OpenAIReranker {
  constructor(apiKey, model = "gpt-4o-mini") {
    if (!apiKey) {
      throw new Error("OpenAI API key is required for reranking");
    }
    this.apiKey = apiKey;
    this.model = model;
    this.endpoint = "https://api.openai.com/v1/chat/completions";
  }

  /**
   * Rerank documents using OpenAI
   * @param {string} query - The search query
   * @param {Array} documents - Array of documents to rerank
   * @returns {Promise<Array>} Documents with reranker scores
   */
  async rerank(query, documents) {
    try {
      if (!documents || documents.length === 0) {
        return [];
      }

      console.log(`[OpenAIReranker] Reranking ${documents.length} documents`);

      // Create scoring prompt
      const messages = this.buildScoringPrompt(query, documents);

      // Call OpenAI chat API
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          temperature: 0.1, // Low temperature for consistent scoring
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      // Parse scores from response
      const scores = this.parseScores(content, documents.length);

      // Attach scores to documents
      const rankedDocs = documents.map((doc, idx) => ({
        ...doc,
        rerankerScore: scores[idx] || 0.5,
      }));

      // Sort by reranker score
      rankedDocs.sort((a, b) => b.rerankerScore - a.rerankerScore);

      console.log(`[OpenAIReranker] Reranking complete`);
      return rankedDocs;
    } catch (error) {
      console.error(`[OpenAIReranker] Error:`, error.message);
      // Return documents with default scores
      return documents.map(doc => ({ ...doc, rerankerScore: 0.5 }));
    }
  }

  /**
   * Build scoring prompt for OpenAI
   */
  buildScoringPrompt(query, documents) {
    const docList = documents
      .map((doc, idx) => {
        const text = doc.text || doc.pageContent || '';
        const title = doc.title || doc.metadata?.title || 'Untitled';
        const preview = text.substring(0, 500);
        return {
          id: idx,
          title: title,
          text: preview,
        };
      });

    return [
      {
        role: "system",
        content: `You are a legal document relevance scorer. You will receive a query and a list of legal documents. Score each document's relevance to the query on a scale of 0.0 to 1.0, where 1.0 is highly relevant and 0.0 is not relevant at all.

Consider:
- Legal terminology and concepts
- Case facts and circumstances
- Legal principles and precedents
- Jurisdictional relevance

Return your response as a JSON object with a "scores" array containing the relevance score for each document in order.`,
      },
      {
        role: "user",
        content: `Query: "${query}"

Documents:
${JSON.stringify(docList, null, 2)}

Return format: { "scores": [0.95, 0.82, 0.67, ...] }`,
      },
    ];
  }

  /**
   * Parse scores from OpenAI response
   */
  parseScores(content, expectedCount) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.scores && Array.isArray(parsed.scores)) {
        const scores = parsed.scores
          .map(s => parseFloat(s))
          .filter(s => !isNaN(s));

        if (scores.length === expectedCount) {
          // Normalize scores to 0-1 range
          return scores.map(s => Math.min(Math.max(s, 0), 1));
        }
      }
    } catch (error) {
      console.warn(`[OpenAIReranker] Score parsing failed:`, error.message);
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

module.exports = { OpenAIReranker };

