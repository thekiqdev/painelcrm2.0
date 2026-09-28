-- Pastas Google Drive por cliente (hierarquia: Empresa / Clientes / {Cliente} / Arquivos, Contratos, Propostas, Faturas).

CREATE TABLE IF NOT EXISTS public.client_google_drive_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  client_root_folder_id TEXT NOT NULL,
  folder_arquivos_id TEXT NOT NULL,
  folder_contratos_id TEXT NOT NULL,
  folder_propostas_id TEXT NOT NULL,
  folder_faturas_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_google_drive_folders_client_unique UNIQUE (client_id)
);

CREATE INDEX IF NOT EXISTS idx_client_google_drive_folders_tenant_id
  ON public.client_google_drive_folders (tenant_id);

COMMENT ON TABLE public.client_google_drive_folders IS 'IDs das pastas Drive por cliente CRM (tenant Google Drive ligado).';

CREATE TRIGGER update_client_google_drive_folders_updated_at
  BEFORE UPDATE ON public.client_google_drive_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
