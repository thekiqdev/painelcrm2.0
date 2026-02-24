-- Limites personalizados por tenant (sobrescrevem o plano quando preenchidos)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS max_users_override INTEGER,
  ADD COLUMN IF NOT EXISTS max_profiles_override INTEGER;

COMMENT ON COLUMN public.tenants.max_users_override IS 'Limite de usuários para este tenant; NULL = usar limite do plano';
COMMENT ON COLUMN public.tenants.max_profiles_override IS 'Limite de perfis para este tenant; NULL = usar limite do plano';
