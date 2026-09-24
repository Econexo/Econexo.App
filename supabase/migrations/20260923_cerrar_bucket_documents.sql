-- ═══════════════════════════════════════════════════════════════════════════
-- Cerrar el bucket público 'documents'
-- ═══════════════════════════════════════════════════════════════════════════
-- El bucket 'documents' es PÚBLICO: cualquiera con la URL —o adivinándola—
-- descarga certificados y guías de tus clientes sin iniciar sesión.
--
-- Comprobado desde fuera, sin sesión, el 2026-09-23:
--   GET /storage/v1/object/public/documents/<lo-que-sea>   → "Object not found"
--   GET /storage/v1/object/public/scanned-docs/<lo-mismo>  → "Bucket not found"
-- La diferencia es el diagnóstico: en el primero la petición llegó a buscar el
-- archivo, o sea el bucket sirve al público. En el segundo ni eso, porque es
-- privado. Así debería responder también 'documents'.
--
-- El código ya no sube nada ahí: las subidas nuevas van a 'scanned-docs', que es
-- privado y se sirve con URL firmada de 60 s. Lo que queda es el histórico.
--
-- El orden importa y no se puede invertir: si cierras el bucket antes de copiar
-- los archivos, los documentos antiguos dejan de abrirse. El bloque 2 no te deja
-- avanzar hasta que la copia esté hecha.
--
-- ⚠️  Backup antes del bloque 3 (Database → Backups).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1 · Cuánto histórico apunta al bucket público (solo consulta)
-- ─────────────────────────────────────────────────────────────────────────
-- Si devuelve 0, salta directo al bloque 4: no hay nada que migrar.

SELECT
  count(*)                        AS filas_en_bucket_publico,
  min(created_at)::date           AS mas_antigua,
  max(created_at)::date           AS mas_reciente,
  count(DISTINCT user_id)         AS clientes_afectados
FROM public.documents
WHERE content_url LIKE '%/storage/v1/object/public/documents/%';


-- ─────────────────────────────────────────────────────────────────────────
-- 2 · Copiar los archivos a 'scanned-docs' y verificar que estén
-- ─────────────────────────────────────────────────────────────────────────
-- SQL no mueve binarios. La copia se hace desde Storage en el panel de Supabase
-- (o con la CLI), conservando la MISMA ruta dentro del bucket: si el archivo
-- está en documents/<uuid>/1234_guia.pdf, en scanned-docs tiene que quedar en
-- <uuid>/1234_guia.pdf.
--
-- Esta consulta compara las dos cosas y te dice si ya puedes seguir. Lee
-- storage.objects, así que mira los archivos de verdad, no lo que uno supone.

SELECT
  count(*)                                    AS total,
  count(o.name)                               AS ya_copiados,
  count(*) - count(o.name)                    AS faltan_por_copiar
FROM public.documents d
LEFT JOIN storage.objects o
  ON o.bucket_id = 'scanned-docs'
 AND o.name = regexp_replace(d.content_url, '^.*/storage/v1/object/public/documents/', '')
WHERE d.content_url LIKE '%/storage/v1/object/public/documents/%';

-- Y cuáles faltan, para ir a buscarlos uno por uno:
--
--   SELECT d.id, d.title,
--          regexp_replace(d.content_url, '^.*/storage/v1/object/public/documents/', '') AS ruta_esperada
--   FROM public.documents d
--   LEFT JOIN storage.objects o
--     ON o.bucket_id = 'scanned-docs'
--    AND o.name = regexp_replace(d.content_url, '^.*/storage/v1/object/public/documents/', '')
--   WHERE d.content_url LIKE '%/storage/v1/object/public/documents/%'
--     AND o.name IS NULL;
--
-- NO SIGAS hasta que faltan_por_copiar sea 0.


-- ─────────────────────────────────────────────────────────────────────────
-- 3 · Reescribir las URL a rutas relativas
-- ─────────────────────────────────────────────────────────────────────────
-- La app ya distingue los dos formatos: URL absoluta → se abre directo; ruta →
-- URL firmada contra 'scanned-docs' (ver Documents.handleDownload y
-- Admin.openStoredFile). Pasar a ruta es lo que activa la descarga firmada.
--
-- El WHERE solo toca las filas cuyo archivo YA está copiado. Si quedó alguna sin
-- copiar, esta sentencia la deja intacta en vez de romperla, y el bloque 2 la
-- sigue mostrando.

BEGIN;

UPDATE public.documents d
SET content_url = regexp_replace(
      d.content_url, '^.*/storage/v1/object/public/documents/', ''
    )
WHERE d.content_url LIKE '%/storage/v1/object/public/documents/%'
  AND EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'scanned-docs'
      AND o.name = regexp_replace(d.content_url, '^.*/storage/v1/object/public/documents/', '')
  );

-- Debe dar 0. Si no, vuelve al bloque 2 antes de confirmar.
SELECT count(*) AS quedan_apuntando_al_bucket_publico
FROM public.documents
WHERE content_url LIKE '%/storage/v1/object/public/documents/%';

COMMIT;
-- Si algo se ve mal, ROLLBACK; en vez de COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- 4 · Cerrar el bucket
-- ─────────────────────────────────────────────────────────────────────────

UPDATE storage.buckets SET public = false WHERE id = 'documents';


-- ─────────────────────────────────────────────────────────────────────────
-- 5 · Comprobación
-- ─────────────────────────────────────────────────────────────────────────
-- 5.1 · Los dos buckets deben aparecer como privados:
--
--   SELECT id, public FROM storage.buckets ORDER BY id;
--
--   Ojo: 'avatars' probablemente deba seguir público —son fotos de perfil que la
--   app muestra sin firmar—. Este cierre es solo para 'documents'.
--
-- 5.2 · Desde fuera, sin sesión, la respuesta tiene que cambiar a "Bucket not
--       found" (antes era "Object not found"):
--
--   curl -s https://<tu-proyecto>.supabase.co/storage/v1/object/public/documents/x.pdf
--
-- 5.3 · Y en la app, abrir un documento antiguo del histórico: debe descargarse
--       igual que antes, ahora con URL firmada. Prueba uno de los más viejos que
--       listó el bloque 1.
--
-- Para revertir: UPDATE storage.buckets SET public = true WHERE id = 'documents';
-- Las rutas reescritas en el bloque 3 siguen funcionando igual, porque la app
-- firma contra 'scanned-docs' y ahí quedaron las copias.
