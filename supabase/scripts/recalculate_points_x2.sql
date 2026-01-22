-- SQL Script to recalculate eco-points with x2 multiplier
-- Logic: 
-- 1. Scan all validated CR documents.
-- 2. Sum up quantities from waste_details (handling both array and single object formats).
-- 3. Calculate new total points: FLOOR(total_qty * 2).
-- 4. Update profiles.eco_points directly.

DO $$
DECLARE
    user_record RECORD;
    total_points BIGINT;
    user_total_qty NUMERIC;
BEGIN
    FOR user_record IN SELECT id FROM profiles LOOP
        user_total_qty := 0;

        -- Calculate total quantity from all validated CR documents for this user
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
        SELECT COALESCE(SUM(qty), 0) INTO user_total_qty FROM parsed_items;

        -- Apply x2 Multiplier
        total_points := FLOOR(user_total_qty * 2);

        -- Update Profile
        UPDATE profiles
        SET eco_points = total_points
        WHERE id = user_record.id;

        -- Log progress
        IF total_points > 0 THEN
            RAISE NOTICE 'Updated user %: % kg -> % points (x2)', user_record.id, user_total_qty, total_points;
        END IF;
    END LOOP;
END $$;
