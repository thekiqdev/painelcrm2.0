-- Billing 2.0 Sprint 2 — Collection Policy + audit (espelho database/init/298).
-- Aditivo / seguro. Ver database/init/298_billing2_collection_policy_and_audit.sql

CREATE TABLE IF NOT EXISTS public.billing_collection_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'global'
    CHECK (scope IN ('global')),
  name TEXT NOT NULL DEFAULT 'default',
  policy_json JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NULL
);

COMMENT ON TABLE public.billing_collection_policy IS
  'Billing 2.0 — política global de cobrança automática (Collection Policy). Uma ativa por scope=global.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_collection_policy_active_global
  ON public.billing_collection_policy (scope)
  WHERE is_active = true AND scope = 'global';

CREATE INDEX IF NOT EXISTS idx_billing_collection_policy_updated
  ON public.billing_collection_policy (updated_at DESC);

INSERT INTO public.billing_collection_policy (scope, name, policy_json, version, is_active, updated_by)
SELECT
  'global',
  'default',
  '{
    "schema_version": 1,
    "renew_card_auto": false,
    "generate_pix_auto": true,
    "pix_automatic_enabled": false,
    "max_attempts": 3,
    "attempt_interval_days": 2,
    "suspend_after_days": 10,
    "cancel_after_days": 30,
    "notify_whatsapp": true,
    "notify_email": true,
    "generate_pix_after_failure": true,
    "reactivate_on_paid": true,
    "auto_suspend_enabled": false,
    "auto_cancel_enabled": false,
    "grace_period_days": 3,
    "actions_after_fail": ["create_pix", "notify_whatsapp", "notify_email"]
  }'::jsonb,
  1,
  true,
  'migration:298'
WHERE NOT EXISTS (
  SELECT 1 FROM public.billing_collection_policy
  WHERE scope = 'global' AND is_active = true
);

CREATE TABLE IF NOT EXISTS public.billing_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('system', 'superadmin', 'webhook', 'worker')),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NULL,
  reason TEXT NULL,
  origin TEXT NULL,
  correlation_id TEXT NULL,
  payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_audit_events IS
  'Billing 2.0 — trilha append-only de auditoria financeira/operacional (fail-open no writer).';

CREATE INDEX IF NOT EXISTS idx_billing_audit_events_created
  ON public.billing_audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_audit_events_correlation
  ON public.billing_audit_events (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_audit_events_entity
  ON public.billing_audit_events (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_audit_events_action
  ON public.billing_audit_events (action, created_at DESC);
