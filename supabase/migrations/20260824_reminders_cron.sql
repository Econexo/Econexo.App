-- ═══════════════════════════════════════════════════════════════════════════
-- Job diario que dispara los recordatorios
-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 de 2. Antes de esto tiene que estar aplicado
-- 20260824_notification_emails_and_reminders.sql
--
-- ⚠️  ANTES DE EJECUTAR, dos cosas en el panel de Supabase:
--
--   a) Database → Extensions → habilitar  pg_net   y  pg_cron
--      NO se pueden crear con CREATE EXTENSION desde el SQL Editor: necesitan
--      superusuario. Si lo intentas, falla y el SQL Editor revierte el script
--      completo, incluso las partes que sí habrían funcionado.
--
--   a.bis) Desplegar send-reminders SIN verificación de JWT:
--            supabase functions deploy send-reminders --no-verify-jwt
--          El gateway de Supabase exige un encabezado Authorization y pg_net
--          solo manda x-trigger-secret, así que con verify_jwt activo la
--          llamada rebota antes de llegar a la función, con
--          UNAUTHORIZED_NO_AUTH_HEADER. La autorización la hace la función por
--          dentro con el secreto compartido. Lo mismo para send-email y
--          send-push, que send-reminders invoca por la vía interna.
--
--   b) Reemplazar abajo:
--        <PROJECT_REF>      → la referencia de tu proyecto (Settings → General)
--        <TRIGGER_SECRET>   → el mismo valor que pongas en
--                             Edge Functions → Secrets → TRIGGER_SECRET
--
-- Ejecuta los bloques de uno en uno. El 0 solo comprueba; no cambia nada.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 0 · Comprobación previa (ejecuta esto solo, primero)
-- ─────────────────────────────────────────────────────────────────────────
-- Las dos filas tienen que aparecer. Si falta alguna, vuelve al paso (a).

SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('pg_net', 'pg_cron');


-- ─────────────────────────────────────────────────────────────────────────
-- 1 · Función puente (esquema privado, no expuesto por la API)
-- ─────────────────────────────────────────────────────────────────────────
-- El secreto va escrito dentro de la función a propósito. Lo natural sería
-- ALTER DATABASE … SET app.trigger_secret y leerlo con current_setting(), pero
-- en Supabase eso requiere superusuario: el ajuste queda en NULL, la función
-- falla, el bloque EXCEPTION se lo traga y no te enteras de nada.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.call_send_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, extensions, net
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
  -- Que un recordatorio caído no tumbe el job entero.
  RAISE WARNING '[send-reminders] pg_net falló: %', SQLERRM;
END;
$fn$;


-- ─────────────────────────────────────────────────────────────────────────
-- 2 · Programar el job
-- ─────────────────────────────────────────────────────────────────────────
-- 12:00 UTC = 08:00 en Chile en verano, 09:00 en invierno.
-- pg_cron siempre trabaja en UTC.

-- Borra el job si ya existía, sin romper si no existe.
DO $$
BEGIN
  PERFORM cron.unschedule('econexo-daily-reminders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'econexo-daily-reminders',
  '0 12 * * *',
  $job$ SELECT private.call_send_reminders(); $job$
);


-- ─────────────────────────────────────────────────────────────────────────
-- 3 · Verificar
-- ─────────────────────────────────────────────────────────────────────────

-- ¿Quedó programado?
--   SELECT jobid, jobname, schedule, active FROM cron.job
--   WHERE jobname = 'econexo-daily-reminders';

-- Probar ahora mismo, sin esperar al cron. Solo funciona si la Edge Function
-- send-reminders ya está desplegada y TRIGGER_SECRET configurado.
--   SELECT private.call_send_reminders();

-- ¿Qué respondió la Edge Function? (pg_net responde de forma asíncrona:
-- espera unos segundos antes de consultar)
--   SELECT id, status_code, content
--   FROM net._http_response
--   ORDER BY created DESC LIMIT 5;
--   -- 200 = ok · 401 = TRIGGER_SECRET no coincide · 404 = función sin desplegar

-- Historial del job una vez que empiece a correr:
--   SELECT status, return_message, start_time
--   FROM cron.job_run_details
--   WHERE jobname = 'econexo-daily-reminders'
--   ORDER BY start_time DESC LIMIT 10;


-- ─────────────────────────────────────────────────────────────────────────
-- Si prefieres no usar SQL para esto
-- ─────────────────────────────────────────────────────────────────────────
-- El panel de Supabase tiene Integrations → Cron, que hace lo mismo desde una
-- interfaz. Aun así necesitas el bloque 1: el job tiene que llamar a
-- private.call_send_reminders(), que es donde vive el secreto.
