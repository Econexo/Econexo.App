-- Support admin account suspension (soft-delete). Default true = all existing users remain active.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
