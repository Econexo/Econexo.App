-- Improved Points Sync Script
-- This script handles both cases: waste_details being an array or a single object.

DO $$
DECLARE
    user_record RECORD;
    total_points BIGINT;
BEGIN
    FOR user_record IN SELECT id FROM profiles LOOP
        WITH user_docs AS (
            SELECT metadata->'waste_details' as details
            FROM documents
            WHERE user_id = user_record.id
              AND type = 'CR'
              AND verified = true
        ),
        parsed_items AS (
            -- Handle case where details is an array
            SELECT (jsonb_array_elements(details)->>'quantity')::numeric as qty
            FROM user_docs
            WHERE jsonb_typeof(details) = 'array'
            
            UNION ALL
            
            -- Handle case where details is a single object
            SELECT (details->>'quantity')::numeric as qty
            FROM user_docs
            WHERE jsonb_typeof(details) = 'object'
        )
        SELECT COALESCE(SUM(qty), 0) INTO total_points FROM parsed_items;

        UPDATE profiles
        SET eco_points = FLOOR(total_points)
        WHERE id = user_record.id;

        -- Log progress
        RAISE NOTICE 'Updated user % with % points', user_record.id, FLOOR(total_points);
    END LOOP;
END $$;
