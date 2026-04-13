-- supabase/migrations/20260413_add_is_active_to_profiles.sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
