-- Allow admins to manage all documents
DROP POLICY IF EXISTS "Admins can view all documents" ON public.documents;
CREATE POLICY "Admins can view all documents" 
ON public.documents FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_admin = true
    )
    OR auth.uid() = user_id
);

DROP POLICY IF EXISTS "Admins can insert documents for anyone" ON public.documents;
CREATE POLICY "Admins can insert documents for anyone" 
ON public.documents FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_admin = true
    )
    OR auth.uid() = user_id
    OR auth.jwt() ->> 'email' = 'econexo.hub@gmail.com'
);

DROP POLICY IF EXISTS "Admins can update documents" ON public.documents;
CREATE POLICY "Admins can update documents" 
ON public.documents FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_admin = true
    )
    OR auth.uid() = user_id
);
