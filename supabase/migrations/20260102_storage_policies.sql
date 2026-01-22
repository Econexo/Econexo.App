-- Asegurar que el bucket 'avatars' exista y sea público
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Borrar nombres de reglas antiguas para limpiar
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

-- Drop new unique policy names (for re-runnability)
DROP POLICY IF EXISTS "avatar_public_read" ON storage.objects;
DROP POLICY IF EXISTS "avatar_user_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatar_user_update" ON storage.objects;
DROP POLICY IF EXISTS "avatar_user_delete" ON storage.objects;

-- 1. Permite que cualquiera pueda ver las imágenes (lectura pública)
CREATE POLICY "avatar_public_read" ON storage.objects
  FOR SELECT TO public
  USING (lower(bucket_id) = 'avatars');

-- 2. Permite que usuarios autenticados suban sus fotos a su propia carpeta
CREATE POLICY "avatar_user_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (lower(bucket_id) = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3. Permite que usuarios actualicen sus fotos en su propia carpeta
CREATE POLICY "avatar_user_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (lower(bucket_id) = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 4. Permite que usuarios borren sus fotos en su propia carpeta
CREATE POLICY "avatar_user_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (lower(bucket_id) = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
