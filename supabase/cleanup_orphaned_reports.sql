-- SQL para limpiar reportes huérfanos
-- Borra reportes (type 'report' o 'pdf') de usuarios que no tienen ningún certificado (type 'CR' o 'verified')

DELETE FROM public.documents
WHERE type IN ('report', 'pdf')
AND user_id NOT IN (
    SELECT DISTINCT user_id 
    FROM public.documents 
    WHERE type IN ('CR', 'verified')
);
