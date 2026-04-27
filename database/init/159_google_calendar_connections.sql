-- Conexões Google Calendar por utilizador e tenant (OAuth tokens cifrados na aplicação).

CREATE TABLE IF NOT EXISTS public.google_calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT google_calendar_connections_tenant_user_unique UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_connections_tenant_id
  ON public.google_calendar_connections (tenant_id);

CREATE INDEX IF NOT EXISTS idx_google_calendar_connections_user_id
  ON public.google_calendar_connections (user_id);

COMMENT ON TABLE public.google_calendar_connections IS 'OAuth Google Calendar por utilizador CRM; tokens em ciphertext (AES-GCM no backend).';

CREATE TRIGGER update_google_calendar_connections_updated_at
  BEFORE UPDATE ON public.google_calendar_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
