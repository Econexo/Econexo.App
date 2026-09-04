-- ═══════════════════════════════════════════════════════════════════════════
-- Certificado de Recepción (CR) → Certificado de Transporte (CT)
-- ═══════════════════════════════════════════════════════════════════════════
-- EcoNexo retira y traslada: su rol es el de transportista. El Certificado de
-- Recepción lo emite el centro de acopio al recibir la carga, y el de
-- Disposición Final quien la trata. Con los tres documentos conviviendo en la
-- app, el nombre anterior los volvía indistinguibles.
--
-- Esta migración renombra los certificados YA EMITIDOS. Toca tres cosas de cada
-- fila: el código de tipo, el título y el correlativo guardado en metadata.
--
--   type          'CR'                                 → 'CT'
--   title         'Certificado de Recepción CR N°:007' → 'Certificado de Transporte CT N°:007'
--   cert_number   'CR N°:007'                          → 'CT N°:007'
--
-- Hay DOS formatos de número conviviendo, porque durante un tiempo el botón del
-- Dashboard y el del panel Admin numeraban distinto:
--
--   'CR N°:007'   correlativo del Admin
--   'CR-4837'     número al azar del Dashboard antiguo
--
-- Los dos se migran. El NÚMERO no cambia: el 007 sigue siendo el 007 y el 4837
-- sigue siendo el 4837, solo cambia el prefijo. Un certificado ya entregado a un
-- cliente conserva su identificador.
--
-- ⚠️  Ejecuta los bloques de uno en uno. El 0 y el 1 solo consultan.
-- ⚠️  Haz un backup antes del bloque 2 (Database → Backups).
--
-- El código lee los dos prefijos y además reescribe a CT lo que muestra en
-- pantalla, así que la app se ve igual antes y después de aplicar esto. No hay
-- prisa ni ventana de mantención: esto ordena los datos, no arregla la vista.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 0 · Cuántas filas se van a tocar (solo consulta)
-- ─────────────────────────────────────────────────────────────────────────

SELECT
  count(*)                                                       AS total_cr,
  count(*) FILTER (WHERE title LIKE '%Recepción%')                AS con_titulo_viejo,
  count(*) FILTER (WHERE metadata->>'cert_number' LIKE 'CR N°:%') AS numero_correlativo,
  count(*) FILTER (WHERE metadata->>'cert_number' ~ '^CR-\d')     AS numero_dashboard_viejo,
  count(*) FILTER (WHERE metadata->>'cert_number' IS NULL)        AS sin_numero,
  min(created_at)::date                                          AS mas_antiguo,
  max(created_at)::date                                          AS mas_reciente
FROM public.documents
WHERE type = 'CR';


-- ─────────────────────────────────────────────────────────────────────────
-- 1 · Vista previa: cómo quedaría cada fila (solo consulta)
-- ─────────────────────────────────────────────────────────────────────────
-- Revisa que los títulos y números nuevos se vean bien ANTES de escribir nada.
--
-- El CR solo se reemplaza donde actúa de prefijo de un número —seguido de
-- 'N°:' o de un guion y un dígito—, nunca dentro de otra palabra.

SELECT
  id,
  created_at::date         AS fecha,
  title                    AS titulo_actual,
  regexp_replace(
    regexp_replace(
      replace(title, 'Certificado de Recepción', 'Certificado de Transporte'),
      'CR(\s*N°:)', 'CT\1', 'g'),
    'CR-(\d)', 'CT-\1', 'g')
                           AS titulo_nuevo,
  metadata->>'cert_number' AS numero_actual,
  regexp_replace(
    regexp_replace(coalesce(metadata->>'cert_number', ''), 'CR(\s*N°:)', 'CT\1', 'g'),
    'CR-(\d)', 'CT-\1', 'g')
                           AS numero_nuevo
FROM public.documents
WHERE type = 'CR'
ORDER BY created_at;


-- ─────────────────────────────────────────────────────────────────────────
-- 2 · Aplicar el cambio
-- ─────────────────────────────────────────────────────────────────────────
-- Idempotente: se puede volver a correr sin efecto, porque el WHERE deja de
-- encontrar filas una vez aplicado.
--
-- Se guarda el nombre anterior en metadata.renamed_from. En un documento de
-- trazabilidad conviene poder reconstruir por qué un certificado cambió de
-- nombre, y con cuál se le entregó al cliente.

BEGIN;

UPDATE public.documents
SET
  type  = 'CT',
  title = regexp_replace(
            regexp_replace(
              replace(title, 'Certificado de Recepción', 'Certificado de Transporte'),
              'CR(\s*N°:)', 'CT\1', 'g'),
            'CR-(\d)', 'CT-\1', 'g'),
  metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object(
         'cert_number', regexp_replace(
                          regexp_replace(coalesce(metadata->>'cert_number', ''),
                                         'CR(\s*N°:)', 'CT\1', 'g'),
                          'CR-(\d)', 'CT-\1', 'g'),
         'renamed_from', jsonb_build_object(
            'type',        'CR',
            'title',       title,
            'cert_number', metadata->>'cert_number',
            'renamed_at',  now()
         )
       )
WHERE type = 'CR';

-- Comprueba el resultado ANTES de confirmar. Las dos columnas deben dar 0.
SELECT
  count(*) FILTER (WHERE type = 'CR')                    AS quedan_sin_migrar,
  count(*) FILTER (WHERE type = 'CT'
                     AND (title LIKE '%Recepción%'
                       OR metadata->>'cert_number' LIKE 'CR%')) AS quedan_con_nombre_viejo
FROM public.documents;

COMMIT;
-- Si algo se ve mal, ejecuta ROLLBACK; en vez de COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- 3 · Verificación posterior
-- ─────────────────────────────────────────────────────────────────────────
-- Los kilos totales no deben haber cambiado: esto renombra, no recalcula.
--
--   SELECT type, count(*), min(created_at)::date, max(created_at)::date
--   FROM public.documents
--   WHERE type IN ('CT', 'CR', 'COMMUNITY_CR')
--   GROUP BY type;
--
-- Y que no haya dos certificados con el mismo número:
--
--   SELECT metadata->>'cert_number' AS numero, count(*)
--   FROM public.documents
--   WHERE type = 'CT'
--   GROUP BY 1
--   HAVING count(*) > 1;


-- ─────────────────────────────────────────────────────────────────────────
-- Sobre el resto de la cadena
-- ─────────────────────────────────────────────────────────────────────────
-- COMMUNITY_CR conserva su código: es el retiro comunitario, un flujo distinto
-- cuyo documento nunca se llamó "de recepción". Renombrarlo no aportaría nada.
--
-- Los otros dos eslabones se cargan como documentos de terceros, con los tipos
-- que ya existen en el selector del escáner:
--   CR_ACOPIO · Certificado de Recepción del centro de acopio
--   cdf       · Certificado de Disposición Final
