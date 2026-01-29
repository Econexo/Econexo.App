-- 1. Update the function to prevent negative points
CREATE OR REPLACE FUNCTION increment_points(user_id_param UUID, amount_param INTEGER)
RETURNS void AS $$
BEGIN
    UPDATE public.profiles
    SET eco_points = GREATEST(0, COALESCE(eco_points, 0) + amount_param)
    WHERE id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Reset any existing negative points to 0
UPDATE public.profiles
SET eco_points = 0
WHERE eco_points < 0;
