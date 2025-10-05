const { executeQuery, isEnabled } = require("../utils/database/postgres");

/**
 * LegalJudgmentMetadata Model
 * 
 * Manages structured metadata for legal judgments stored in PostgreSQL.
 * This is separate from the main document storage (SQLite) to provide
 * advanced filtering and search capabilities specific to legal documents.
 * 
 * Related to workspace_documents via doc_id field.
 */
const LegalJudgmentMetadata = {
  tableName: "legal_judgment_metadata",

  /**
   * Check if PostgreSQL is enabled
   * @returns {boolean}
   */
  isAvailable: function () {
    return isEnabled();
  },

  /**
   * Create a new legal judgment metadata record
   * @param {Object} data - Metadata object
   * @param {string} data.doc_id - Document ID (links to workspace_documents.docId)
   * @param {number} data.workspace_id - Workspace ID
   * @param {string} data.title - Case title
   * @param {string} [data.citation] - Legal citation
   * @param {string} [data.case_id] - Case ID
   * @param {string} [data.cnr] - Case Number Reference
   * @param {string} [data.judge] - Judge name
   * @param {string} [data.court] - Court name
   * @param {number} [data.year] - Year of judgment
   * @param {string} [data.case_type] - Type of case
   * @param {string} [data.jurisdiction] - Jurisdiction
   * @param {string} [data.bench_type] - Type of bench
   * @param {string} [data.petitioner] - Petitioner name
   * @param {string} [data.respondent] - Respondent name
   * @param {string} [data.decision_date] - Decision date (YYYY-MM-DD)
   * @param {string} [data.filing_date] - Filing date (YYYY-MM-DD)
   * @param {Array<string>} [data.keywords] - Keywords array
   * @param {Array<string>} [data.acts_cited] - Acts cited array
   * @param {Array<string>} [data.cases_cited] - Cases cited array
   * @returns {Promise<Object|null>} Created metadata record or null
   */
  create: async function (data) {
    if (!this.isAvailable()) {
      console.warn(
        "\x1b[33m[LegalJudgmentMetadata]\x1b[0m PostgreSQL not available, skipping metadata creation"
      );
      return null;
    }

    try {
      const query = `
        INSERT INTO legal_judgment_metadata (
          doc_id, workspace_id, title, citation, case_id, cnr,
          judge, court, year, case_type, jurisdiction, bench_type,
          petitioner, respondent, decision_date, filing_date,
          keywords, acts_cited, cases_cited
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        )
        RETURNING *
      `;

      const params = [
        data.doc_id,
        data.workspace_id,
        data.title,
        data.citation || null,
        data.case_id || null,
        data.cnr || null,
        data.judge || null,
        data.court || null,
        data.year || null,
        data.case_type || null,
        data.jurisdiction || null,
        data.bench_type || null,
        data.petitioner || null,
        data.respondent || null,
        data.decision_date || null,
        data.filing_date || null,
        data.keywords || [],
        data.acts_cited || [],
        data.cases_cited || [],
      ];

      const result = await executeQuery(query, params);
      console.log(
        `\x1b[32m[LegalJudgmentMetadata]\x1b[0m Created metadata for doc_id: ${data.doc_id}`
      );
      return result.rows[0];
    } catch (error) {
      console.error(
        "\x1b[31m[LegalJudgmentMetadata]\x1b[0m Create error:",
        error.message
      );
      return null;
    }
  },

  /**
   * Get legal metadata by document ID
   * @param {string} docId - Document ID
   * @returns {Promise<Object|null>} Metadata record or null
   */
  get: async function (docId) {
    if (!this.isAvailable()) return null;

    try {
      const query = `
        SELECT * FROM legal_judgment_metadata
        WHERE doc_id = $1
      `;
      const result = await executeQuery(query, [docId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error(
        "\x1b[31m[LegalJudgmentMetadata]\x1b[0m Get error:",
        error.message
      );
      return null;
    }
  },

  /**
   * Search legal metadata with filters
   * @param {Object} filters - Search filters
   * @param {number} [filters.workspace_id] - Filter by workspace
   * @param {string} [filters.court] - Filter by court (partial match)
   * @param {number} [filters.year] - Filter by year
   * @param {number} [filters.year_from] - Filter by year range (from)
   * @param {number} [filters.year_to] - Filter by year range (to)
   * @param {string} [filters.case_type] - Filter by case type
   * @param {string} [filters.judge] - Filter by judge (partial match)
   * @param {string} [filters.citation] - Filter by citation (partial match)
   * @param {string} [filters.case_id] - Filter by case ID
   * @param {string} [filters.cnr] - Filter by CNR
   * @param {string} [filters.jurisdiction] - Filter by jurisdiction
   * @param {string} [filters.text_search] - Full-text search query
   * @param {Array<string>} [filters.keywords] - Keywords to match (any)
   * @param {number} [filters.limit] - Limit results (default: 100)
   * @param {number} [filters.offset] - Offset for pagination (default: 0)
   * @returns {Promise<Array>} Array of matching metadata records
   */
  search: async function (filters = {}) {
    if (!this.isAvailable()) return [];

    try {
      let query = `SELECT * FROM legal_judgment_metadata WHERE 1=1`;
      const params = [];
      let paramCount = 1;

      // Workspace filter
      if (filters.workspace_id) {
        query += ` AND workspace_id = $${paramCount}`;
        params.push(filters.workspace_id);
        paramCount++;
      }

      // Court filter (case-insensitive partial match)
      if (filters.court) {
        query += ` AND court ILIKE $${paramCount}`;
        params.push(`%${filters.court}%`);
        paramCount++;
      }

      // Year filter (exact or range)
      if (filters.year) {
        query += ` AND year = $${paramCount}`;
        params.push(filters.year);
        paramCount++;
      } else {
        if (filters.year_from) {
          query += ` AND year >= $${paramCount}`;
          params.push(filters.year_from);
          paramCount++;
        }
        if (filters.year_to) {
          query += ` AND year <= $${paramCount}`;
          params.push(filters.year_to);
          paramCount++;
        }
      }

      // Case type filter
      if (filters.case_type) {
        query += ` AND case_type = $${paramCount}`;
        params.push(filters.case_type);
        paramCount++;
      }

      // Judge filter (case-insensitive partial match)
      if (filters.judge) {
        query += ` AND judge ILIKE $${paramCount}`;
        params.push(`%${filters.judge}%`);
        paramCount++;
      }

      // Citation filter (case-insensitive partial match)
      if (filters.citation) {
        query += ` AND citation ILIKE $${paramCount}`;
        params.push(`%${filters.citation}%`);
        paramCount++;
      }

      // Case ID filter
      if (filters.case_id) {
        query += ` AND case_id = $${paramCount}`;
        params.push(filters.case_id);
        paramCount++;
      }

      // CNR filter
      if (filters.cnr) {
        query += ` AND cnr = $${paramCount}`;
        params.push(filters.cnr);
        paramCount++;
      }

      // Jurisdiction filter
      if (filters.jurisdiction) {
        query += ` AND jurisdiction ILIKE $${paramCount}`;
        params.push(`%${filters.jurisdiction}%`);
        paramCount++;
      }

      // Keywords filter (match any keyword)
      if (filters.keywords && Array.isArray(filters.keywords) && filters.keywords.length > 0) {
        query += ` AND keywords && $${paramCount}`;
        params.push(filters.keywords);
        paramCount++;
      }

      // Full-text search
      if (filters.text_search) {
        query += ` AND searchable_text @@ plainto_tsquery('english', $${paramCount})`;
        params.push(filters.text_search);
        paramCount++;
      }

      // Order by relevance and year (newest first)
      query += ` ORDER BY year DESC NULLS LAST, created_at DESC`;

      // Pagination
      const limit = filters.limit || 100;
      const offset = filters.offset || 0;
      query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);

      const result = await executeQuery(query, params);
      return result.rows;
    } catch (error) {
      console.error(
        "\x1b[31m[LegalJudgmentMetadata]\x1b[0m Search error:",
        error.message
      );
      return [];
    }
  },

  /**
   * Get all metadata for a workspace
   * @param {number} workspaceId - Workspace ID
   * @param {number} [limit] - Limit results
   * @returns {Promise<Array>} Array of metadata records
   */
  forWorkspace: async function (workspaceId, limit = null) {
    return await this.search({
      workspace_id: workspaceId,
      limit: limit || 1000,
    });
  },

  /**
   * Update legal metadata
   * @param {string} docId - Document ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated record or null
   */
  update: async function (docId, updates) {
    if (!this.isAvailable()) return null;

    try {
      // Build dynamic update query
      const allowedFields = [
        "title", "citation", "case_id", "cnr", "judge", "court",
        "year", "case_type", "jurisdiction", "bench_type",
        "petitioner", "respondent", "decision_date", "filing_date",
        "keywords", "acts_cited", "cases_cited"
      ];

      const updateFields = [];
      const params = [];
      let paramCount = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (allowedFields.includes(key) && value !== undefined) {
          updateFields.push(`${key} = $${paramCount}`);
          params.push(value);
          paramCount++;
        }
      });

      if (updateFields.length === 0) {
        console.warn(
          "\x1b[33m[LegalJudgmentMetadata]\x1b[0m No valid fields to update"
        );
        return await this.get(docId);
      }

      params.push(docId);
      const query = `
        UPDATE legal_judgment_metadata
        SET ${updateFields.join(", ")}
        WHERE doc_id = $${paramCount}
        RETURNING *
      `;

      const result = await executeQuery(query, params);
      console.log(
        `\x1b[32m[LegalJudgmentMetadata]\x1b[0m Updated metadata for doc_id: ${docId}`
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error(
        "\x1b[31m[LegalJudgmentMetadata]\x1b[0m Update error:",
        error.message
      );
      return null;
    }
  },

  /**
   * Delete legal metadata
   * @param {string} docId - Document ID
   * @returns {Promise<boolean>} True if deleted
   */
  delete: async function (docId) {
    if (!this.isAvailable()) return false;

    try {
      const query = `
        DELETE FROM legal_judgment_metadata
        WHERE doc_id = $1
      `;
      await executeQuery(query, [docId]);
      console.log(
        `\x1b[32m[LegalJudgmentMetadata]\x1b[0m Deleted metadata for doc_id: ${docId}`
      );
      return true;
    } catch (error) {
      console.error(
        "\x1b[31m[LegalJudgmentMetadata]\x1b[0m Delete error:",
        error.message
      );
      return false;
    }
  },

  /**
   * Delete all metadata for a workspace
   * @param {number} workspaceId - Workspace ID
   * @returns {Promise<boolean>} True if deleted
   */
  deleteForWorkspace: async function (workspaceId) {
    if (!this.isAvailable()) return false;

    try {
      const query = `
        DELETE FROM legal_judgment_metadata
        WHERE workspace_id = $1
      `;
      const result = await executeQuery(query, [workspaceId]);
      console.log(
        `\x1b[32m[LegalJudgmentMetadata]\x1b[0m Deleted ${result.rowCount} metadata records for workspace: ${workspaceId}`
      );
      return true;
    } catch (error) {
      console.error(
        "\x1b[31m[LegalJudgmentMetadata]\x1b[0m Delete for workspace error:",
        error.message
      );
      return false;
    }
  },

  /**
   * Count metadata records with filters
   * @param {Object} filters - Same filters as search()
   * @returns {Promise<number>} Count of matching records
   */
  count: async function (filters = {}) {
    if (!this.isAvailable()) return 0;

    try {
      // Use the same filter logic as search() but COUNT instead
      let query = `SELECT COUNT(*) as count FROM legal_judgment_metadata WHERE 1=1`;
      const params = [];
      let paramCount = 1;

      // Apply same filters as search() method (simplified)
      if (filters.workspace_id) {
        query += ` AND workspace_id = $${paramCount}`;
        params.push(filters.workspace_id);
        paramCount++;
      }

      if (filters.court) {
        query += ` AND court ILIKE $${paramCount}`;
        params.push(`%${filters.court}%`);
        paramCount++;
      }

      if (filters.year) {
        query += ` AND year = $${paramCount}`;
        params.push(filters.year);
        paramCount++;
      }

      if (filters.case_type) {
        query += ` AND case_type = $${paramCount}`;
        params.push(filters.case_type);
        paramCount++;
      }

      const result = await executeQuery(query, params);
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error(
        "\x1b[31m[LegalJudgmentMetadata]\x1b[0m Count error:",
        error.message
      );
      return 0;
    }
  },

  /**
   * Get unique values for a field (useful for filters/dropdowns)
   * @param {string} field - Field name (e.g., 'court', 'case_type')
   * @param {number} [workspaceId] - Optional workspace filter
   * @returns {Promise<Array>} Array of unique values
   */
  getUniqueValues: async function (field, workspaceId = null) {
    if (!this.isAvailable()) return [];

    const allowedFields = ["court", "case_type", "judge", "jurisdiction", "bench_type"];
    if (!allowedFields.includes(field)) {
      console.warn(
        `\x1b[33m[LegalJudgmentMetadata]\x1b[0m Invalid field for getUniqueValues: ${field}`
      );
      return [];
    }

    try {
      let query = `
        SELECT DISTINCT ${field}
        FROM legal_judgment_metadata
        WHERE ${field} IS NOT NULL
      `;
      const params = [];

      if (workspaceId) {
        query += ` AND workspace_id = $1`;
        params.push(workspaceId);
      }

      query += ` ORDER BY ${field}`;

      const result = await executeQuery(query, params);
      return result.rows.map((row) => row[field]);
    } catch (error) {
      console.error(
        "\x1b[31m[LegalJudgmentMetadata]\x1b[0m GetUniqueValues error:",
        error.message
      );
      return [];
    }
  },

  /**
   * Get statistics for a workspace
   * @param {number} workspaceId - Workspace ID
   * @returns {Promise<Object>} Statistics object
   */
  getStats: async function (workspaceId) {
    if (!this.isAvailable()) return null;

    try {
      const query = `
        SELECT 
          COUNT(*) as total_judgments,
          COUNT(DISTINCT court) as unique_courts,
          COUNT(DISTINCT case_type) as unique_case_types,
          MIN(year) as earliest_year,
          MAX(year) as latest_year,
          COUNT(DISTINCT judge) as unique_judges
        FROM legal_judgment_metadata
        WHERE workspace_id = $1
      `;
      const result = await executeQuery(query, [workspaceId]);
      return result.rows[0];
    } catch (error) {
      console.error(
        "\x1b[31m[LegalJudgmentMetadata]\x1b[0m GetStats error:",
        error.message
      );
      return null;
    }
  },
};

module.exports = { LegalJudgmentMetadata };

