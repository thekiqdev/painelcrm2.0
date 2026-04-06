-- Flag para indicar que o onboarding (criação do primeiro admin e dados da empresa) foi concluído
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.onboarding_completed IS 'Se true, o primeiro administrador e dados da empresa já foram configurados (onboarding concluído).';
