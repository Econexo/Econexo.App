-- Update existing profiles with eco_points based on historical document weight
-- Rule: 1 point per 1kg of verified CR documents
DO $$
DECLARE
    rec RECORD;
    total_points INTEGER;
BEGIN
    FOR rec IN SELECT id FROM public.profiles LOOP
        SELECT COALESCE(SUM(calc.weight), 0) INTO total_points
        FROM (
            SELECT 
                (jsonb_array_elements(
                    CASE 
                        WHEN jsonb_typeof(metadata->'waste_details') = 'array' THEN metadata->'waste_details'
                        ELSE jsonb_build_array(metadata->'waste_details')
                    END
                )->>'quantity')::numeric as weight
            FROM public.documents
            WHERE user_id = rec.id 
            AND type = 'CR' 
            AND verified = true
        ) as calc;

        UPDATE public.profiles
        SET eco_points = total_points
        WHERE id = rec.id AND (eco_points IS NULL OR eco_points = 0);
    END LOOP;
END $$;
