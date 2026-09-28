-- Ver supabase/migrations/20260511130000_whatsapp_official_webhook_tracking.sql
ALTER TABLE public.whatsapp_official_accounts
  ADD COLUMN IF NOT EXISTS webhook_status TEXT,
  ADD COLUMN IF NOT EXISTS webhook_last_configured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_last_error TEXT;
