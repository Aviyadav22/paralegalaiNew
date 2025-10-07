-- Performance indexes for PostgreSQL
-- Run this after migration to optimize query performance

-- Workspace documents indexes
CREATE INDEX IF NOT EXISTS idx_workspace_documents_workspace_id ON workspace_documents(workspaceId);
CREATE INDEX IF NOT EXISTS idx_workspace_documents_docid ON workspace_documents(docId);
CREATE INDEX IF NOT EXISTS idx_workspace_documents_pinned ON workspace_documents(pinned) WHERE pinned = true;

-- Workspace chats indexes
CREATE INDEX IF NOT EXISTS idx_workspace_chats_workspace_id ON workspace_chats(workspaceId);
CREATE INDEX IF NOT EXISTS idx_workspace_chats_user_id ON workspace_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_chats_created_at ON workspace_chats(createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_chats_thread_id ON workspace_chats(thread_id);

-- Document vectors indexes
CREATE INDEX IF NOT EXISTS idx_document_vectors_doc_id ON document_vectors(docId);
CREATE INDEX IF NOT EXISTS idx_document_vectors_vector_id ON document_vectors(vectorId);

-- Original files indexes
CREATE INDEX IF NOT EXISTS idx_original_files_file_id ON original_files(fileId);
CREATE INDEX IF NOT EXISTS idx_original_files_storage_mode ON original_files(storageMode);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Workspaces indexes
CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);

-- Workspace threads indexes
CREATE INDEX IF NOT EXISTS idx_workspace_threads_workspace_id ON workspace_threads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_threads_user_id ON workspace_threads(user_id);

-- Event logs indexes
CREATE INDEX IF NOT EXISTS idx_event_logs_event ON event_logs(event);
CREATE INDEX IF NOT EXISTS idx_event_logs_occurred_at ON event_logs(occurredAt DESC);

-- Analyze tables for query optimization
ANALYZE;

SELECT 'All indexes created successfully' AS status;
