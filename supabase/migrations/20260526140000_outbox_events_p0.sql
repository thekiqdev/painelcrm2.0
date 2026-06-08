-- P0 Sprint 2: transactional outbox backbone (mirror of database/init/254_outbox_events_p0.sql)

DO $$ BEGIN
  CREATE TYPE public.outbox_event_status AS ENUM (
    'pending',
    'publishing',
    'published',
    'failed',
    'dead_letter'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL,
  event_version INT NOT NULL DEFAULT 1,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  tenant_id UUID REFERENCES public.tenants (id) ON DELETE SET NULL,
  correlation_id TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  status public.outbox_event_status NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 8,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  priority SMALLINT NOT NULL DEFAULT 2 CHECK (priority >= 0 AND priority <= 3),
  last_error TEXT,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  dead_letter_at TIMESTAMPTZ,
  causation_id UUID,
  replay_of_event_id UUID REFERENCES public.outbox_events (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outbox_events_idempotency_key_uq UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_poll
  ON public.outbox_events (priority ASC, next_retry_at ASC, created_at ASC)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_outbox_events_publishing_stale
  ON public.outbox_events (locked_at)
  WHERE status = 'publishing';

CREATE INDEX IF NOT EXISTS idx_outbox_events_correlation
  ON public.outbox_events (correlation_id);

CREATE INDEX IF NOT EXISTS idx_outbox_events_aggregate
  ON public.outbox_events (aggregate_type, aggregate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbox_events_tenant
  ON public.outbox_events (tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.outbox_dispatch_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_event_id UUID NOT NULL REFERENCES public.outbox_events (id) ON DELETE CASCADE,
  worker_id TEXT NOT NULL,
  attempt_number INT NOT NULL,
  outcome TEXT NOT NULL,
  error_message TEXT,
  duration_ms INT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_dispatch_log_event
  ON public.outbox_dispatch_log (outbox_event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.outbox_subscriber_idempotency (
  subscriber_name TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  outbox_event_id UUID NOT NULL REFERENCES public.outbox_events (id) ON DELETE CASCADE,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subscriber_name, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.outbox_replay_markers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_event_id UUID NOT NULL REFERENCES public.outbox_events (id) ON DELETE CASCADE,
  replay_event_id UUID NOT NULL REFERENCES public.outbox_events (id) ON DELETE CASCADE,
  correlation_id TEXT NOT NULL,
  created_by TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_replay_markers_original
  ON public.outbox_replay_markers (original_event_id, created_at DESC);

INSERT INTO public.platform_feature_flags (key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode)
VALUES
  ('outbox.publisher_worker_v1', 'outbox', 'Outbox publisher worker v1', false, 'outbox.publisher_off', 'off', 0, true),
  ('outbox.passive_consumers_v1', 'outbox', 'Passive shadow consumers', false, 'outbox.master_off', 'off', 0, true),
  ('outbox.replay_foundation_v1', 'outbox', 'Replay marker foundation', false, 'outbox.master_off', 'off', 0, true),
  ('outbox.dead_letter_v1', 'outbox', 'Dead-letter transitions', false, 'outbox.master_off', 'off', 0, true)
ON CONFLICT (key) DO NOTHING;
