const { PrismaClient } = require('@prisma/client');
const path = require('path');

// SQLite database path
const sqliteDbPath = process.env.SQLITE_DB_PATH || 
  path.resolve(__dirname, '../../storage/anythingllm.db');

// Create two separate Prisma clients
const sqlitePrisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${sqliteDbPath}`
    }
  }
});

const postgresPrisma = new PrismaClient();

/**
 * Migration script to transfer all data from SQLite to PostgreSQL
 */
async function migrateData() {
  console.log('🚀 Starting SQLite to PostgreSQL migration...\n');
  console.log(`📂 SQLite DB: ${sqliteDbPath}`);
  console.log(`📂 PostgreSQL: ${process.env.DATABASE_URL}\n`);

  try {
    // Test connections
    console.log('📡 Testing database connections...');
    await sqlitePrisma.$connect();
    await postgresPrisma.$connect();
    console.log('✅ Both databases connected successfully\n');

    // Define migration order (respecting foreign key constraints)
    const migrationSteps = [
      { name: 'users', model: 'users' },
      { name: 'api_keys', model: 'api_keys' },
      { name: 'system_settings', model: 'system_settings' },
      { name: 'workspaces', model: 'workspaces' },
      { name: 'workspace_users', model: 'workspace_users' },
      { name: 'workspace_documents', model: 'workspace_documents' },
      { name: 'workspace_threads', model: 'workspace_threads' },
      { name: 'workspace_suggested_messages', model: 'workspace_suggested_messages' },
      { name: 'workspace_chats', model: 'workspace_chats' },
      { name: 'workspace_agent_invocations', model: 'workspace_agent_invocations' },
      { name: 'workspace_parsed_files', model: 'workspace_parsed_files' },
      { name: 'document_vectors', model: 'document_vectors' },
      { name: 'invites', model: 'invites' },
      { name: 'welcome_messages', model: 'welcome_messages' },
      { name: 'cache_data', model: 'cache_data' },
      { name: 'embed_configs', model: 'embed_configs' },
      { name: 'embed_chats', model: 'embed_chats' },
      { name: 'event_logs', model: 'event_logs' },
      { name: 'slash_command_presets', model: 'slash_command_presets' },
      { name: 'document_sync_queues', model: 'document_sync_queues' },
      { name: 'document_sync_executions', model: 'document_sync_executions' },
      { name: 'browser_extension_api_keys', model: 'browser_extension_api_keys' },
      { name: 'temporary_auth_tokens', model: 'temporary_auth_tokens' },
      { name: 'system_prompt_variables', model: 'system_prompt_variables' },
      { name: 'prompt_history', model: 'prompt_history' },
      { name: 'desktop_mobile_devices', model: 'desktop_mobile_devices' },
      { name: 'recovery_codes', model: 'recovery_codes' },
      { name: 'password_reset_tokens', model: 'password_reset_tokens' },
    ];

    let totalRecordsMigrated = 0;
    const summary = [];

    for (const step of migrationSteps) {
      try {
        console.log(`📦 Migrating ${step.name}...`);
        
        // Fetch all records from SQLite
        const records = await sqlitePrisma[step.model].findMany();
        
        if (records.length === 0) {
          console.log(`   ⏭️  No records found in ${step.name}\n`);
          summary.push({ table: step.name, records: 0, status: 'empty' });
          continue;
        }

        // Insert into PostgreSQL in batches
        const batchSize = 100;
        let migratedCount = 0;
        
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          
          try {
            await postgresPrisma[step.model].createMany({
              data: batch,
              skipDuplicates: true,
            });
            migratedCount += batch.length;
            console.log(`   ✅ Migrated ${Math.min(i + batchSize, records.length)}/${records.length} records`);
          } catch (batchError) {
            console.warn(`   ⚠️  Batch insert failed, trying individual inserts...`);
            // Try inserting individually if batch fails
            for (const record of batch) {
              try {
                await postgresPrisma[step.model].create({ data: record });
                migratedCount++;
              } catch (recordError) {
                console.error(`   ❌ Failed to insert record:`, recordError.message);
              }
            }
          }
        }
        
        totalRecordsMigrated += migratedCount;
        console.log(`   ✅ Completed ${step.name}: ${migratedCount}/${records.length} records\n`);
        summary.push({ table: step.name, records: migratedCount, total: records.length, status: 'success' });
        
      } catch (error) {
        console.error(`   ❌ Error migrating ${step.name}:`, error.message);
        summary.push({ table: step.name, records: 0, status: 'failed', error: error.message });
      }
    }

    console.log(`\n🎉 Migration completed!`);
    console.log(`📊 Total records migrated: ${totalRecordsMigrated}\n`);

    // Print summary
    console.log('📋 Migration Summary:');
    console.log('─'.repeat(60));
    summary.forEach(item => {
      const status = item.status === 'success' ? '✅' : 
                     item.status === 'empty' ? '⏭️' : '❌';
      console.log(`${status} ${item.table.padEnd(35)} ${item.records} records`);
    });
    console.log('─'.repeat(60));

    // Verify migration
    console.log('\n🔍 Verifying migration...');
    const postgresUserCount = await postgresPrisma.users.count();
    const postgresWorkspaceCount = await postgresPrisma.workspaces.count();
    const postgresDocumentCount = await postgresPrisma.workspace_documents.count();
    const postgresChatCount = await postgresPrisma.workspace_chats.count();
    
    console.log(`   Users: ${postgresUserCount}`);
    console.log(`   Workspaces: ${postgresWorkspaceCount}`);
    console.log(`   Documents: ${postgresDocumentCount}`);
    console.log(`   Chats: ${postgresChatCount}`);
    console.log('✅ Verification complete\n');

    return { success: true, totalRecordsMigrated, summary };

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await sqlitePrisma.$disconnect();
    await postgresPrisma.$disconnect();
  }
}

// Run migration
if (require.main === module) {
  migrateData()
    .then((result) => {
      console.log('✅ Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateData };
