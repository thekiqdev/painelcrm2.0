-- Etapa 2 Propostas: status "invoiced", vínculo proposta → fatura gerada, timeline mínima,
-- unicidade de fatura por proposta (uma conversão principal).

-- Timeline / auditoria mínima
CREATE TABLE IF NOT EXISTS public.proposal_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_timeline_proposal_id
  ON public.proposal_timeline_events(proposal_id);

CREATE INDEX IF NOT EXISTS idx_proposal_timeline_created
  ON public.proposal_timeline_events(proposal_id, created_at);

-- Proposta: fatura principal gerada (espelha customer_invoices.proposal_id após conversão)
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS converted_invoice_id UUID NULL
  REFERENCES public.customer_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_proposals_converted_invoice
  ON public.proposals(converted_invoice_id)
  WHERE converted_invoice_id IS NOT NULL;

-- Estende CHECK de status (preserva valores existentes + invoiced)
ALTER TABLE public.proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
ALTER TABLE public.proposals ADD CONSTRAINT proposals_status_check
  CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'invoiced'));

-- Uma fatura principal por proposta quando proposal_id está preenchido
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_invoices_proposal_id
  ON public.customer_invoices(proposal_id)
  WHERE proposal_id IS NOT NULL;

COMMENT ON COLUMN public.proposals.converted_invoice_id IS 'Fatura principal criada a partir desta proposta (Etapa 2).';
COMMENT ON TABLE public.proposal_timeline_events IS 'Eventos de auditoria mínimos da proposta (Etapa 2).';
