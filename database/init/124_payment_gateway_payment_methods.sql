-- Métodos de pagamento habilitados e padrão por config de gateway (global + tenant).
-- Compatível: default JSONB com os três métodos; default_payment_method NULL = usar ordem de fallback na aplicação.

ALTER TABLE public.payment_gateway_configs
  ADD COLUMN IF NOT EXISTS enabled_payment_methods JSONB NOT NULL DEFAULT '["pix","boleto","credit_card"]'::jsonb,
  ADD COLUMN IF NOT EXISTS default_payment_method TEXT NULL;

COMMENT ON COLUMN public.payment_gateway_configs.enabled_payment_methods IS 'Slugs: pix, boleto, credit_card — métodos oferecidos no checkout e intersectados com faturas.';
COMMENT ON COLUMN public.payment_gateway_configs.default_payment_method IS 'Slug do método padrão (deve estar em enabled_payment_methods) ou NULL para fallback automático.';
