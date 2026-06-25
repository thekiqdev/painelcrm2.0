-- Sprint S2.1: histórico e vigência de alterações de contrato em assinaturas CRM.

CREATE TABLE IF NOT EXISTS public.subscription_change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  effective_at TEXT NOT NULL CHECK (effective_at IN ('immediate', 'next_cycle')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'applied', 'cancelled')),
  amount_cents INT NOT NULL CHECK (amount_cents > 0),
  billing_interval TEXT NOT NULL CHECK (
    billing_interval IN ('weekly', 'monthly', 'quarterly', 'semi_annual', 'yearly')
  ),
  description TEXT NOT NULL,
  reason TEXT NULL,
  previous_amount_cents INT NULL,
  previous_billing_interval TEXT NULL,
  previous_description TEXT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_subscription_change_events_subscription
  ON public.subscription_change_events(subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_change_events_pending
  ON public.subscription_change_events(subscription_id)
  WHERE status = 'pending';

COMMENT ON TABLE public.subscription_change_events IS
  'Alterações de contrato (valor, periodicidade, descrição) em assinaturas CRM; vigência imediata ou próximo ciclo.';
