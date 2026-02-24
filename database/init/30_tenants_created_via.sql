-- Origem do tenant: 'registration' = cadastro no site, 'superadmin' = criado pelo Super Admin
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS created_via TEXT DEFAULT 'superadmin'
  CHECK (created_via IN ('registration', 'superadmin'));

COMMENT ON COLUMN public.tenants.created_via IS 'Origem: registration = cadastro no site, superadmin = criado manualmente no painel';
