/**
 * Hybrid Search Manager
 * Coordinates parallel searches across PostgreSQL metadata and Qdrant vectors
 */

const { LegalJudgmentMetadata } = require("../../models/legalJudgmentMetadata");
const { HybridReranker } = require("./reranker");

class HybridSearchManager {
  /**
   * Perform hybrid search combining metadata filtering and vector similarity
   * @param {Object} params - Search parameters
   * @returns {Promise<Array>} Reranked search results
   */
  static async search({
    query,
    workspace,
    vectorDbInstance,
    llmConnector,
    similarityThreshold = 0.25,
    topN = 10,
    filters = {},
    rerankOptions = {},
  }) {
    try {
      console.log(`[HybridSearch] Query: "${query}"`);
      console.log(`[HybridSearch] Filters:`, filters);

      // Step 1: Parse query for metadata filters if not explicitly provided
      const enhancedFilters = { ...filters };
      if (Object.keys(filters).length === 0) {
        const extractedFilters = this.extractFiltersFromQuery(query);
        Object.assign(enhancedFilters, extractedFilters);
      }

      // Step 2: Execute parallel searches
      const [vectorResults, metadataResults] = await Promise.all([
        // Vector search in Qdrant
        this.performVectorSearch({
          query,
          workspace,
          vectorDbInstance,
          llmConnector,
          similarityThreshold,
          topN: topN * 2, // Get more results for better reranking
        }),

        // Metadata search in PostgreSQL (only if filters exist)
        Object.keys(enhancedFilters).length > 0
          ? this.performMetadataSearch({
              filters: enhancedFilters,
              workspaceId: workspace.id,
              limit: topN * 2,
            })
          : Promise.resolve([]),
      ]);

      console.log(`[HybridSearch] Vector: ${vectorResults.length}, Metadata: ${metadataResults.length}`);

      // Step 3: Rerank and merge results with hosted reranker
      const rerankedResults = await HybridReranker.rerank(
        vectorResults,
        metadataResults,
        query,
        {
          // Lawyer-like prioritization: semantic + reranker + metadata
          semanticWeight: 0.6,      // 60% weight to Qdrant cosine similarity
          rerankerWeight: 0.3,      // 30% weight to hosted reranker model
          metadataWeight: 0.1,      // 10% weight to PostgreSQL metadata
          maxResults: topN,
          useHostedReranker: true,  // Enable hosted reranker (Gemini/Cohere/OpenAI)
          ...rerankOptions,
        }
      );

      // Step 4: Enrich results with metadata
      const enrichedResults = await this.enrichResultsWithMetadata(
        rerankedResults,
        workspace.id
      );

      // Optional: Explain top results for debugging
      if (process.env.DEBUG_HYBRID_SEARCH === "true") {
        HybridReranker.explainScores(enrichedResults, 5);
      }

      return enrichedResults;
    } catch (error) {
      console.error(`[HybridSearch] Error:`, error.message);
      // Fallback to vector-only search
      return this.performVectorSearch({
        query,
        workspace,
        vectorDbInstance,
        llmConnector,
        similarityThreshold,
        topN,
      });
    }
  }

  /**
   * Perform vector similarity search in Qdrant
   */
  static async performVectorSearch({
    query,
    workspace,
    vectorDbInstance,
    llmConnector,
    similarityThreshold,
    topN,
  }) {
    try {
      if (!vectorDbInstance || !vectorDbInstance.performSimilaritySearch) {
        console.warn(`[HybridSearch] VectorDB instance not available`);
        return [];
      }

      const results = await vectorDbInstance.performSimilaritySearch({
        namespace: workspace.slug,
        input: query,
        LLMConnector: llmConnector,
        similarityThreshold,
        topN,
        filterIdentifiers: [],
        rerank: false,
      });

      // Extract sources from the results - this is the correct format
      return results?.sources || [];
    } catch (error) {
      console.error(`[HybridSearch] Vector search error:`, error.message);
      return [];
    }
  }

  /**
   * Perform metadata search in PostgreSQL
   */
  static async performMetadataSearch({ filters, workspaceId, limit }) {
    try {
      const searchParams = {
        workspace_id: workspaceId,
        limit,
      };

      // Map filters to search params
      if (filters.court) searchParams.court = filters.court;
      if (filters.year) searchParams.year = filters.year;
      if (filters.case_type) searchParams.case_type = filters.case_type;
      if (filters.jurisdiction) searchParams.jurisdiction = filters.jurisdiction;
      if (filters.judge) searchParams.judge = filters.judge;
      if (filters.citation) searchParams.citation = filters.citation;
      if (filters.keywords) searchParams.keywords = filters.keywords;
      if (filters.bench_type) searchParams.bench_type = filters.bench_type;

      // Full-text search if query-like filter
      if (filters.fulltext) searchParams.fulltext = filters.fulltext;

      const results = await LegalJudgmentMetadata.search(searchParams);
      return results;
    } catch (error) {
      console.error(`[HybridSearch] Metadata search error:`, error.message);
      return [];
    }
  }

  /**
   * Extract metadata filters from natural language query
   */
  static extractFiltersFromQuery(query) {
    const filters = {};
    const lowerQuery = query.toLowerCase();

    // Year extraction
    const yearMatch = query.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
      filters.year = parseInt(yearMatch[1]);
    }

    // Court extraction
    const courtPatterns = [
      { pattern: /supreme court/i, value: "Supreme Court of India" },
      { pattern: /high court of ([a-z\s]+)/i, value: null }, // Extract specific HC
      { pattern: /delhi high court/i, value: "High Court of Delhi" },
      { pattern: /bombay high court/i, value: "High Court of Bombay" },
      { pattern: /calcutta high court/i, value: "High Court of Calcutta" },
      { pattern: /madras high court/i, value: "High Court of Madras" },
    ];

    for (const { pattern, value } of courtPatterns) {
      const match = query.match(pattern);
      if (match) {
        filters.court = value || match[0];
        break;
      }
    }

    // Case type extraction
    const caseTypePatterns = [
      { pattern: /criminal appeal/i, value: "Criminal Appeal" },
      { pattern: /civil appeal/i, value: "Civil Appeal" },
      { pattern: /writ petition/i, value: "Writ Petition" },
      { pattern: /special leave petition|slp/i, value: "Special Leave Petition" },
      { pattern: /\bpil\b|public interest litigation/i, value: "PIL" },
      { pattern: /bail/i, value: "Bail Application" },
    ];

    for (const { pattern, value } of caseTypePatterns) {
      if (pattern.test(query)) {
        filters.case_type = value;
        break;
      }
    }

    // Jurisdiction extraction
    if (/criminal/i.test(query)) {
      filters.jurisdiction = "Criminal";
    } else if (/civil/i.test(query)) {
      filters.jurisdiction = "Civil";
    }

    // Bench type extraction
    if (/constitution bench/i.test(query)) {
      filters.bench_type = "Constitution Bench";
    } else if (/division bench/i.test(query)) {
      filters.bench_type = "Division Bench";
    }

    // Extract keywords for full-text search (remove year and court mentions)
    let cleanedQuery = query;
    if (filters.year) cleanedQuery = cleanedQuery.replace(String(filters.year), '');
    if (filters.court) cleanedQuery = cleanedQuery.replace(new RegExp(filters.court, 'gi'), '');
    if (filters.case_type) cleanedQuery = cleanedQuery.replace(new RegExp(filters.case_type, 'gi'), '');
    
    cleanedQuery = cleanedQuery.trim();
    if (cleanedQuery.length > 5) {
      filters.fulltext = cleanedQuery;
    }

    return filters;
  }

  /**
   * Enrich results with legal metadata from PostgreSQL
   */
  static async enrichResultsWithMetadata(results, workspaceId) {
    try {
      const docIds = results.map(r => r.docId).filter(Boolean);
      if (docIds.length === 0) return results;

      // Batch fetch metadata for all documents
      const metadataMap = new Map();
      for (const docId of docIds) {
        try {
          const metadata = await LegalJudgmentMetadata.get(docId);
          if (metadata) {
            metadataMap.set(docId, metadata);
          }
        } catch (error) {
          // Continue on error
        }
      }

      // Enrich results
      return results.map(result => {
        const legalMetadata = metadataMap.get(result.docId);
        if (legalMetadata) {
          return {
            ...result,
            legalMetadata,
            // Enhance display metadata
            metadata: {
              ...result.metadata,
              court: legalMetadata.court,
              year: legalMetadata.year,
              citation: legalMetadata.citation,
              case_type: legalMetadata.case_type,
            },
          };
        }
        return result;
      });
    } catch (error) {
      console.error(`[HybridSearch] Enrichment error:`, error.message);
      return results;
    }
  }

  /**
   * Get search statistics
   */
  static async getSearchStats(workspaceId) {
    try {
      const stats = await LegalJudgmentMetadata.getStats(workspaceId);
      return stats;
    } catch (error) {
      console.error(`[HybridSearch] Stats error:`, error.message);
      return null;
    }
  }

  /**
   * Get unique values for faceted search
   */
  static async getFacets(workspaceId, field) {
    try {
      const values = await LegalJudgmentMetadata.getUniqueValues(workspaceId, field);
      return values;
    } catch (error) {
      console.error(`[HybridSearch] Facets error:`, error.message);
      return [];
    }
  }
}

module.exports = { HybridSearchManager };

