-- Fase 4 — Plano multi-gateway: remover colunas e índices Asaas (PLANO-REFATORACAO-MULTI-GATEWAY).
-- Pré-requisito: Fase 3 concluída (leituras e escritas usam apenas gateway_reference_id/gateway_status).

-- =============================================================================
-- 1) Remover índices que referenciam asaas_payment_id
-- =============================================================================
DROP INDEX IF EXISTS public.idx_customer_invoices_gateway_asaas_payment_id;
DROP INDEX IF EXISTS public.idx_tenant_billing_gateway_asaas_payment_id;
DROP INDEX IF EXISTS public.idx_tenant_billing_asaas_payment_id;

-- =============================================================================
-- 2) Remover colunas asaas_payment_id e asaas_status
-- =============================================================================
ALTER TABLE public.customer_invoices
  DROP COLUMN IF EXISTS asaas_payment_id,
  DROP COLUMN IF EXISTS asaas_status;

ALTER TABLE public.tenant_billing
  DROP COLUMN IF EXISTS asaas_payment_id,
  DROP COLUMN IF EXISTS asaas_status;
