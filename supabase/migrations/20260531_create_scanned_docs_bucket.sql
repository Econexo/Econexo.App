-- Bucket privado NUEVO para los PDFs escaneados por el admin y asignados a clientes.
-- No toca el bucket público 'documents' existente.
INSERT INTO storage.buckets (id, name, public)
VALUES ('scanned-docs', 'scanned-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Re-runnable: drop existing policy names first
DROP POLICY IF EXISTS "scanned_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "scanned_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "scanned_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "scanned_docs_delete" ON storage.objects;

-- Lectura: el dueño de la carpeta (cliente) o un admin.
CREATE POLICY "scanned_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'scanned-docs' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      OR auth.jwt() ->> 'email' = 'econexo.hub@gmail.com'
    )
  );

-- Escritura: solo admin (sube a la carpeta de cualquier cliente).
CREATE POLICY "scanned_docs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'scanned-docs' AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      OR auth.jwt() ->> 'email' = 'econexo.hub@gmail.com'
    )
  );

CREATE POLICY "scanned_docs_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'scanned-docs' AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      OR auth.jwt() ->> 'email' = 'econexo.hub@gmail.com'
    )
  );

CREATE POLICY "scanned_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'scanned-docs' AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      OR auth.jwt() ->> 'email' = 'econexo.hub@gmail.com'
    )
  );
