-- Distinção password vs confirmação para editar perfil (mesmo fluxo WhatsApp, códigos separados por purpose)

ALTER TABLE public.user_password_change_codes
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'password';

ALTER TABLE public.user_password_change_codes
  DROP CONSTRAINT IF EXISTS user_password_change_codes_purpose_check;

ALTER TABLE public.user_password_change_codes
  ADD CONSTRAINT user_password_change_codes_purpose_check
  CHECK (purpose IN ('password', 'profile_edit'));

COMMENT ON COLUMN public.user_password_change_codes.purpose IS 'password = alterar senha; profile_edit = desbloquear edição de dados pessoais / foto.';

CREATE INDEX IF NOT EXISTS idx_user_password_change_codes_user_purpose_created
  ON public.user_password_change_codes (user_id, purpose, created_at DESC);
