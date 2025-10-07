-- Reset PostgreSQL sequences after migration from SQLite
-- This ensures auto-increment IDs continue from the correct value

DO $$
DECLARE
    r RECORD;
    max_id INTEGER;
    seq_name TEXT;
BEGIN
    FOR r IN 
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND column_name = 'id'
        AND data_type IN ('integer', 'bigint')
    LOOP
        -- Get the sequence name
        seq_name := pg_get_serial_sequence(r.table_name, r.column_name);
        
        IF seq_name IS NOT NULL THEN
            -- Get max ID from table
            EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM %I', r.table_name) INTO max_id;
            
            -- Reset sequence to max_id + 1
            EXECUTE format('SELECT setval(%L, %s)', seq_name, max_id + 1);
            
            RAISE NOTICE 'Reset sequence for %.%: set to %', r.table_name, r.column_name, max_id + 1;
        END IF;
    END LOOP;
END $$;

SELECT 'All sequences reset successfully' AS status;
