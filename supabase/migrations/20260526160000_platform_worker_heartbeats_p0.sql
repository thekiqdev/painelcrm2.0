-- Mirror: database/init/255_platform_worker_heartbeats_p0.sql

DO $$ BEGIN
  CREATE TYPE public.platform_worker_status AS ENUM (
    'starting', 'healthy', 'degraded', 'shutting_down', 'stopped', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.platform_worker_heartbeats (
  worker_id TEXT PRIMARY KEY,
  worker_type TEXT NOT NULL,
  status public.platform_worker_status NOT NULL DEFAULT 'starting',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  correlation_id TEXT,
  lock_token TEXT,
  locked_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_worker_heartbeats_type_status
  ON public.platform_worker_heartbeats (worker_type, status);
CREATE INDEX IF NOT EXISTS idx_platform_worker_heartbeats_last_heartbeat
  ON public.platform_worker_heartbeats (last_heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_worker_heartbeats_stale
  ON public.platform_worker_heartbeats (status, last_heartbeat_at)
  WHERE status IN ('starting', 'healthy', 'degraded');

INSERT INTO public.platform_feature_flags (key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode)
VALUES
  ('worker.runtime_v1', 'worker', 'Worker runtime lifecycle', false, NULL, 'off', 0, true),
  ('worker.heartbeat_v1', 'worker', 'Platform worker heartbeats', false, NULL, 'off', 0, true),
  ('worker.health_v1', 'worker', 'Worker health service', false, NULL, 'off', 0, true),
  ('worker.reclaim_v1', 'worker', 'Stale worker reclaim', false, NULL, 'off', 0, true)
ON CONFLICT (key) DO NOTHING;
