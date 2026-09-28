-- Etapa 4 Propostas: política pós-aceite (faturamento) + fila mínima de eventos para integrações.

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS post_accept_billing_mode TEXT NOT NULL DEFAULT 'none'
  CHECK (post_accept_billing_mode IN ('none', 'notify_team', 'auto_pending_invoice'));

COMMENT ON COLUMN public.proposals.post_accept_billing_mode IS
  'Após aceite público: none | notify_team (notificação interna) | auto_pending_invoice (tenta criar fatura pendente com as mesmas regras do convert manual).';

CREATE TABLE IF NOT EXISTS public.proposal_integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_integration_events_proposal
  ON public.proposal_integration_events(proposal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_integration_events_tenant
  ON public.proposal_integration_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_integration_events_key
  ON public.proposal_integration_events(event_key);

COMMENT ON TABLE public.proposal_integration_events IS
  'Eventos de integração (webhooks/chat futuro). Etapa 4: insert-only + listagem autenticada.';
