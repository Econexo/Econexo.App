-- Allow admins to delete any document
DROP POLICY IF EXISTS "Admins can delete documents" ON public.documents;

CREATE POLICY "Admins can delete documents"
ON public.documents FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_admin = true
    )
    OR auth.uid() = user_id
);
