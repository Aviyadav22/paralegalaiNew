/**
 * Cohere Reranker
 * Uses Cohere's native rerank API endpoint
 */

class CohereReranker {
  constructor(apiKey, model = "rerank-english-v3.0") {
    if (!apiKey) {
      throw new Error("Cohere API key is required for reranking");
    }
    this.apiKey = apiKey;
    this.model = model;
    this.endpoint = "https://api.cohere.ai/v1/rerank";
  }

  /**
   * Rerank documents using Cohere's rerank API
   * @param {string} query - The search query
   * @param {Array} documents - Array of documents to rerank
   * @returns {Promise<Array>} Documents with reranker scores
   */
  async rerank(query, documents) {
    try {
      if (!documents || documents.length === 0) {
        return [];
      }

      console.log(`[CohereReranker] Reranking ${documents.length} documents`);

      // Prepare documents for Cohere API
      const cohereDocuments = documents.map(doc => {
        const text = doc.text || doc.pageContent || '';
        const title = doc.title || doc.metadata?.title || '';
        return title ? `${title}\n\n${text}` : text;
      });

      // Call Cohere rerank API
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          query: query,
          documents: cohereDocuments,
          top_n: documents.length, // Return all with scores
          return_documents: false, // We already have the documents
        }),
      });

      if (!response.ok) {
        throw new Error(`Cohere API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Map scores back to documents
      const rankedDocs = documents.map((doc, idx) => {
        const result = data.results?.find(r => r.index === idx);
        return {
          ...doc,
          rerankerScore: result?.relevance_score || 0.5,
        };
      });

      // Sort by reranker score
      rankedDocs.sort((a, b) => b.rerankerScore - a.rerankerScore);

      console.log(`[CohereReranker] Reranking complete`);
      return rankedDocs;
    } catch (error) {
      console.error(`[CohereReranker] Error:`, error.message);
      // Return documents with default scores
      return documents.map(doc => ({ ...doc, rerankerScore: 0.5 }));
    }
  }

  /**
   * Batch rerank with rate limiting
   */
  async rerankBatch(query, documents, batchSize = 100) {
    // Cohere can handle up to 100 documents per request
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

module.exports = { CohereReranker };

