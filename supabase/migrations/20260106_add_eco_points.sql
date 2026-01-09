-- Add eco_points to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS eco_points INTEGER DEFAULT 0;

-- Create points_transactions table
CREATE TABLE IF NOT EXISTS public.points_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.points_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for points_transactions
CREATE POLICY "Users can view their own transactions" 
ON public.points_transactions FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all transactions" 
ON public.points_transactions FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_admin = true
    )
    OR auth.jwt() ->> 'email' = 'econexo.hub@gmail.com'
);

-- Function to atomically increment points
CREATE OR REPLACE FUNCTION increment_points(user_id_param UUID, amount_param INTEGER)
RETURNS void AS $$
BEGIN
    UPDATE public.profiles
    SET eco_points = COALESCE(eco_points, 0) + amount_param
    WHERE id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

