ALTER TABLE public.client_google_drive_folders
  ADD COLUMN IF NOT EXISTS folder_projetos_id TEXT;
