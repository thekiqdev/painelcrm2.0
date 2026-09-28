-- Etapa 3 Propostas: token opaco (hash) para visualização pública e aceite/recusa pelo cliente.
-- O segredo cru nunca é persistido; apenas SHA-256 hex do token (mesmo padrão conceitual dos contratos).

CREATE TABLE IF NOT EXISTS public.proposal_public_view_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_proposal_public_tokens_proposal_active
  ON public.proposal_public_view_tokens(proposal_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_proposal_public_tokens_tenant
  ON public.proposal_public_view_tokens(tenant_id);

COMMENT ON TABLE public.proposal_public_view_tokens IS 'Links públicos de proposta/orçamento (Etapa 3). Um token ativo por vez por proposta na prática (revogação ao reemitir).';
