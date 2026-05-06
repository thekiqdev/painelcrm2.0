-- Integração Google Drive por tenant (OAuth; tokens cifrados no backend; pastas raiz no Drive).

CREATE TABLE IF NOT EXISTS public.tenant_google_drive_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connected_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  google_account_email TEXT NOT NULL,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT NOT NULL,
  root_folder_id TEXT,
  clients_folder_id TEXT,
  is_connected BOOLEAN NOT NULL DEFAULT true,
  connection_error TEXT,
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_google_drive_integrations_one_per_tenant UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_google_drive_integrations_tenant_id
  ON public.tenant_google_drive_integrations (tenant_id);

COMMENT ON TABLE public.tenant_google_drive_integrations IS 'OAuth Google Drive por tenant CRM; tokens em ciphertext (AES-GCM no backend); pastas empresa + Clientes no Drive.';

CREATE TRIGGER update_tenant_google_drive_integrations_updated_at
  BEFORE UPDATE ON public.tenant_google_drive_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
