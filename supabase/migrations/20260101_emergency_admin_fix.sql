-- EMERGENCY FIX: Grant privileges to Super Admin
-- This migration will run automatically to fix the permission issues

DO $$
BEGIN
    -- 1. Force Admin Flag in Profile for 'econexo.hub@gmail.com'
    -- We use a subquery to find the ID because we are in the public schema context
    UPDATE public.profiles
    SET is_admin = true
    WHERE id IN (
        SELECT id FROM auth.users WHERE email = 'econexo.hub@gmail.com'
    );

    -- 2. Ensure the Insert Policy allows this email specifically (Redundant but safe)
    DROP POLICY IF EXISTS "Admins can insert documents for anyone" ON public.documents;
    
    CREATE POLICY "Admins can insert documents for anyone" 
    ON public.documents FOR INSERT 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND is_admin = true
        )
        OR auth.uid() = user_id
        -- Allow specific email via JWT claim
        OR auth.jwt() ->> 'email' = 'econexo.hub@gmail.com'
    );

END $$;
