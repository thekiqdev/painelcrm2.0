-- Metadados de ficheiros enviados em Cliente > Arquivos (Google Drive).

CREATE TABLE IF NOT EXISTS public.client_google_drive_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,
  drive_folder_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  web_view_link TEXT,
  web_content_link TEXT,
  source_module TEXT NOT NULL DEFAULT 'client_files'
    CHECK (source_module IN ('client_files', 'contracts', 'proposals', 'invoices')),
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trashed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_client_google_drive_files_tenant_client
  ON public.client_google_drive_files (tenant_id, client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_google_drive_files_source_module
  ON public.client_google_drive_files (source_module);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_google_drive_files_drive_file_id
  ON public.client_google_drive_files (drive_file_id);

COMMENT ON TABLE public.client_google_drive_files IS
  'Ficheiros enviados ao Google Drive por módulos do CRM (fase atual: client_files).';

CREATE TRIGGER update_client_google_drive_files_updated_at
  BEFORE UPDATE ON public.client_google_drive_files
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
