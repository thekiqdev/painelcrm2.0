-- Configurações institucionais do tenant: timezone, idioma, logo
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS locale TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN public.tenants.timezone IS 'Timezone do tenant (ex: America/Sao_Paulo)';
COMMENT ON COLUMN public.tenants.locale IS 'Idioma do tenant (ex: pt-BR, en)';
COMMENT ON COLUMN public.tenants.logo_url IS 'URL da logo da empresa';
