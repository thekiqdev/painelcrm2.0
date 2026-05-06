-- Índice local: estado de upload e drive_file_id opcional até concluir envio ao Drive.

ALTER TABLE public.client_google_drive_files
  ADD COLUMN IF NOT EXISTS upload_status TEXT NOT NULL DEFAULT 'ready';

ALTER TABLE public.client_google_drive_files
  ADD COLUMN IF NOT EXISTS upload_error TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_google_drive_files_upload_status_check'
  ) THEN
    ALTER TABLE public.client_google_drive_files
      ADD CONSTRAINT client_google_drive_files_upload_status_check
      CHECK (upload_status IN ('uploading', 'processing', 'ready', 'failed'));
  END IF;
END $$;

ALTER TABLE public.client_google_drive_files
  ALTER COLUMN drive_file_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_google_drive_files_folder_list
  ON public.client_google_drive_files (tenant_id, client_id, drive_folder_id)
  WHERE trashed_at IS NULL AND source_module = 'client_files';

COMMENT ON COLUMN public.client_google_drive_files.upload_status IS
  'Estado do envio ao Drive: uploading, processing, ready, failed (índice local).';
COMMENT ON COLUMN public.client_google_drive_files.upload_error IS
  'Mensagem curta em caso de falha (sem dados sensíveis).';
