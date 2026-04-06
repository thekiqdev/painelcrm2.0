-- Etapa 1.1: Coluna is_super_admin em users para controle de acesso ao painel Super Admin
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- Índice para consultas que filtram por super admin (opcional)
CREATE INDEX IF NOT EXISTS idx_users_is_super_admin
  ON public.users(is_super_admin)
  WHERE is_super_admin = true;

COMMENT ON COLUMN public.users.is_super_admin IS 'Se true, o usuário pode acessar o painel Super Admin (/superadmin)';
