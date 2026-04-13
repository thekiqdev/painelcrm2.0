-- Fase 2 catálogo: banner, tema da loja (logo já existia em store_logo)
ALTER TABLE public.store_profiles
  ADD COLUMN IF NOT EXISTS store_banner_url TEXT NULL;

ALTER TABLE public.store_profiles
  ADD COLUMN IF NOT EXISTS theme_key TEXT NOT NULL DEFAULT 'default';

ALTER TABLE public.store_profiles
  ADD COLUMN IF NOT EXISTS theme_options JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.store_profiles.store_banner_url IS 'URL pública do banner da vitrine (Fase 2 mídia)';
COMMENT ON COLUMN public.store_profiles.theme_key IS 'Identificador do tema da vitrine (registry no frontend)';
COMMENT ON COLUMN public.store_profiles.theme_options IS 'Opções leves do tema (JSON)';
