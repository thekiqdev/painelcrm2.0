-- Tentativas de pagamento por tenant_billing (checkout SaaS / plano).
-- Espelha a ideia de customer_invoice_payment_attempts: uma fatura principal + N tentativas por método,
-- evitando nova cobrança no gateway ao voltar para um método já utilizado.

CREATE TABLE IF NOT EXISTS public.tenant_billing_payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_id UUID NOT NULL REFERENCES public.tenant_billing(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gateway TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('PIX', 'BOLETO', 'CREDIT_CARD')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'waiting_payment', 'processing', 'paid', 'overdue', 'cancelled', 'failed', 'refunded')),
  gateway_status TEXT NULL,
  gateway_reference_id TEXT NULL,
  gateway_metadata JSONB NULL,
  idempotency_key TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  activated_at TIMESTAMPTZ NULL,
  deactivated_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  paid_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tb_attempts_billing_created
  ON public.tenant_billing_payment_attempts (billing_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tb_attempts_tenant_created
  ON public.tenant_billing_payment_attempts (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tb_attempts_billing_method_status
  ON public.tenant_billing_payment_attempts (billing_id, payment_method, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tb_attempts_gateway_reference
  ON public.tenant_billing_payment_attempts (gateway, gateway_reference_id)
  WHERE gateway_reference_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tb_attempts_one_active_per_billing
  ON public.tenant_billing_payment_attempts (billing_id)
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tb_attempts_idempotency
  ON public.tenant_billing_payment_attempts (billing_id, payment_method, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tb_attempts_one_open_reusable_per_billing_method
  ON public.tenant_billing_payment_attempts (billing_id, payment_method)
  WHERE status IN ('pending', 'waiting_payment', 'processing', 'overdue')
    AND gateway_reference_id IS NOT NULL;

CREATE TRIGGER update_tenant_billing_payment_attempts_updated_at
  BEFORE UPDATE ON public.tenant_billing_payment_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.tenant_billing_payment_attempts IS
  'Tentativas de pagamento por tenant_billing (checkout plano SaaS); alinhado ao fluxo de customer_invoice_payment_attempts.';
COMMENT ON COLUMN public.tenant_billing_payment_attempts.gateway_reference_id IS 'ID da cobrança no gateway (webhook).';
COMMENT ON COLUMN public.tenant_billing_payment_attempts.gateway_metadata IS 'URLs/PIX/boleto para exibição.';

ALTER TABLE public.tenant_billing_payment_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_billing_payment_attempts_tenant_policy ON public.tenant_billing_payment_attempts;
CREATE POLICY tenant_billing_payment_attempts_tenant_policy ON public.tenant_billing_payment_attempts
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());
