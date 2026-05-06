-- Pastas criadas pelo utilizador em Cliente > Arquivos (subárvore da pasta «Arquivos» no Drive).

CREATE TABLE IF NOT EXISTS public.client_google_drive_user_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  drive_folder_id TEXT NOT NULL,
  parent_drive_folder_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trashed_at TIMESTAMPTZ,
  CONSTRAINT client_google_drive_user_folders_drive_unique UNIQUE (tenant_id, client_id, drive_folder_id)
);

CREATE INDEX IF NOT EXISTS idx_client_google_drive_user_folders_tenant_client
  ON public.client_google_drive_user_folders (tenant_id, client_id)
  WHERE trashed_at IS NULL;

COMMENT ON TABLE public.client_google_drive_user_folders IS
  'Pastas criadas manualmente na aba Cliente > Arquivos; validação de árvore «Arquivos» no backend.';

CREATE TRIGGER update_client_google_drive_user_folders_updated_at
  BEFORE UPDATE ON public.client_google_drive_user_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
