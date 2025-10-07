const { Pool } = require("pg");

/**
 * PostgreSQL Connection Manager
 * Handles connection pooling and query execution for legal judgment metadata
 * 
 * This is separate from Prisma (which handles SQLite) to allow flexibility
 * and optimized PostgreSQL operations.
 */
class PostgresConnectionManager {
  constructor() {
    this.pool = null;
    this.isEnabled = false;
    this._checkConfiguration();
  }

  /**
   * Check if PostgreSQL is configured and enabled
   * @private
   */
  _checkConfiguration() {
    if (!process.env.POSTGRES_CONNECTION_STRING) {
      console.log(
        "\x1b[33m[PostgreSQL]\x1b[0m Connection string not configured. Legal metadata features will be disabled."
      );
      this.isEnabled = false;
      return;
    }
    this.isEnabled = true;
  }

  /**
   * Get or create connection pool
   * @returns {Pool} PostgreSQL connection pool
   */
  getPool() {
    if (!this.isEnabled) {
      throw new Error(
        "PostgreSQL is not configured. Set POSTGRES_CONNECTION_STRING in .env"
      );
    }

    if (!this.pool) {
      const connectionString = process.env.POSTGRES_CONNECTION_STRING;
      // Enable SSL for Azure or when sslmode=require is present in the URL
      const needsSSL = /sslmode=require/i.test(connectionString || "") ||
        /postgres\.database\.azure\.com/i.test(connectionString || "");

      this.pool = new Pool({
        connectionString,
        ssl: needsSSL ? { rejectUnauthorized: false } : undefined,
        // Connection pool settings
        max: 20, // Maximum number of clients in pool
        idleTimeoutMillis: 30000, // Close idle clients after 30s
        connectionTimeoutMillis: 10000, // Return error after 10s if connection cannot be established
      });

      // Handle pool errors
      this.pool.on("error", (err) => {
        console.error("\x1b[31m[PostgreSQL]\x1b[0m Unexpected pool error:", err);
      });

      console.log("\x1b[32m[PostgreSQL]\x1b[0m Connection pool initialized");
      console.log("\x1b[36m[PostgreSQL]\x1b[0m SSL:", needsSSL ? "enabled" : "disabled");
    }

    return this.pool;
  }

  /**
   * Execute a query with parameters
   * @param {string} query - SQL query string
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async query(query, params = []) {
    if (!this.isEnabled) {
      console.warn(
        "\x1b[33m[PostgreSQL]\x1b[0m Query attempted but PostgreSQL is not configured"
      );
      return { rows: [], rowCount: 0 };
    }

    const pool = this.getPool();
    const startTime = Date.now();

    try {
      const result = await pool.query(query, params);
      const duration = Date.now() - startTime;

      // Log slow queries (>100ms)
      if (duration > 100) {
        console.warn(
          `\x1b[33m[PostgreSQL]\x1b[0m Slow query (${duration}ms): ${query.substring(0, 100)}...`
        );
      }

      return result;
    } catch (error) {
      console.error("\x1b[31m[PostgreSQL]\x1b[0m Query error:", error.message);
      console.error("Query:", query);
      console.error("Params:", params);
      throw error;
    }
  }

  /**
   * Test database connection
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection() {
    if (!this.isEnabled) {
      console.log(
        "\x1b[33m[PostgreSQL]\x1b[0m Cannot test connection - not configured"
      );
      return false;
    }

    try {
      const result = await this.query("SELECT NOW() as current_time");
      if (result.rows.length > 0) {
        console.log(
          "\x1b[32m[PostgreSQL]\x1b[0m Connection test successful:",
          result.rows[0].current_time
        );
        return true;
      }
      return false;
    } catch (error) {
      console.error(
        "\x1b[31m[PostgreSQL]\x1b[0m Connection test failed:",
        error.message
      );
      return false;
    }
  }

  /**
   * Check if a table exists
   * @param {string} tableName - Name of table to check
   * @returns {Promise<boolean>} True if table exists
   */
  async tableExists(tableName) {
    if (!this.isEnabled) return false;

    try {
      const result = await this.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [tableName]
      );
      return result.rows[0].exists;
    } catch (error) {
      console.error(
        `\x1b[31m[PostgreSQL]\x1b[0m Error checking table existence:`,
        error.message
      );
      return false;
    }
  }

  /**
   * Run migration script
   * @param {string} sqlScript - SQL migration script
   * @returns {Promise<boolean>} True if migration successful
   */
  async runMigration(sqlScript) {
    if (!this.isEnabled) {
      console.log(
        "\x1b[33m[PostgreSQL]\x1b[0m Cannot run migration - not configured"
      );
      return false;
    }

    try {
      await this.query(sqlScript);
      console.log("\x1b[32m[PostgreSQL]\x1b[0m Migration completed successfully");
      return true;
    } catch (error) {
      console.error(
        "\x1b[31m[PostgreSQL]\x1b[0m Migration failed:",
        error.message
      );
      throw error;
    }
  }

  /**
   * Close all connections in the pool
   * @returns {Promise<void>}
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log("\x1b[36m[PostgreSQL]\x1b[0m Connection pool closed");
      this.pool = null;
    }
  }

  /**
   * Get database statistics
   * @returns {Promise<Object>} Database stats
   */
  async getStats() {
    if (!this.isEnabled) return null;

    try {
      const result = await this.query(`
        SELECT 
          pg_size_pretty(pg_database_size(current_database())) as database_size,
          (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as active_connections
      `);
      return result.rows[0];
    } catch (error) {
      console.error(
        "\x1b[31m[PostgreSQL]\x1b[0m Error getting stats:",
        error.message
      );
      return null;
    }
  }
}

// Create singleton instance
const postgresManager = new PostgresConnectionManager();

/**
 * Execute a PostgreSQL query (convenience function)
 * @param {string} query - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
async function executeQuery(query, params = []) {
  return await postgresManager.query(query, params);
}

/**
 * Test PostgreSQL connection (convenience function)
 * @returns {Promise<boolean>} True if connection successful
 */
async function testConnection() {
  return await postgresManager.testConnection();
}

/**
 * Check if PostgreSQL is enabled
 * @returns {boolean} True if PostgreSQL is configured
 */
function isEnabled() {
  return postgresManager.isEnabled;
}

module.exports = {
  PostgresConnectionManager,
  postgresManager,
  executeQuery,
  testConnection,
  isEnabled,
};

