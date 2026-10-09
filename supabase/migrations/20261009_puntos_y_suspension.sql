-- Eco-Puntos y suspensión de cuentas.
--
-- 1. Eco-Puntos: el canje descontaba los puntos desde el navegador
--    (profiles.update), así que una empresa podía ponerse los que quisiera.
--    Ahora eco_points solo lo cambian un admin o las funciones de aquí
--    (increment_points, redeem_reward), que corren como su dueño.
-- 2. Suspensión: is_active = false solo escondía la app; la sesión seguía
--    sirviendo contra la API. Ahora suspender también bloquea la cuenta en
--    Auth (banned_until): no puede volver a entrar ni renovar el token. El
--    token vigente expira solo (≤ 1 h).
--
-- Requiere 20261009_proteger_profiles.sql aplicada.
-- Se corre a mano en el SQL Editor.

-- ── 1 · eco_points protegido en el trigger de profiles ─────────────────────
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Solo se limita a los roles de la API (la app). Service role, SQL Editor,
  -- funciones SECURITY DEFINER y administradores pasan sin límites.
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_admin, false) THEN
      RAISE EXCEPTION 'No autorizado: is_admin solo lo asigna un administrador';
    END IF;
    IF COALESCE(NEW.eco_points, 0) <> 0 THEN
      RAISE EXCEPTION 'No autorizado: los Eco-Puntos solo los asigna Econexo';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'No autorizado: is_admin solo lo cambia un administrador';
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'No autorizado: is_active solo lo cambia un administrador';
  END IF;
  IF NEW.eco_points IS DISTINCT FROM OLD.eco_points THEN
    RAISE EXCEPTION 'No autorizado: los Eco-Puntos solo cambian por retiros o canjes';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 2 · increment_points solo para administradores ─────────────────────────
-- Bloque 1 de 20260824_security_hardening.sql, repetido por si no se aplicó:
-- sin el chequeo, cualquier sesión podía regalarse puntos por RPC.
CREATE OR REPLACE FUNCTION public.increment_points(user_id_param UUID, amount_param INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede modificar Eco-Puntos';
  END IF;

  -- Los puntos no bajan de cero aunque se reviertan certificados de más.
  UPDATE public.profiles
  SET eco_points = GREATEST(0, COALESCE(eco_points, 0) + amount_param)
  WHERE id = user_id_param;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_points(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_points(UUID, INTEGER) TO authenticated;

-- ── 3 · Canje de recompensas en el servidor ────────────────────────────────
-- El catálogo vive aquí para que el costo no lo decida el navegador. Mantener
-- en sintonía con `rewards` de screens/Rewards.tsx (mismos id, título y costo).
CREATE OR REPLACE FUNCTION public.redeem_reward(reward_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid     uuid := auth.uid();
  v_title text;
  v_cost  integer;
  balance integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sin sesión' USING ERRCODE = '42501';
  END IF;

  SELECT r.title, r.cost INTO v_title, v_cost
  FROM (VALUES
    (1, '15% Descuento Retiro',     2000),
    (2, '20% Descuento Productos',  2000),
    (3, '10% Descuento Talleres',   3000)
  ) AS r(id, title, cost)
  WHERE r.id = reward_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recompensa no encontrada';
  END IF;

  -- FOR UPDATE: dos canjes simultáneos no pueden gastar el mismo saldo.
  SELECT COALESCE(eco_points, 0) INTO balance
  FROM public.profiles WHERE id = uid AND is_active IS DISTINCT FROM false
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta no disponible';
  END IF;
  IF balance < v_cost THEN
    RAISE EXCEPTION 'Puntos insuficientes';
  END IF;

  UPDATE public.profiles SET eco_points = balance - v_cost WHERE id = uid;
  INSERT INTO public.points_transactions (user_id, amount, reason)
  VALUES (uid, -v_cost, 'Canje: ' || v_title);

  RETURN balance - v_cost;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_reward(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_reward(integer) TO authenticated;

-- ── 4 · Suspender / reactivar bloqueando el acceso en Auth ─────────────────
CREATE OR REPLACE FUNCTION public.admin_set_account_active(target_id uuid, active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede suspender cuentas.' USING ERRCODE = '42501';
  END IF;
  IF target_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes suspender tu propia cuenta.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = target_id AND is_admin) THEN
    RAISE EXCEPTION 'No se puede suspender a un administrador.';
  END IF;

  UPDATE public.profiles SET is_active = active WHERE id = target_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta no existe.';
  END IF;

  -- Auth rechaza el login y la renovación del token mientras banned_until
  -- esté en el futuro. Fecha lejana en vez de 'infinity' (Auth no la lee).
  UPDATE auth.users
  SET banned_until = CASE WHEN active THEN NULL ELSE now() + interval '100 years' END
  WHERE id = target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_account_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_account_active(uuid, boolean) TO authenticated;

-- Las cuentas que ya estaban suspendidas quedan bloqueadas también.
UPDATE auth.users u
SET banned_until = now() + interval '100 years'
FROM public.profiles p
WHERE p.id = u.id AND p.is_active = false AND NOT COALESCE(p.is_admin, false)
  AND (u.banned_until IS NULL OR u.banned_until < now());

-- Comprobación:
--   SELECT proname FROM pg_proc WHERE proname IN ('redeem_reward', 'admin_set_account_active', 'increment_points');
--   SELECT p.company_name, u.banned_until FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.is_active = false;
