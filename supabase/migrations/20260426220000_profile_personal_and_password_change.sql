-- Sync with database/init/157_profile_personal_and_password_change.sql

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS locale TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS company_legal_name TEXT,
  ADD COLUMN IF NOT EXISTS company_email TEXT,
  ADD COLUMN IF NOT EXISTS company_website TEXT,
  ADD COLUMN IF NOT EXISTS company_street TEXT,
  ADD COLUMN IF NOT EXISTS company_number TEXT,
  ADD COLUMN IF NOT EXISTS company_district TEXT;

CREATE TABLE IF NOT EXISTS public.user_password_change_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_password_change_codes_attempts_range CHECK (attempts_count >= 0 AND attempts_count <= 50)
);

CREATE INDEX IF NOT EXISTS idx_user_password_change_codes_user_created
  ON public.user_password_change_codes (user_id, created_at DESC);
