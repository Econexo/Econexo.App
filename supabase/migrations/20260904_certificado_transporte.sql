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
--   type          'CR'                              → 'CT'
--   title         'Certificado de Recepción CR N°:007' → 'Certificado de Transporte CT N°:007'
--   cert_number   'CR N°:007'                        → 'CT N°:007'
--
-- El NÚMERO no cambia. La secuencia continúa donde estaba: el 007 sigue siendo
-- el 007, solo cambia el prefijo. Un certificado ya entregado a un cliente
-- conserva su identificador.
--
-- ⚠️  Ejecuta los bloques de uno en uno. El 0 y el 1 solo consultan.
-- ⚠️  Haz un backup antes del bloque 2 (Database → Backups).
--
-- El código lee los dos prefijos, así que la app funciona igual antes y después
-- de aplicar esto. No hay prisa ni ventana de mantención.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 0 · Cuántas filas se van a tocar (solo consulta)
-- ─────────────────────────────────────────────────────────────────────────

SELECT
  count(*)                                                   AS total_cr,
  count(*) FILTER (WHERE title  LIKE '%Recepción%')          AS con_titulo_viejo,
  count(*) FILTER (WHERE metadata->>'cert_number' LIKE 'CR %') AS con_numero_viejo,
  min(created_at)::date                                      AS mas_antiguo,
  max(created_at)::date                                      AS mas_reciente
FROM public.documents
WHERE type = 'CR';


-- ─────────────────────────────────────────────────────────────────────────
-- 1 · Vista previa: cómo quedaría cada fila (solo consulta)
-- ─────────────────────────────────────────────────────────────────────────
-- Revisa que los títulos nuevos se vean bien ANTES de escribir nada.

SELECT
  id,
  created_at::date                       AS fecha,
  title                                  AS titulo_actual,
  replace(title, 'Certificado de Recepción CR N°:', 'Certificado de Transporte CT N°:')
                                         AS titulo_nuevo,
  metadata->>'cert_number'               AS numero_actual,
  replace(metadata->>'cert_number', 'CR N°:', 'CT N°:')
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
-- nombre, y a quién se le entregó con el nombre viejo.

BEGIN;

UPDATE public.documents
SET
  type  = 'CT',
  title = replace(
            replace(title, 'Certificado de Recepción', 'Certificado de Transporte'),
            'CR N°:', 'CT N°:'
          ),
  metadata = metadata
    || jsonb_build_object(
         'cert_number', replace(coalesce(metadata->>'cert_number', ''), 'CR N°:', 'CT N°:'),
         'renamed_from', jsonb_build_object(
            'type',        'CR',
            'title',       title,
            'cert_number', metadata->>'cert_number',
            'renamed_at',  now()
         )
       )
WHERE type = 'CR';

-- Comprueba el resultado ANTES de confirmar. Debe devolver 0 filas.
SELECT count(*) AS quedan_sin_migrar FROM public.documents WHERE type = 'CR';

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
-- Y que la numeración quedó correlativa, sin huecos ni repetidos:
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
