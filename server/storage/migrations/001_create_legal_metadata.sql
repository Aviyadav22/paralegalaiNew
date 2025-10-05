-- Migration: Create legal_judgment_metadata table
-- Purpose: Store structured metadata for legal judgments
-- Date: October 2025
-- Version: 1.0

-- Create legal_judgment_metadata table
CREATE TABLE IF NOT EXISTS legal_judgment_metadata (
  id SERIAL PRIMARY KEY,
  
  -- Document reference (links to workspace_documents.docId in SQLite)
  doc_id VARCHAR(255) UNIQUE NOT NULL,
  workspace_id INTEGER NOT NULL,
  
  -- Core legal metadata
  title TEXT NOT NULL,
  citation VARCHAR(500),
  case_id VARCHAR(255),
  cnr VARCHAR(255), -- Case Number Reference (unique identifier in Indian courts)
  judge VARCHAR(500),
  court VARCHAR(500),
  year INTEGER,
  case_type VARCHAR(255),
  
  -- Additional metadata
  jurisdiction VARCHAR(255),
  bench_type VARCHAR(100), -- e.g., 'Single Bench', 'Division Bench', 'Full Bench'
  petitioner TEXT,
  respondent TEXT,
  decision_date DATE,
  filing_date DATE,
  
  -- Array fields for related information
  keywords TEXT[], -- Array of legal keywords/tags
  acts_cited TEXT[], -- Array of legislation references
  cases_cited TEXT[], -- Array of precedent cases
  
  -- Full-text search support
  searchable_text TSVECTOR,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT valid_year CHECK (year IS NULL OR (year >= 1800 AND year <= 2200))
);

-- Create indexes for performance optimization

-- Primary search fields
CREATE INDEX IF NOT EXISTS idx_legal_metadata_doc_id 
  ON legal_judgment_metadata(doc_id);

CREATE INDEX IF NOT EXISTS idx_legal_metadata_workspace_id 
  ON legal_judgment_metadata(workspace_id);

-- Common filter fields
CREATE INDEX IF NOT EXISTS idx_legal_metadata_court 
  ON legal_judgment_metadata(court);

CREATE INDEX IF NOT EXISTS idx_legal_metadata_year 
  ON legal_judgment_metadata(year);

CREATE INDEX IF NOT EXISTS idx_legal_metadata_case_type 
  ON legal_judgment_metadata(case_type);

CREATE INDEX IF NOT EXISTS idx_legal_metadata_judge 
  ON legal_judgment_metadata(judge);

-- Legal identifiers
CREATE INDEX IF NOT EXISTS idx_legal_metadata_case_id 
  ON legal_judgment_metadata(case_id);

CREATE INDEX IF NOT EXISTS idx_legal_metadata_cnr 
  ON legal_judgment_metadata(cnr);

CREATE INDEX IF NOT EXISTS idx_legal_metadata_citation 
  ON legal_judgment_metadata(citation);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_legal_metadata_court_year 
  ON legal_judgment_metadata(court, year);

CREATE INDEX IF NOT EXISTS idx_legal_metadata_workspace_court 
  ON legal_judgment_metadata(workspace_id, court);

CREATE INDEX IF NOT EXISTS idx_legal_metadata_workspace_year 
  ON legal_judgment_metadata(workspace_id, year);

-- Full-text search index (GIN index for fast text search)
CREATE INDEX IF NOT EXISTS idx_legal_metadata_searchable_text 
  ON legal_judgment_metadata USING GIN(searchable_text);

-- Array indexes for keyword and citation searches
CREATE INDEX IF NOT EXISTS idx_legal_metadata_keywords 
  ON legal_judgment_metadata USING GIN(keywords);

CREATE INDEX IF NOT EXISTS idx_legal_metadata_acts_cited 
  ON legal_judgment_metadata USING GIN(acts_cited);

CREATE INDEX IF NOT EXISTS idx_legal_metadata_cases_cited 
  ON legal_judgment_metadata USING GIN(cases_cited);

-- Create function to automatically update searchable_text
CREATE OR REPLACE FUNCTION update_legal_metadata_searchable_text()
RETURNS TRIGGER AS $$
BEGIN
  NEW.searchable_text := 
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.citation, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.court, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.judge, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.petitioner, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.respondent, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.case_type, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update searchable_text on insert/update
DROP TRIGGER IF EXISTS trigger_update_legal_metadata_searchable_text 
  ON legal_judgment_metadata;

CREATE TRIGGER trigger_update_legal_metadata_searchable_text
  BEFORE INSERT OR UPDATE ON legal_judgment_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_legal_metadata_searchable_text();

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_legal_metadata_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at on update
DROP TRIGGER IF EXISTS trigger_update_legal_metadata_timestamp 
  ON legal_judgment_metadata;

CREATE TRIGGER trigger_update_legal_metadata_timestamp
  BEFORE UPDATE ON legal_judgment_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_legal_metadata_timestamp();

-- Grant permissions (adjust as needed for your security model)
-- GRANT ALL PRIVILEGES ON legal_judgment_metadata TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE legal_judgment_metadata_id_seq TO your_app_user;

-- Create view for easier querying with counts
CREATE OR REPLACE VIEW legal_metadata_summary AS
SELECT 
  workspace_id,
  court,
  year,
  case_type,
  COUNT(*) as judgment_count
FROM legal_judgment_metadata
GROUP BY workspace_id, court, year, case_type
ORDER BY workspace_id, year DESC, court;

-- Add comments for documentation
COMMENT ON TABLE legal_judgment_metadata IS 'Stores structured metadata for legal judgments';
COMMENT ON COLUMN legal_judgment_metadata.doc_id IS 'Foreign key to workspace_documents.docId in SQLite';
COMMENT ON COLUMN legal_judgment_metadata.cnr IS 'Case Number Reference - unique identifier in Indian courts';
COMMENT ON COLUMN legal_judgment_metadata.searchable_text IS 'Automatically maintained full-text search index';
COMMENT ON COLUMN legal_judgment_metadata.keywords IS 'Array of legal keywords/tags for the judgment';
COMMENT ON COLUMN legal_judgment_metadata.acts_cited IS 'Array of legislation/acts referenced in the judgment';
COMMENT ON COLUMN legal_judgment_metadata.cases_cited IS 'Array of precedent cases cited in the judgment';

-- Insert a test record to verify everything works
-- This will be commented out in production, uncomment for testing
/*
INSERT INTO legal_judgment_metadata (
  doc_id, workspace_id, title, citation, case_id, cnr, 
  judge, court, year, case_type, jurisdiction,
  keywords, acts_cited
) VALUES (
  'test-doc-id-001',
  1,
  'Test Case vs State',
  '2024 SCC 1',
  'CRL/2024/001',
  'TEST01-000001-2024',
  'Justice Test',
  'Test Court',
  2024,
  'Criminal Appeal',
  'Test Jurisdiction',
  ARRAY['test', 'sample'],
  ARRAY['Indian Penal Code, 1860']
);
*/

-- Verify table creation
SELECT 
  table_name, 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'legal_judgment_metadata'
ORDER BY ordinal_position;

-- Migration completed successfully
SELECT 'Legal metadata table created successfully!' as status;

