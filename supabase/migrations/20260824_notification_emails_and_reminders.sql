-- ═══════════════════════════════════════════════════════════════════════════
-- Correos adicionales por empresa + sistema de recordatorios
-- ═══════════════════════════════════════════════════════════════════════════
-- Ejecutar UNA vez en Supabase → SQL Editor.
-- Idempotente: se puede volver a correr sin romper nada.
--
-- ⚠️  Antes de correr la sección 4 (pg_cron) reemplaza:
--       <PROJECT_REF>      → la referencia de tu proyecto Supabase
--       <TRIGGER_SECRET>   → el mismo secreto que configures en
--                            Edge Functions → Secrets → TRIGGER_SECRET
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1 · Correos adicionales de aviso (máximo 2 por empresa)
-- ─────────────────────────────────────────────────────────────────────────

-- Validador de formato reutilizable. IMMUTABLE para poder usarlo en un CHECK.
CREATE OR REPLACE FUNCTION public.emails_all_valid(arr text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    bool_and(e ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'),
    true
  )
  FROM unnest(coalesce(arr, '{}'::text[])) AS e;
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_emails text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.profiles.notification_emails IS
  'Hasta 2 correos adicionales que reciben copia de los avisos de la empresa. Solo lectura por correo: no son cuentas de acceso.';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_notification_emails_max2;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_notification_emails_max2
  CHECK (coalesce(array_length(notification_emails, 1), 0) <= 2);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_notification_emails_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_notification_emails_format
  CHECK (public.emails_all_valid(notification_emails));


-- ─────────────────────────────────────────────────────────────────────────
-- 2 · Preferencias de recordatorios
-- ─────────────────────────────────────────────────────────────────────────
-- enabled                  → interruptor general
-- withdrawal_days_before   → días de antelación para avisar de un retiro
-- certificate_day          → día del mes en que se avisa del certificado del mes anterior
-- copy_extra_emails        → si los correos adicionales reciben también los recordatorios

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reminder_prefs jsonb NOT NULL DEFAULT jsonb_build_object(
    'enabled',                true,
    'withdrawal_days_before', jsonb_build_array(3, 1),
    'certificate_day',        5,
    'copy_extra_emails',      true
  );

COMMENT ON COLUMN public.profiles.reminder_prefs IS
  'Preferencias del sistema de recordatorios de retiros y certificados.';


-- ─────────────────────────────────────────────────────────────────────────
-- 3 · Bitácora de recordatorios (anti-duplicados)
-- ─────────────────────────────────────────────────────────────────────────
-- El cron corre a diario; esta tabla garantiza que un mismo recordatorio
-- no se envíe dos veces aunque el job se ejecute varias veces.

CREATE TABLE IF NOT EXISTS public.reminder_log (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind     text NOT NULL,          -- 'withdrawal' | 'certificate'
  ref_key  text NOT NULL,          -- p.ej. 'doc:<uuid>:d3'  ó  'cgm:2026-07'
  sent_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, ref_key)
);

CREATE INDEX IF NOT EXISTS idx_reminder_log_user ON public.reminder_log(user_id);
CREATE INDEX IF NOT EXISTS idx_reminder_log_sent ON public.reminder_log(sent_at DESC);

ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own reminder log" ON public.reminder_log;
CREATE POLICY "Users view own reminder log"
  ON public.reminder_log FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- La Edge Function escribe con service_role, que pasa por encima de RLS.


-- Índice que acelera la búsqueda de retiros próximos que hace el cron.
CREATE INDEX IF NOT EXISTS idx_documents_scheduled_date
  ON public.documents ((metadata->>'scheduled_date'))
  WHERE type = 'SCHEDULED';


-- ─────────────────────────────────────────────────────────────────────────
-- 4 · Job diario (pg_cron + pg_net → Edge Function send-reminders)
-- ─────────────────────────────────────────────────────────────────────────
-- ⚠️  Reemplaza <PROJECT_REF> y <TRIGGER_SECRET> antes de ejecutar.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;

-- El secreto vive dentro de una función SECURITY DEFINER en un esquema privado.
-- (En Supabase no se puede usar ALTER DATABASE ... SET: requiere superusuario.)
CREATE OR REPLACE FUNCTION private.call_send_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, extensions
AS $fn$
DECLARE
  v_url    text := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders';
  v_secret text := '<TRIGGER_SECRET>';
BEGIN
  PERFORM net.http_post(
    url     := v_url,
    body    := jsonb_build_object('source', 'cron'),
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-trigger-secret', v_secret
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[send-reminders] pg_net falló: %', SQLERRM;
END;
$fn$;

-- 12:00 UTC = 08:00/09:00 en Chile según horario de verano.
SELECT cron.unschedule('econexo-daily-reminders')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'econexo-daily-reminders');

SELECT cron.schedule(
  'econexo-daily-reminders',
  '0 12 * * *',
  $$ SELECT private.call_send_reminders(); $$
);

-- Para probar sin esperar al cron:
--   SELECT private.call_send_reminders();
-- Para ver el historial del job:
--   SELECT * FROM cron.job_run_details WHERE jobname = 'econexo-daily-reminders' ORDER BY start_time DESC LIMIT 10;
