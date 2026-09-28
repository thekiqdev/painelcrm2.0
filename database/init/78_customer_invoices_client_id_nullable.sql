-- Fase 8: client_id nullable para faturas por link (sem cliente cadastrado).
-- Ref: docs/ANALISE-IMPLANTACAO-SEGURA-EVOLUCAO-FINANCEIRO.md
-- O cliente pode ser preenchido depois na página de pagamento (link único).

ALTER TABLE public.customer_invoices
  ALTER COLUMN client_id DROP NOT NULL;

COMMENT ON COLUMN public.customer_invoices.client_id IS 'Cliente vinculado. NULL = fatura por link aguardando preenchimento na página de pagamento.';
