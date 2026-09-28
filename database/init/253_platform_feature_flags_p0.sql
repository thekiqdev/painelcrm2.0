-- P0 Sprint 1: rollout registry (separado de plan_features e system_feature_flags)

CREATE TABLE IF NOT EXISTS public.platform_feature_flags (
  key TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  default_enabled BOOLEAN NOT NULL DEFAULT false,
  kill_switch_key TEXT,
  rollout_type TEXT NOT NULL DEFAULT 'off'
    CHECK (rollout_type IN ('off', 'internal', 'allowlist', 'percent', 'global')),
  rollout_percent SMALLINT NOT NULL DEFAULT 0
    CHECK (rollout_percent >= 0 AND rollout_percent <= 100),
  shadow_mode BOOLEAN NOT NULL DEFAULT false,
  schema_version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_feature_flags_namespace
  ON public.platform_feature_flags (namespace);

CREATE TABLE IF NOT EXISTS public.platform_feature_flag_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT NOT NULL REFERENCES public.platform_feature_flags (key) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants (id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_feature_flag_overrides_scope_ck CHECK (
    tenant_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_feature_flag_overrides_tenant
  ON public.platform_feature_flag_overrides (flag_key, tenant_id);

CREATE INDEX IF NOT EXISTS idx_platform_feature_flag_overrides_flag
  ON public.platform_feature_flag_overrides (flag_key);

COMMENT ON TABLE public.platform_feature_flags IS 'P0 rollout registry — feature flags de implementação (não confundir com plan_features)';
COMMENT ON TABLE public.platform_feature_flag_overrides IS 'Overrides por tenant do rollout registry';

-- Seed P0 — todas OFF em produção (default_enabled = false, rollout_type = off)
INSERT INTO public.platform_feature_flags (key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode)
VALUES
  ('acquisition.master_off', 'acquisition', 'Kill switch global acquisition', false, NULL, 'off', 0, false),
  ('acquisition.signup_session_v1', 'acquisition', 'Signup session state machine', false, 'acquisition.master_off', 'off', 0, true),
  ('acquisition.trial_activation_v1', 'acquisition', 'Trial activation flow v1', false, 'acquisition.master_off', 'off', 0, true),
  ('acquisition.defer_tenant_v1', 'acquisition', 'Defer tenant creation at checkout', false, 'acquisition.master_off', 'off', 0, true),
  ('communication.master_off', 'communication', 'Kill switch communication platform', false, NULL, 'off', 0, false),
  ('communication.gateway_v1', 'communication', 'channelProviderGateway', false, 'communication.master_off', 'off', 0, true),
  ('communication.bridge_dual_dispatch', 'communication', 'Dual dispatch bridge (staging only)', false, 'communication.master_off', 'off', 0, true),
  ('communication.webhook_normalizer_v1', 'communication', 'Webhook normalizer layer', false, 'communication.master_off', 'off', 0, true),
  ('outbox.master_off', 'outbox', 'Kill switch outbox write+dispatch', false, NULL, 'off', 0, false),
  ('outbox.publisher_off', 'outbox', 'Stop outbox publisher only', false, NULL, 'off', 0, false),
  ('outbox.write_v1', 'outbox', 'Transactional outbox write', false, 'outbox.master_off', 'off', 0, true),
  ('outbox.publisher_v1', 'outbox', 'Outbox publisher worker', false, 'outbox.publisher_off', 'off', 0, true),
  ('outbox.subscribers_v1', 'outbox', 'Outbox subscribers', false, 'outbox.master_off', 'off', 0, true),
  ('workflow.master_off', 'workflow', 'Kill switch workflow engine', false, NULL, 'off', 0, false),
  ('workflow.scheduler_v1', 'workflow', 'Workflow scheduler worker', false, 'workflow.master_off', 'off', 0, true),
  ('workflow.retry_v1', 'workflow', 'Workflow retry worker', false, 'workflow.master_off', 'off', 0, true),
  ('onboarding.master_off', 'onboarding', 'Kill switch onboarding engine', false, NULL, 'off', 0, false),
  ('onboarding.engine_v1', 'onboarding', 'Onboarding engine', false, 'onboarding.master_off', 'off', 0, true),
  ('onboarding.recovery_v1', 'onboarding', 'Onboarding recovery automation', false, 'onboarding.master_off', 'off', 0, true),
  ('billing_recovery.shadow_metrics_v1', 'billing_recovery', 'Shadow metrics billing recovery', false, NULL, 'off', 0, true),
  ('meta_readiness.probe_v1', 'meta_readiness', 'Meta Cloud readiness probe', false, 'communication.master_off', 'off', 0, true),
  ('platform.correlation_middleware_v1', 'platform', 'Correlation ID middleware (disable = passthrough only)', true, NULL, 'global', 100, false)
ON CONFLICT (key) DO NOTHING;
