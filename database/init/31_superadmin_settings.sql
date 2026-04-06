-- Configurações do Super Admin (ex.: limite de cadastros no site)
CREATE TABLE IF NOT EXISTS public.superadmin_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_superadmin_settings_updated_at
  BEFORE UPDATE ON public.superadmin_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.superadmin_settings IS 'Configurações globais do Super Admin (ex: max_registrations = limite de cadastros no site, 0 = ilimitado)';

-- Valor padrão: ilimitado (null ou 0 = não bloquear por número)
INSERT INTO public.superadmin_settings (key, value) VALUES ('max_registrations', NULL)
ON CONFLICT (key) DO NOTHING;
