-- Link público seguro para pagamento da mesma tenant_billing (fatura SaaS da plataforma).
-- Token opaco 64 hex (32 bytes); não expor UUID na URL pública.

ALTER TABLE public.tenant_billing
  ADD COLUMN IF NOT EXISTS platform_public_pay_token TEXT NULL;

COMMENT ON COLUMN public.tenant_billing.platform_public_pay_token IS
  'Token opaco para /saas-pay/:token; único quando preenchido; mesma linha tenant_billing sem recriar cobrança.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_billing_platform_public_pay_token_unique
  ON public.tenant_billing (platform_public_pay_token)
  WHERE platform_public_pay_token IS NOT NULL AND length(trim(platform_public_pay_token)) > 0;
