-- Function to sync eco-points for all users
DO $$
DECLARE
    user_record RECORD;
    total_kg NUMERIC;
BEGIN
    FOR user_record IN SELECT id FROM auth.users LOOP
        -- Calculate total Kg from verified CR documents for the user
        SELECT COALESCE(SUM((jsonb_array_elements(metadata->'waste_details')->>'quantity')::numeric), 0)
        INTO total_kg
        FROM documents
        WHERE user_id = user_record.id
          AND type = 'CR'
          AND verified = true;
        
        -- Update the profile's eco_points (1 Kg = 1 Point)
        -- We use FLOOR to keep it integer based, or just cast to int
        UPDATE profiles
        SET eco_points = FLOOR(total_kg)
        WHERE id = user_record.id;
        
        RAISE NOTICE 'User % updated with % points', user_record.id, FLOOR(total_kg);
    END LOOP;
END $$;
