-- Documentos que aparecían con un día menos.
--
-- La carga masiva y el escáner guardaban la fecha elegida con
-- `new Date('YYYY-MM-DD')`, que es medianoche UTC: en Chile eso todavía es el
-- día anterior a las 20–21 h. Desde el fix se guarda mediodía local, como los
-- retiros. Estas filas se reconocen porque quedaron exactamente a las 00:00:00
-- UTC; ninguna otra ruta de la app guarda esa hora.
--
-- Se corren a mano en el SQL Editor, en orden.

-- 1 · Revisar qué se va a mover (la fecha correcta es la del día UTC).
SELECT id, title, type, created_at,
       ((created_at AT TIME ZONE 'UTC')::date + time '12:00') AT TIME ZONE 'America/Santiago' AS nueva_fecha
FROM public.documents
WHERE (created_at AT TIME ZONE 'UTC')::time = time '00:00:00'
ORDER BY created_at DESC;

-- 2 · Corregir: mismo día, a mediodía de Chile.
UPDATE public.documents
SET created_at = ((created_at AT TIME ZONE 'UTC')::date + time '12:00') AT TIME ZONE 'America/Santiago'
WHERE (created_at AT TIME ZONE 'UTC')::time = time '00:00:00';
