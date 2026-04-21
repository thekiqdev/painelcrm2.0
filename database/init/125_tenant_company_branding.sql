-- Dados comerciais / branding por tenant: logos tema claro/escuro e endereço (Configurações → Dados da Empresa)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS logo_light_url TEXT,
  ADD COLUMN IF NOT EXISTS logo_dark_url TEXT,
  ADD COLUMN IF NOT EXISTS company_address_line TEXT,
  ADD COLUMN IF NOT EXISTS company_city TEXT,
  ADD COLUMN IF NOT EXISTS company_state TEXT,
  ADD COLUMN IF NOT EXISTS company_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS company_whatsapp TEXT;

COMMENT ON COLUMN public.tenants.logo_light_url IS 'URL da logo para tema claro; fallback legado: logo_url';
COMMENT ON COLUMN public.tenants.logo_dark_url IS 'URL da logo para tema escuro';
COMMENT ON COLUMN public.tenants.company_address_line IS 'Endereço (logradouro) para exibição e documentos';
COMMENT ON COLUMN public.tenants.company_city IS 'Cidade';
COMMENT ON COLUMN public.tenants.company_state IS 'Estado/UF';
COMMENT ON COLUMN public.tenants.company_postal_code IS 'CEP';
COMMENT ON COLUMN public.tenants.company_whatsapp IS 'WhatsApp comercial do tenant (exibição)';

-- Migração suave: copiar logo legada para variante clara quando ainda vazio
UPDATE public.tenants
SET logo_light_url = logo_url
WHERE logo_url IS NOT NULL AND trim(logo_url) <> '' AND (logo_light_url IS NULL OR trim(logo_light_url) = '');
