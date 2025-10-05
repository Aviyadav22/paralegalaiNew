const fs = require("fs");
const path = require("path");
const { postgresManager } = require("./postgres");

/**
 * Migration Runner for PostgreSQL
 * 
 * This utility handles running SQL migration scripts for legal metadata features.
 * Migrations are located in server/storage/migrations/
 */

/**
 * Run all pending migrations
 * @param {boolean} force - Force run even if already executed
 * @returns {Promise<boolean>} True if successful
 */
async function runAllMigrations(force = false) {
  if (!postgresManager.isEnabled) {
    console.log(
      "\x1b[33m[Migrations]\x1b[0m PostgreSQL not configured. Skipping migrations."
    );
    return false;
  }

  try {
    console.log("\x1b[36m[Migrations]\x1b[0m Starting PostgreSQL migrations...");

    // Check if migration tracking table exists
    await ensureMigrationTable();

    // Get list of migration files
    const migrationsDir = path.join(
      __dirname,
      "../../storage/migrations"
    );

    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
      console.log(
        "\x1b[36m[Migrations]\x1b[0m Created migrations directory"
      );
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      console.log(
        "\x1b[33m[Migrations]\x1b[0m No migration files found"
      );
      return true;
    }

    console.log(
      `\x1b[36m[Migrations]\x1b[0m Found ${files.length} migration file(s)`
    );

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const migrationName = path.basename(file, ".sql");

      // Check if already executed
      if (!force) {
        const isExecuted = await isMigrationExecuted(migrationName);
        if (isExecuted) {
          console.log(
            `\x1b[32m[Migrations]\x1b[0m ✓ ${migrationName} (already executed)`
          );
          continue;
        }
      }

      // Read and execute migration
      console.log(
        `\x1b[36m[Migrations]\x1b[0m Running ${migrationName}...`
      );
      const sqlScript = fs.readFileSync(filePath, "utf8");

      try {
        await postgresManager.runMigration(sqlScript);
        await recordMigration(migrationName);
        console.log(
          `\x1b[32m[Migrations]\x1b[0m ✓ ${migrationName} completed successfully`
        );
      } catch (error) {
        console.error(
          `\x1b[31m[Migrations]\x1b[0m ✗ ${migrationName} failed:`,
          error.message
        );
        throw error;
      }
    }

    console.log(
      "\x1b[32m[Migrations]\x1b[0m All migrations completed successfully!"
    );
    return true;
  } catch (error) {
    console.error(
      "\x1b[31m[Migrations]\x1b[0m Migration process failed:",
      error.message
    );
    return false;
  }
}

/**
 * Ensure migration tracking table exists
 * @private
 */
async function ensureMigrationTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await postgresManager.query(createTableSQL);
  } catch (error) {
    console.error(
      "\x1b[31m[Migrations]\x1b[0m Error creating migration table:",
      error.message
    );
    throw error;
  }
}

/**
 * Check if a migration has been executed
 * @param {string} migrationName - Migration filename (without .sql)
 * @returns {Promise<boolean>} True if already executed
 * @private
 */
async function isMigrationExecuted(migrationName) {
  try {
    const result = await postgresManager.query(
      "SELECT COUNT(*) as count FROM _migrations WHERE name = $1",
      [migrationName]
    );
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    console.error(
      "\x1b[31m[Migrations]\x1b[0m Error checking migration status:",
      error.message
    );
    return false;
  }
}

/**
 * Record a migration as executed
 * @param {string} migrationName - Migration filename (without .sql)
 * @private
 */
async function recordMigration(migrationName) {
  try {
    await postgresManager.query(
      "INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      [migrationName]
    );
  } catch (error) {
    console.error(
      "\x1b[31m[Migrations]\x1b[0m Error recording migration:",
      error.message
    );
  }
}

/**
 * Get list of executed migrations
 * @returns {Promise<Array>} List of executed migration names
 */
async function getExecutedMigrations() {
  if (!postgresManager.isEnabled) return [];

  try {
    await ensureMigrationTable();
    const result = await postgresManager.query(
      "SELECT name, executed_at FROM _migrations ORDER BY executed_at"
    );
    return result.rows;
  } catch (error) {
    console.error(
      "\x1b[31m[Migrations]\x1b[0m Error getting executed migrations:",
      error.message
    );
    return [];
  }
}

/**
 * Reset migrations (CAUTION: This will drop all tables and re-run)
 * @returns {Promise<boolean>} True if successful
 */
async function resetMigrations() {
  if (!postgresManager.isEnabled) {
    console.log(
      "\x1b[33m[Migrations]\x1b[0m PostgreSQL not configured. Cannot reset."
    );
    return false;
  }

  console.warn(
    "\x1b[33m[Migrations]\x1b[0m WARNING: This will drop all migration data!"
  );

  try {
    // Drop tables in reverse order
    await postgresManager.query("DROP TABLE IF EXISTS legal_judgment_metadata CASCADE");
    await postgresManager.query("DROP TABLE IF EXISTS _migrations CASCADE");
    await postgresManager.query("DROP FUNCTION IF EXISTS update_legal_metadata_searchable_text CASCADE");
    await postgresManager.query("DROP FUNCTION IF EXISTS update_legal_metadata_timestamp CASCADE");
    await postgresManager.query("DROP VIEW IF EXISTS legal_metadata_summary CASCADE");

    console.log(
      "\x1b[32m[Migrations]\x1b[0m All tables dropped. Run migrations again to recreate."
    );
    return true;
  } catch (error) {
    console.error(
      "\x1b[31m[Migrations]\x1b[0m Reset failed:",
      error.message
    );
    return false;
  }
}

module.exports = {
  runAllMigrations,
  getExecutedMigrations,
  resetMigrations,
};

