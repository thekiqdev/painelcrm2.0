-- Pasta «Projetos» por cliente (irmã de Arquivos, Contratos, Propostas, Faturas).

ALTER TABLE public.client_google_drive_folders
  ADD COLUMN IF NOT EXISTS folder_projetos_id TEXT;

COMMENT ON COLUMN public.client_google_drive_folders.folder_projetos_id IS
  'Pasta Google Drive «Projetos» do cliente; cada projeto tem subpasta com Releases.';
