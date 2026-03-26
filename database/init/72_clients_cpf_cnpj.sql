-- Customer Billing Fase 1: CPF/CNPJ do cliente para cobrança via gateway (Asaas).
-- Ref: docs/PLANO-ACAO-CUSTOMER-BILLING-VALIDACOES-E-GATEWAY.md
-- Obrigatório para emissão de fatura manual; migração não altera dados existentes.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;

COMMENT ON COLUMN public.clients.cpf_cnpj IS 'CPF ou CNPJ do cliente; obrigatório para emissão de fatura/cobrança via gateway.';
