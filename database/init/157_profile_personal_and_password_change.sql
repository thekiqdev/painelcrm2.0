-- Perfil pessoal (avatar, cargo, locale) e códigos de alteração de senha (utilizador autenticado)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS locale TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT;

COMMENT ON COLUMN public.profiles.avatar_url IS 'URL da foto do utilizador (ex.: catalog-media assinado)';
COMMENT ON COLUMN public.profiles.job_title IS 'Cargo / função exibido no perfil';

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS company_legal_name TEXT,
  ADD COLUMN IF NOT EXISTS company_email TEXT,
  ADD COLUMN IF NOT EXISTS company_website TEXT,
  ADD COLUMN IF NOT EXISTS company_street TEXT,
  ADD COLUMN IF NOT EXISTS company_number TEXT,
  ADD COLUMN IF NOT EXISTS company_district TEXT;

COMMENT ON COLUMN public.tenants.company_legal_name IS 'Razão social / denominação legal';
COMMENT ON COLUMN public.tenants.company_email IS 'E-mail comercial da empresa';
COMMENT ON COLUMN public.tenants.company_website IS 'Site público da empresa';

-- Códigos numéricos para alteração de senha com sessão ativa (hash bcrypt; sem código em claro).
CREATE TABLE IF NOT EXISTS public.user_password_change_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_password_change_codes_attempts_range CHECK (attempts_count >= 0 AND attempts_count <= 50)
);

COMMENT ON TABLE public.user_password_change_codes IS 'Códigos para alterar senha com utilizador autenticado; enviados ao WhatsApp cadastrado.';

CREATE INDEX IF NOT EXISTS idx_user_password_change_codes_user_created
  ON public.user_password_change_codes (user_id, created_at DESC);

DROP TRIGGER IF EXISTS update_user_password_change_codes_updated_at ON public.user_password_change_codes;
CREATE TRIGGER update_user_password_change_codes_updated_at
  BEFORE UPDATE ON public.user_password_change_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
