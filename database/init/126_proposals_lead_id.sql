-- Propostas: vínculo opcional a lead (Kanban chat / CRM) — XOR com client_id
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_proposals_lead_id ON public.proposals(lead_id);

-- Não permitir cliente e lead na mesma proposta
ALTER TABLE public.proposals
  DROP CONSTRAINT IF EXISTS proposals_client_xor_lead_chk;

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_client_xor_lead_chk
  CHECK (NOT (client_id IS NOT NULL AND lead_id IS NOT NULL));
