/**
 * PostgreSQL Test Utility
 * 
 * Run this script to test PostgreSQL connection and legal metadata features
 * 
 * Usage:
 *   node server/utils/database/testPostgres.js
 */

const { postgresManager } = require("./postgres");
const { LegalJudgmentMetadata } = require("../../models/legalJudgmentMetadata");
const { runAllMigrations } = require("./runMigrations");

async function runTests() {
  console.log("\n" + "=".repeat(60));
  console.log("PostgreSQL Connection & Legal Metadata Tests");
  console.log("=".repeat(60) + "\n");

  try {
    // Test 1: Check if PostgreSQL is configured
    console.log("Test 1: Checking PostgreSQL configuration...");
    if (!postgresManager.isEnabled) {
      console.log(
        "\x1b[31m✗ FAILED\x1b[0m: PostgreSQL is not configured"
      );
      console.log(
        "\nPlease set POSTGRES_CONNECTION_STRING in your .env file:"
      );
      console.log(
        'POSTGRES_CONNECTION_STRING="postgresql://user:password@localhost:5432/paralegal_ai"'
      );
      return;
    }
    console.log("\x1b[32m✓ PASSED\x1b[0m: PostgreSQL is configured\n");

    // Test 2: Test connection
    console.log("Test 2: Testing database connection...");
    const connected = await postgresManager.testConnection();
    if (!connected) {
      console.log(
        "\x1b[31m✗ FAILED\x1b[0m: Could not connect to PostgreSQL"
      );
      console.log("\nPlease check:");
      console.log("1. PostgreSQL is running");
      console.log("2. Connection string is correct");
      console.log("3. Database exists");
      return;
    }
    console.log("\x1b[32m✓ PASSED\x1b[0m: Database connection successful\n");

    // Test 3: Get database stats
    console.log("Test 3: Getting database statistics...");
    const stats = await postgresManager.getStats();
    if (stats) {
      console.log(`\x1b[32m✓ PASSED\x1b[0m: Database Size: ${stats.database_size}`);
      console.log(`           Active Connections: ${stats.active_connections}\n`);
    } else {
      console.log("\x1b[33m⚠ WARNING\x1b[0m: Could not get database stats\n");
    }

    // Test 4: Run migrations
    console.log("Test 4: Running database migrations...");
    const migrated = await runAllMigrations();
    if (!migrated) {
      console.log("\x1b[31m✗ FAILED\x1b[0m: Migration failed\n");
      return;
    }
    console.log("\x1b[32m✓ PASSED\x1b[0m: Migrations completed\n");

    // Test 5: Check if table exists
    console.log("Test 5: Checking if legal_judgment_metadata table exists...");
    const tableExists = await postgresManager.tableExists(
      "legal_judgment_metadata"
    );
    if (!tableExists) {
      console.log(
        "\x1b[31m✗ FAILED\x1b[0m: Table does not exist\n"
      );
      return;
    }
    console.log("\x1b[32m✓ PASSED\x1b[0m: Table exists\n");

    // Test 6: Create test metadata record
    console.log("Test 6: Creating test metadata record...");
    const testDoc = {
      doc_id: `test-doc-${Date.now()}`,
      workspace_id: 1,
      title: "Test Case vs State of Test",
      citation: "2024 SCC TEST 1",
      case_id: "TEST/2024/001",
      cnr: "TEST01-000001-2024",
      judge: "Justice Test",
      court: "Test High Court",
      year: 2024,
      case_type: "Test Appeal",
      jurisdiction: "Test State",
      keywords: ["test", "sample", "demo"],
      acts_cited: ["Test Act, 2024"],
      cases_cited: ["Sample Case (2023)"],
    };

    const created = await LegalJudgmentMetadata.create(testDoc);
    if (!created) {
      console.log("\x1b[31m✗ FAILED\x1b[0m: Could not create test record\n");
      return;
    }
    console.log(
      `\x1b[32m✓ PASSED\x1b[0m: Created test record (ID: ${created.id})\n`
    );

    // Test 7: Retrieve the record
    console.log("Test 7: Retrieving test metadata record...");
    const retrieved = await LegalJudgmentMetadata.get(testDoc.doc_id);
    if (!retrieved || retrieved.doc_id !== testDoc.doc_id) {
      console.log("\x1b[31m✗ FAILED\x1b[0m: Could not retrieve test record\n");
      return;
    }
    console.log(
      `\x1b[32m✓ PASSED\x1b[0m: Retrieved record successfully\n`
    );

    // Test 8: Search functionality
    console.log("Test 8: Testing search functionality...");
    const searchResults = await LegalJudgmentMetadata.search({
      court: "Test High Court",
      year: 2024,
    });
    if (searchResults.length === 0) {
      console.log("\x1b[31m✗ FAILED\x1b[0m: Search returned no results\n");
      return;
    }
    console.log(
      `\x1b[32m✓ PASSED\x1b[0m: Found ${searchResults.length} matching record(s)\n`
    );

    // Test 9: Update functionality
    console.log("Test 9: Testing update functionality...");
    const updated = await LegalJudgmentMetadata.update(testDoc.doc_id, {
      petitioner: "Test Petitioner",
      respondent: "Test Respondent",
    });
    if (!updated || !updated.petitioner) {
      console.log("\x1b[31m✗ FAILED\x1b[0m: Could not update test record\n");
      return;
    }
    console.log(
      `\x1b[32m✓ PASSED\x1b[0m: Updated record successfully\n`
    );

    // Test 10: Count functionality
    console.log("Test 10: Testing count functionality...");
    const count = await LegalJudgmentMetadata.count({
      workspace_id: 1,
    });
    console.log(
      `\x1b[32m✓ PASSED\x1b[0m: Found ${count} total record(s) in workspace\n`
    );

    // Test 11: Get unique values
    console.log("Test 11: Testing unique values retrieval...");
    const courts = await LegalJudgmentMetadata.getUniqueValues("court", 1);
    console.log(
      `\x1b[32m✓ PASSED\x1b[0m: Found ${courts.length} unique court(s)\n`
    );

    // Test 12: Get stats
    console.log("Test 12: Testing workspace statistics...");
    const workspaceStats = await LegalJudgmentMetadata.getStats(1);
    if (workspaceStats) {
      console.log(`\x1b[32m✓ PASSED\x1b[0m: Workspace Statistics:`);
      console.log(`           Total Judgments: ${workspaceStats.total_judgments}`);
      console.log(`           Unique Courts: ${workspaceStats.unique_courts}`);
      console.log(`           Year Range: ${workspaceStats.earliest_year} - ${workspaceStats.latest_year}\n`);
    }

    // Test 13: Cleanup - Delete test record
    console.log("Test 13: Cleaning up test data...");
    const deleted = await LegalJudgmentMetadata.delete(testDoc.doc_id);
    if (!deleted) {
      console.log(
        "\x1b[33m⚠ WARNING\x1b[0m: Could not delete test record (not a failure)\n"
      );
    } else {
      console.log(
        "\x1b[32m✓ PASSED\x1b[0m: Test record cleaned up successfully\n"
      );
    }

    // Final summary
    console.log("\n" + "=".repeat(60));
    console.log("\x1b[32m✓ ALL TESTS PASSED!\x1b[0m");
    console.log("=".repeat(60) + "\n");

    console.log("PostgreSQL is properly configured and working!");
    console.log("You can now:");
    console.log("1. Start uploading legal documents with metadata");
    console.log("2. Use filtered search for better performance");
    console.log("3. Query metadata independently\n");
  } catch (error) {
    console.log("\n" + "=".repeat(60));
    console.log("\x1b[31m✗ TESTS FAILED\x1b[0m");
    console.log("=".repeat(60) + "\n");
    console.error("Error:", error.message);
    console.error("\nStack trace:");
    console.error(error.stack);
  } finally {
    // Close connection
    await postgresManager.close();
    console.log("\nDatabase connection closed.");
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

module.exports = { runTests };

