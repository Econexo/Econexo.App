-- Add is_admin flag to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Update RLS to allow admins to see everything
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- Also allow admins to see all documents
DROP POLICY IF EXISTS "Users can view their own documents" ON public.documents;
CREATE POLICY "Users can view their own documents" 
ON public.documents FOR SELECT 
USING (auth.uid() = user_id OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- Allow admins to update documents (validation)
DROP POLICY IF EXISTS "Admins can update documents" ON public.documents;
CREATE POLICY "Admins can update documents" 
ON public.documents FOR UPDATE 
USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
