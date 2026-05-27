-- ============================================================
-- KMT MONITORING & OBSERVABILITY SETUP
-- Run this in Supabase SQL Editor
-- ============================================================

-- TABLE: log registration attempts so admin can see who is stuck
CREATE TABLE IF NOT EXISTS registration_log (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email      text NOT NULL,
  event      text NOT NULL, -- 'otp_sent', 'otp_verified', 'profile_saved', 'otp_resent'
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE registration_log ENABLE ROW LEVEL SECURITY;

-- Anyone (unauthenticated) can INSERT a log entry — needed before auth exists
CREATE POLICY "reg_log_insert_anon"
  ON registration_log FOR INSERT
  WITH CHECK (true);

-- Only admins can read logs
CREATE POLICY "reg_log_select_admin"
  ON registration_log FOR SELECT
  USING (get_my_role() = 'admin');

-- FUNCTION: find users stuck in auth but with no profile
-- (They verified their OTP but profile save failed, or never verified)
CREATE OR REPLACE FUNCTION get_stuck_registrations()
RETURNS TABLE (
  user_id    uuid,
  email      text,
  created_at timestamptz,
  last_sign_in timestamptz,
  has_profile  boolean
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    u.id,
    u.email,
    u.created_at,
    u.last_sign_in_at,
    (p.id IS NOT NULL) AS has_profile
  FROM auth.users u
  LEFT JOIN profiles p ON p.id = u.id
  ORDER BY u.created_at DESC
  LIMIT 100;
$$;
-- Only admins can call this function
REVOKE ALL ON FUNCTION get_stuck_registrations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_stuck_registrations() TO authenticated;

