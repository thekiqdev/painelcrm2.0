-- Fase 1 (Design Checkpoint): entidade de tentativas de pagamento por fatura.
-- Objetivo: rastreabilidade de múltiplas tentativas sem quebrar customer_invoices como agregado.

CREATE TABLE IF NOT EXISTS public.customer_invoice_payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.customer_invoices(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_ci_attempts_invoice_created
  ON public.customer_invoice_payment_attempts (invoice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ci_attempts_tenant_created
  ON public.customer_invoice_payment_attempts (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ci_attempts_invoice_method_status
  ON public.customer_invoice_payment_attempts (invoice_id, payment_method, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ci_attempts_gateway_reference
  ON public.customer_invoice_payment_attempts (gateway, gateway_reference_id)
  WHERE gateway_reference_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ci_attempts_one_active_per_invoice
  ON public.customer_invoice_payment_attempts (invoice_id)
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ci_attempts_idempotency
  ON public.customer_invoice_payment_attempts (invoice_id, payment_method, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TRIGGER update_customer_invoice_payment_attempts_updated_at
  BEFORE UPDATE ON public.customer_invoice_payment_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.customer_invoice_payment_attempts IS 'Tentativas de pagamento por customer_invoice (troca de método, rastreabilidade e reconciliação).';
COMMENT ON COLUMN public.customer_invoice_payment_attempts.is_active IS 'Tentativa atualmente ativa para exibição/polling na tela pública.';
COMMENT ON COLUMN public.customer_invoice_payment_attempts.gateway_reference_id IS 'ID da cobrança no gateway para lookup de webhook.';
COMMENT ON COLUMN public.customer_invoice_payment_attempts.gateway_metadata IS 'Payload de exibição por método (pixQrCode, pixCopyPaste, bankSlipUrl, invoiceUrl, etc.).';

ALTER TABLE public.customer_invoice_payment_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_invoice_payment_attempts_tenant_policy ON public.customer_invoice_payment_attempts;
CREATE POLICY customer_invoice_payment_attempts_tenant_policy ON public.customer_invoice_payment_attempts
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());
