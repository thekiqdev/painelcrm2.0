-- M5 — permite created_via = 'partner' (cliente criado no Painel do Revendedor)

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_created_via_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_created_via_check
  CHECK (created_via IN ('registration', 'superadmin', 'partner'));

COMMENT ON COLUMN public.tenants.created_via IS
  'Origem: registration = cadastro no site; superadmin = criado no painel SA; partner = criado pelo Partner no canal';
