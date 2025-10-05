/**
 * Hybrid Search Reranker
 * Combines and reranks results from vector search, metadata search, and hosted reranker
 */

const { rerankerService } = require("../reranker");

class HybridReranker {
  /**
   * Rerank and merge results from multiple sources
   * @param {Array} vectorResults - Results from Qdrant vector search
   * @param {Array} metadataResults - Results from PostgreSQL metadata search
   * @param {string} query - Original user query
   * @param {Object} options - Reranking options
   * @returns {Promise<Array>} Reranked and merged results
   */
  static async rerank(vectorResults = [], metadataResults = [], query = "", options = {}) {
    const {
      semanticWeight = 0.7,          // Weight for semantic similarity (Qdrant)
      rerankerWeight = 0.2,          // Weight for hosted reranker model
      metadataWeight = 0.1,          // Weight for metadata relevance (PostgreSQL)
      maxResults = 10,               // Maximum number of results to return
      diversityFactor = 0.1,         // Factor to promote diversity
      useHostedReranker = true,      // Whether to use hosted reranker
    } = options;

    try {
      // Step 1: Create a map of all unique documents
      const documentMap = new Map();
      const queryTerms = this.tokenize(query.toLowerCase());

      // Step 2: Process vector search results
      for (const result of vectorResults) {
        const docId = result.id || result.docId;
        if (!docId) continue;

        const baseScore = result.score || result.similarity || 0;
        documentMap.set(docId, {
          ...result,
          docId,
          vectorScore: baseScore,
          metadataScore: 0,
          metadataMatch: false,
          source: 'vector',
          combinedScore: 0,
        });
      }

      // Step 3: Process and merge metadata search results
      for (const result of metadataResults) {
        const docId = result.doc_id;
        if (!docId) continue;

        // Calculate metadata relevance score
        const metadataRelevance = this.calculateMetadataRelevance(result, queryTerms);

        if (documentMap.has(docId)) {
          // Document found in both sources - boost it
          const existing = documentMap.get(docId);
          existing.metadataScore = metadataRelevance;
          existing.metadataMatch = true;
          existing.metadata = { ...existing.metadata, ...result };
          existing.source = 'hybrid';
        } else {
          // Document only from metadata search
          documentMap.set(docId, {
            docId,
            vectorScore: 0,
            metadataScore: metadataRelevance,
            metadataMatch: true,
            metadata: result,
            source: 'metadata',
            combinedScore: 0,
            // Metadata-only results need text for display
            text: this.formatMetadataAsText(result),
            title: result.title || 'Untitled',
          });
        }
      }

      // Step 4: Use hosted reranker if available and enabled
      let rerankerScores = new Map();
      if (useHostedReranker && rerankerService.isAvailable()) {
        try {
          console.log(`[HybridReranker] Using hosted reranker model`);
          const allDocs = Array.from(documentMap.values());
          const rerankedDocs = await rerankerService.rerank(query, allDocs);
          
          // Store reranker scores
          rerankedDocs.forEach(doc => {
            if (doc.docId) {
              rerankerScores.set(doc.docId, doc.rerankerScore || 0.5);
            }
          });
          
          console.log(`[HybridReranker] Reranker scored ${rerankerScores.size} documents`);
        } catch (error) {
          console.error(`[HybridReranker] Hosted reranker failed:`, error.message);
        }
      }

      // Step 5: Calculate combined scores with new weighted formula
      // final_score = (0.6 * semantic_score) + (0.3 * reranker_score) + (0.1 * metadata_score)
      const scoredResults = [];
      for (const [docId, doc] of documentMap) {
        // Normalize scores to 0-1 range
        const semanticScore = Math.min(Math.max(doc.vectorScore, 0), 1);
        const metadataScore = Math.min(Math.max(doc.metadataScore, 0), 1);
        const hostedRerankerScore = rerankerScores.get(docId) || 0.5;

        // Weighted combination using lawyer-like prioritization formula
        let combinedScore = 
          (semanticScore * semanticWeight) +
          (hostedRerankerScore * rerankerWeight) +
          (metadataScore * metadataWeight);

        // Promote diversity - slightly penalize documents from same source
        if (doc.source === 'metadata' && metadataResults.length > vectorResults.length) {
          combinedScore *= (1 - diversityFactor);
        }

        doc.combinedScore = Math.min(combinedScore, 1); // Cap at 1.0
        doc.semanticScore = semanticScore;
        doc.hostedRerankerScore = hostedRerankerScore;
        doc.metadataRelevanceScore = metadataScore;
        
        scoredResults.push(doc);
      }

      // Step 6: Sort by combined score (descending)
      scoredResults.sort((a, b) => b.combinedScore - a.combinedScore);

      // Step 7: Apply diversity penalty for similar documents
      const diversifiedResults = this.applyDiversity(scoredResults, diversityFactor);

      // Step 8: Return top results
      const topResults = diversifiedResults.slice(0, maxResults);

      console.log(`[HybridReranker] Reranked ${documentMap.size} documents -> ${topResults.length} results`);
      console.log(`[HybridReranker] Sources: ${vectorResults.length} vector, ${metadataResults.length} metadata`);
      console.log(`[HybridReranker] Scoring: ${(semanticWeight*100).toFixed(0)}% semantic + ${(rerankerWeight*100).toFixed(0)}% reranker + ${(metadataWeight*100).toFixed(0)}% metadata`);

      return topResults;
    } catch (error) {
      console.error(`[HybridReranker] Error:`, error.message);
      // Fallback to vector results only
      return vectorResults.slice(0, options.maxResults || 10);
    }
  }

  /**
   * Calculate relevance score based on metadata fields
   */
  static calculateMetadataRelevance(metadata, queryTerms) {
    let score = 0.5; // Base score for metadata matches

    // Convert metadata fields to searchable text
    const searchableText = [
      metadata.title || '',
      metadata.citation || '',
      metadata.court || '',
      metadata.case_type || '',
      metadata.jurisdiction || '',
      metadata.keywords || '',
    ].join(' ').toLowerCase();

    const metadataTerms = this.tokenize(searchableText);

    // Calculate term overlap
    let matchCount = 0;
    for (const term of queryTerms) {
      if (metadataTerms.includes(term)) {
        matchCount++;
      }
    }

    if (queryTerms.length > 0) {
      const termOverlap = matchCount / queryTerms.length;
      score += termOverlap * 0.5; // Add up to 0.5 for term overlap
    }

    // Boost for specific high-value matches
    const searchableUpper = searchableText.toUpperCase();
    
    // Court name match
    if (metadata.court && queryTerms.some(t => metadata.court.toLowerCase().includes(t))) {
      score += 0.15;
    }

    // Year match
    if (metadata.year) {
      const yearStr = String(metadata.year);
      if (queryTerms.includes(yearStr)) {
        score += 0.15;
      }
    }

    // Case type match
    if (metadata.case_type && queryTerms.some(t => metadata.case_type.toLowerCase().includes(t))) {
      score += 0.1;
    }

    // Citation match (very specific)
    if (metadata.citation && queryTerms.some(t => metadata.citation.toLowerCase().includes(t))) {
      score += 0.2;
    }

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Apply diversity to avoid too many similar results
   */
  static applyDiversity(results, diversityFactor) {
    if (diversityFactor <= 0 || results.length <= 1) return results;

    const seenTitles = new Set();
    const seenCourts = new Set();
    const diversified = [];

    for (const result of results) {
      const title = result.title || result.metadata?.title || '';
      const court = result.metadata?.court || '';

      let diversityPenalty = 0;

      // Penalize if we've seen very similar titles
      if (title && seenTitles.has(this.normalizeTitle(title))) {
        diversityPenalty += diversityFactor;
      }

      // Slight penalty for same court (less aggressive)
      if (court && seenCourts.has(court)) {
        diversityPenalty += diversityFactor * 0.5;
      }

      result.combinedScore = Math.max(0, result.combinedScore - diversityPenalty);

      if (title) seenTitles.add(this.normalizeTitle(title));
      if (court) seenCourts.add(court);

      diversified.push(result);
    }

    // Re-sort after diversity adjustments
    diversified.sort((a, b) => b.combinedScore - a.combinedScore);

    return diversified;
  }

  /**
   * Normalize title for similarity comparison
   */
  static normalizeTitle(title) {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50);
  }

  /**
   * Tokenize text into terms
   */
  static tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2); // Ignore very short terms
  }

  /**
   * Format metadata as displayable text
   */
  static formatMetadataAsText(metadata) {
    const parts = [];
    
    if (metadata.title) parts.push(`Title: ${metadata.title}`);
    if (metadata.citation) parts.push(`Citation: ${metadata.citation}`);
    if (metadata.court) parts.push(`Court: ${metadata.court}`);
    if (metadata.year) parts.push(`Year: ${metadata.year}`);
    if (metadata.case_type) parts.push(`Type: ${metadata.case_type}`);
    if (metadata.petitioner) parts.push(`Petitioner: ${metadata.petitioner}`);
    if (metadata.respondent) parts.push(`Respondent: ${metadata.respondent}`);
    if (metadata.keywords) parts.push(`Keywords: ${metadata.keywords}`);

    return parts.join('\n');
  }

  /**
   * Explain scoring for debugging
   */
  static explainScores(results, topN = 3) {
    console.log(`\n[HybridReranker] Top ${topN} Results Explained:`);
    console.log(`Formula: (0.6 × semantic) + (0.3 × reranker) + (0.1 × metadata)`);
    
    for (let i = 0; i < Math.min(topN, results.length); i++) {
      const r = results[i];
      const semantic = r.semanticScore || r.vectorScore || 0;
      const reranker = r.hostedRerankerScore || 0.5;
      const metadata = r.metadataRelevanceScore || r.metadataScore || 0;
      
      console.log(`\n${i + 1}. Final Score: ${r.combinedScore.toFixed(3)}`);
      console.log(`   └─ Semantic (60%): ${semantic.toFixed(3)} → ${(semantic * 0.6).toFixed(3)}`);
      console.log(`   └─ Reranker (30%): ${reranker.toFixed(3)} → ${(reranker * 0.3).toFixed(3)}`);
      console.log(`   └─ Metadata (10%): ${metadata.toFixed(3)} → ${(metadata * 0.1).toFixed(3)}`);
      console.log(`   Title: ${r.title || r.metadata?.title || 'N/A'}`);
      console.log(`   Source: ${r.source} | Hybrid Match: ${r.metadataMatch ? 'Yes' : 'No'}`);
    }
  }
}

module.exports = { HybridReranker };

