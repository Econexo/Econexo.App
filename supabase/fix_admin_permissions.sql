
-- SOLUCIÓN MANUAL DE PERMISOS (EJECUTAR EN SUPABASE SQL EDITOR)

-- 1. Forzar permisos de administrador (asegurarse de que esten en la DB)
UPDATE public.profiles
SET is_admin = true
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'econexo.hub@gmail.com'
);

-- 2. Eliminar políticas antiguas conflictivas 
DROP POLICY IF EXISTS "Admins can insert documents for anyone" ON public.documents;

-- 3. Crear política permisiva específica para tu correo
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
