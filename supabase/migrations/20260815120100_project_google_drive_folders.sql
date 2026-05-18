CREATE TABLE IF NOT EXISTS public.project_google_drive_folders (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_folder_id TEXT NOT NULL,
  folder_releases_id TEXT NOT NULL,
  version_folder_id TEXT,
  version_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_google_drive_folders_tenant_client
  ON public.project_google_drive_folders (tenant_id, client_id);

CREATE TRIGGER update_project_google_drive_folders_updated_at
  BEFORE UPDATE ON public.project_google_drive_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
