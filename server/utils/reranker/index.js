/**
 * Hosted Reranker Service
 * Manages reranking using external APIs (Gemini, Cohere, OpenAI)
 */

const { GeminiReranker } = require("./providers/gemini");
const { CohereReranker } = require("./providers/cohere");
const { OpenAIReranker } = require("./providers/openai");

class RerankerService {
  constructor() {
    this.provider = null;
    this.initialized = false;
  }

  /**
   * Initialize reranker based on environment configuration
   */
  initialize() {
    if (this.initialized) return;

    const provider = process.env.RERANKER_PROVIDER?.toLowerCase();
    const enabled = process.env.RERANKER_ENABLED === "true";

    if (!enabled) {
      console.log(`[RerankerService] Reranking disabled`);
      this.initialized = true;
      return;
    }

    try {
      switch (provider) {
        case "gemini":
          const geminiKey = process.env.RERANKER_API_KEY || process.env.GEMINI_API_KEY;
          const geminiModel = process.env.RERANKER_MODEL || process.env.GEMINI_LLM_MODEL_PREF || "gemini-2.0-flash-lite";
          
          if (!geminiKey) {
            throw new Error("Gemini API key not found. Set RERANKER_API_KEY or GEMINI_API_KEY");
          }

          this.provider = new GeminiReranker(geminiKey, geminiModel);
          console.log(`[RerankerService] Initialized with Gemini (${geminiModel})`);
          break;

        case "cohere":
          const cohereKey = process.env.RERANKER_API_KEY;
          const cohereModel = process.env.RERANKER_MODEL || "rerank-english-v3.0";
          
          if (!cohereKey) {
            throw new Error("Cohere API key not found. Set RERANKER_API_KEY");
          }

          this.provider = new CohereReranker(cohereKey, cohereModel);
          console.log(`[RerankerService] Initialized with Cohere (${cohereModel})`);
          break;

        case "openai":
          const openaiKey = process.env.RERANKER_API_KEY || process.env.OPEN_AI_KEY;
          const openaiModel = process.env.RERANKER_MODEL || "gpt-4o-mini";
          
          if (!openaiKey) {
            throw new Error("OpenAI API key not found. Set RERANKER_API_KEY or OPEN_AI_KEY");
          }

          this.provider = new OpenAIReranker(openaiKey, openaiModel);
          console.log(`[RerankerService] Initialized with OpenAI (${openaiModel})`);
          break;

        default:
          console.warn(`[RerankerService] Unknown provider: ${provider}. Reranking disabled.`);
      }

      this.initialized = true;
    } catch (error) {
      console.error(`[RerankerService] Initialization failed:`, error.message);
      this.provider = null;
      this.initialized = true;
    }
  }

  /**
   * Check if reranker is available
   */
  isAvailable() {
    if (!this.initialized) this.initialize();
    return this.provider !== null;
  }

  /**
   * Rerank documents using the configured provider
   * @param {string} query - The search query
   * @param {Array} documents - Array of documents to rerank
   * @returns {Promise<Array>} Documents with reranker scores
   */
  async rerank(query, documents) {
    if (!this.initialized) this.initialize();

    if (!this.provider) {
      console.log(`[RerankerService] No provider available, skipping reranking`);
      // Return documents with default reranker scores
      return documents.map(doc => ({ ...doc, rerankerScore: 0.5 }));
    }

    try {
      return await this.provider.rerank(query, documents);
    } catch (error) {
      console.error(`[RerankerService] Reranking failed:`, error.message);
      // Return documents with default scores on error
      return documents.map(doc => ({ ...doc, rerankerScore: 0.5 }));
    }
  }

  /**
   * Rerank in batches for large document sets
   */
  async rerankBatch(query, documents, batchSize) {
    if (!this.initialized) this.initialize();

    if (!this.provider) {
      return documents.map(doc => ({ ...doc, rerankerScore: 0.5 }));
    }

    try {
      if (this.provider.rerankBatch) {
        return await this.provider.rerankBatch(query, documents, batchSize);
      }
      return await this.provider.rerank(query, documents);
    } catch (error) {
      console.error(`[RerankerService] Batch reranking failed:`, error.message);
      return documents.map(doc => ({ ...doc, rerankerScore: 0.5 }));
    }
  }

  /**
   * Get reranker configuration
   */
  getConfig() {
    if (!this.initialized) this.initialize();

    return {
      enabled: process.env.RERANKER_ENABLED === "true",
      provider: process.env.RERANKER_PROVIDER || "none",
      model: process.env.RERANKER_MODEL || "default",
      available: this.isAvailable(),
    };
  }
}

// Export singleton instance
const rerankerService = new RerankerService();

module.exports = { RerankerService, rerankerService };

