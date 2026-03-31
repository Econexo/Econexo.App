-- Fix overly permissive notification INSERT policy
-- Previously: WITH CHECK (true) allowed ANY authenticated user to create notifications for ANY user
-- Now: Only admins can insert notifications for other users

DROP POLICY IF EXISTS "Admins can insert notifications" ON notifications;

CREATE POLICY "Admins can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );
