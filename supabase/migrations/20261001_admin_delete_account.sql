-- Eliminar una cuenta de cliente sin perder sus certificados.
--
-- documents.user_id tiene ON DELETE CASCADE contra auth.users y profiles: borrar
-- el usuario a secas se llevaría todos sus CT. Por eso, antes de borrar, la
-- empresa se convierte en un cliente manual (documento UNREGISTERED_CLIENT, el
-- mismo mecanismo que «(Manual)» en Admin) y sus documentos pasan a ese
-- cliente: user_id = el admin que borra, metadata.unregistered_client_id = el
-- cliente nuevo. Así siguen apareciendo en Admin, CGM, cierre mensual e Impacto.
--
-- Todo corre en una transacción: si algo falla, no se borra nada.
-- Se corre a mano en el SQL Editor.

CREATE OR REPLACE FUNCTION public.admin_delete_account(target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id   uuid := auth.uid();
  prof       public.profiles%ROWTYPE;
  user_email text;
  doc_count  integer;
  manual_id  uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede eliminar cuentas.' USING ERRCODE = '42501';
  END IF;
  IF target_id = admin_id THEN
    RAISE EXCEPTION 'No puedes eliminar tu propia cuenta.';
  END IF;

  SELECT * INTO prof FROM public.profiles WHERE id = target_id;
  IF FOUND AND prof.is_admin THEN
    RAISE EXCEPTION 'No se puede eliminar la cuenta de un administrador.';
  END IF;
  SELECT email INTO user_email FROM auth.users WHERE id = target_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta no existe.';
  END IF;

  SELECT count(*) INTO doc_count FROM public.documents WHERE user_id = target_id;

  IF doc_count > 0 THEN
    INSERT INTO public.documents (user_id, title, type, verified, metadata)
    VALUES (
      admin_id,
      'Cliente Manual: ' || COALESCE(prof.company_name, user_email),
      'UNREGISTERED_CLIENT',
      true,
      jsonb_build_object(
        'company_name', COALESCE(prof.company_name, user_email),
        'rut',          COALESCE(prof.rut, ''),
        'address',      COALESCE(prof.address, ''),
        'email',        COALESCE(prof.company_email, user_email, ''),
        'linked_user_id', NULL,
        -- Rastro de dónde salió este cliente.
        'former_user_id', target_id,
        'converted_at',   now()
      )
    )
    RETURNING id INTO manual_id;

    UPDATE public.documents
    SET user_id  = admin_id,
        metadata = COALESCE(metadata, '{}'::jsonb)
                   || jsonb_build_object('unregistered_client_id', manual_id)
    WHERE user_id = target_id;
  END IF;

  -- Se lleva perfil, puntos, notificaciones, tickets y suscripciones (CASCADE).
  DELETE FROM auth.users WHERE id = target_id;

  RETURN jsonb_build_object('documents_kept', doc_count, 'manual_client_id', manual_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_account(uuid) TO authenticated;
