-- Sprint E2 — verificação de WhatsApp no cadastro (código 6 dígitos, 10 min, 5 tentativas).

CREATE TABLE IF NOT EXISTS public.signup_phone_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  ddi TEXT NOT NULL DEFAULT '55',
  code TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT signup_phone_verifications_attempts_ck CHECK (attempts >= 0 AND attempts <= 5)
);

COMMENT ON TABLE public.signup_phone_verifications IS 'Códigos de acesso WhatsApp no signup; coluna code = hash bcrypt (nunca texto claro).';
COMMENT ON COLUMN public.signup_phone_verifications.code IS 'Hash bcrypt do código numérico de 6 dígitos.';

CREATE INDEX IF NOT EXISTS idx_signup_phone_verifications_phone_created
  ON public.signup_phone_verifications (ddi, phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signup_phone_verifications_expires
  ON public.signup_phone_verifications (expires_at)
  WHERE verified_at IS NULL;

DROP TRIGGER IF EXISTS update_signup_phone_verifications_updated_at ON public.signup_phone_verifications;
CREATE TRIGGER update_signup_phone_verifications_updated_at
  BEFORE UPDATE ON public.signup_phone_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
