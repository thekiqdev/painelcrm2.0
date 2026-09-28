-- P0 Sprint 4: communication_messages foundation (shadow; does not migrate legacy messages)

DO $$ BEGIN
  CREATE TYPE public.communication_channel AS ENUM (
    'whatsapp',
    'email',
    'sms',
    'internal',
    'push'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.communication_message_intent AS ENUM (
    'onboarding',
    'recovery',
    'billing',
    'support',
    'crm',
    'marketing',
    'ai',
    'transactional'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.communication_delivery_state AS ENUM (
    'queued',
    'accepted',
    'sent',
    'delivered',
    'read',
    'failed',
    'dead_letter'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.communication_provider_key AS ENUM (
    'uazapi',
    'smtp',
    'meta_cloud',
    'internal'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.communication_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants (id) ON DELETE SET NULL,
  channel public.communication_channel NOT NULL,
  provider public.communication_provider_key NOT NULL,
  message_intent public.communication_message_intent NOT NULL,
  delivery_state public.communication_delivery_state NOT NULL DEFAULT 'queued',
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  recipient TEXT NOT NULL,
  provider_message_id TEXT,
  routing_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 8,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  shadow_mode BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT communication_messages_idempotency_uq UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_communication_messages_tenant_created
  ON public.communication_messages (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_communication_messages_correlation
  ON public.communication_messages (correlation_id);

CREATE INDEX IF NOT EXISTS idx_communication_messages_provider_ext
  ON public.communication_messages (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

COMMENT ON TABLE public.communication_messages IS 'P0 Sprint 4 — gateway message foundation (coexists with legacy chat/notifications tables)';

INSERT INTO public.platform_feature_flags (key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode)
VALUES
  ('communication.uazapi_bridge_v1', 'communication', 'UazAPI bridge adapter via gateway', false, 'communication.master_off', 'off', 0, true),
  ('communication.routing_v1', 'communication', 'Provider routing foundation', false, 'communication.master_off', 'off', 0, true),
  ('communication.capability_registry_v1', 'communication', 'Provider capability registry', false, 'communication.master_off', 'off', 0, true)
ON CONFLICT (key) DO NOTHING;
