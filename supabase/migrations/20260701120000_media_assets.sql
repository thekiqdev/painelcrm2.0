CREATE TABLE IF NOT EXISTS public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL,
  owner_id UUID NULL,
  scope TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  checksum TEXT NULL,
  original_filename TEXT NULL,
  source_url TEXT NULL,
  public_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_media_assets_tenant_scope_created
  ON public.media_assets (tenant_id, scope, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_assets_owner_lookup
  ON public.media_assets (owner_type, owner_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_media_assets_storage_key
  ON public.media_assets (storage_key);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS trg_media_assets_updated_at ON public.media_assets;
    CREATE TRIGGER trg_media_assets_updated_at
      BEFORE UPDATE ON public.media_assets
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

COMMENT ON TABLE public.media_assets IS
  'Índice de mídia persistida (base Prompt 3). Não implica migração automática de módulos legados.';
