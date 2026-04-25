-- Recuperação de senha por código WhatsApp (motor da plataforma).
-- Código numérico: hash (bcrypt), expiração 60 min, uso único, tentativas limitadas.

CREATE TABLE IF NOT EXISTS public.password_reset_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  whatsapp_digits TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT password_reset_codes_attempts_range CHECK (attempts_count >= 0 AND attempts_count <= 50)
);

COMMENT ON TABLE public.password_reset_codes IS 'Códigos de recuperação de senha enviados por WhatsApp; código em texto claro nunca persistido.';
COMMENT ON COLUMN public.password_reset_codes.consumed_at IS 'Preenchido ao validar o código (antes da nova senha) ou ao invalidar/supersedir.';

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_created
  ON public.password_reset_codes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_whatsapp_created
  ON public.password_reset_codes (whatsapp_digits, created_at DESC);

DROP TRIGGER IF EXISTS update_password_reset_codes_updated_at ON public.password_reset_codes;
CREATE TRIGGER update_password_reset_codes_updated_at
  BEFORE UPDATE ON public.password_reset_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_notification_event_catalog (event_key, module, description, default_channel, merge_fields, is_active)
VALUES
  ('platform.auth.password_reset_code_issued', 'platform_auth',
   'Código numérico para recuperação de senha (WhatsApp)', 'whatsapp',
   '["platform.name","platform.support_link","user.name","auth.reset_code","auth.code_expires_in_minutes"]'::jsonb,
   true)
ON CONFLICT (event_key) DO NOTHING;

INSERT INTO public.platform_notification_template_system (event_key, channel, locale, subject_template, body_template, version, is_active)
VALUES
  ('platform.auth.password_reset_code_issued', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{user.name}}*.\n\n*{{platform.name}}* — código para redefinir a sua senha:\n\n*{{auth.reset_code}}*\n\nVálido por *{{auth.code_expires_in_minutes}}* minutos. Não partilhe este código.\n\nSe não foi você, ignore esta mensagem.\n\n{{platform.support_link}}',
   1, true)
ON CONFLICT (event_key, channel, locale) DO NOTHING;
