-- Copia y pega este código en el Editor SQL de Supabase para hacerte administrador.
-- Reemplaza 'TU_EMAIL_AQUI' con el correo electrónico con el que te registraste.

UPDATE public.profiles
SET is_admin = true
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'TU_EMAIL_AQUI'
);

-- Opción 2: Si eres el único usuario y quieres ser admin sí o sí (CUIDADO: hace admin a TODOS):
-- UPDATE public.profiles SET is_admin = true;
