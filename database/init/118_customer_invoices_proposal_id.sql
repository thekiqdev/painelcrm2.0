-- Etapa 1 Propostas: preparar vínculo opcional fatura ↔ proposta (sem lógica de conversão ainda).
-- Coluna nullable + FK com ON DELETE SET NULL para não bloquear exclusão de proposta no futuro.

ALTER TABLE public.customer_invoices
  ADD COLUMN IF NOT EXISTS proposal_id UUID NULL REFERENCES public.proposals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_invoices_proposal_id
  ON public.customer_invoices(proposal_id)
  WHERE proposal_id IS NOT NULL;

COMMENT ON COLUMN public.customer_invoices.proposal_id IS 'Proposta de origem (quando a fatura for gerada a partir de proposta aceita). Etapa 1: apenas schema; preenchimento na etapa de conversão.';
