-- P0 Sprint 5: workflow executions, automation jobs, saga foundation, validation snapshots

DO $$ BEGIN
  CREATE TYPE public.workflow_execution_status AS ENUM (
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.automation_job_status AS ENUM (
    'scheduled',
    'running',
    'completed',
    'failed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.saga_instance_status AS ENUM (
    'pending',
    'running',
    'completed',
    'compensating',
    'failed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_key TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  tenant_id UUID REFERENCES public.tenants (id) ON DELETE SET NULL,
  status public.workflow_execution_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  dry_run BOOLEAN NOT NULL DEFAULT true,
  shadow_mode BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workflow_executions_execution_id_uq UNIQUE (execution_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_status
  ON public.workflow_executions (workflow_key, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_correlation
  ON public.workflow_executions (correlation_id);

CREATE TABLE IF NOT EXISTS public.automation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key TEXT NOT NULL,
  workflow_execution_id UUID REFERENCES public.workflow_executions (id) ON DELETE SET NULL,
  saga_instance_id UUID,
  tenant_id UUID REFERENCES public.tenants (id) ON DELETE SET NULL,
  correlation_id TEXT NOT NULL,
  status public.automation_job_status NOT NULL DEFAULT 'scheduled',
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  shadow_mode BOOLEAN NOT NULL DEFAULT true,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_jobs_scheduled
  ON public.automation_jobs (status, scheduled_for ASC)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_automation_jobs_workflow
  ON public.automation_jobs (workflow_execution_id);

CREATE TABLE IF NOT EXISTS public.saga_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saga_key TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  tenant_id UUID REFERENCES public.tenants (id) ON DELETE SET NULL,
  status public.saga_instance_status NOT NULL DEFAULT 'pending',
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  compensation_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  rollback_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  shadow_mode BOOLEAN NOT NULL DEFAULT true,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saga_instances_correlation
  ON public.saga_instances (correlation_id);

CREATE TABLE IF NOT EXISTS public.workflow_validation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_execution_id UUID REFERENCES public.workflow_executions (id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workflow_validation_snapshots_idempotency_uq UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_workflow_validation_snapshots_execution
  ON public.workflow_validation_snapshots (workflow_execution_id, created_at DESC);

COMMENT ON TABLE public.workflow_executions IS 'P0 Sprint 5 — workflow runtime executions (shadow-first)';
COMMENT ON TABLE public.automation_jobs IS 'P0 Sprint 5 — scheduled/delayed automation jobs foundation';
COMMENT ON TABLE public.saga_instances IS 'P0 Sprint 5 — saga state foundation (no real compensation P0)';

INSERT INTO public.platform_feature_flags (key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode)
VALUES
  ('workflow.runtime_v1', 'workflow', 'Workflow runtime foundation', false, 'workflow.master_off', 'off', 0, true),
  ('workflow.shadow_execution_v1', 'workflow', 'Shadow workflow execution (no side effects)', false, 'workflow.master_off', 'off', 0, true),
  ('workflow.passive_consumers_v1', 'workflow', 'Passive outbox consumers → workflow bridge', false, 'workflow.master_off', 'off', 0, true),
  ('workflow.orchestration_v1', 'workflow', 'Orchestration start/step/cancel foundation', false, 'workflow.master_off', 'off', 0, true),
  ('workflow.saga_foundation_v1', 'workflow', 'Saga instance registration foundation', false, 'workflow.master_off', 'off', 0, true),
  ('workflow.bridge_v1', 'workflow', 'Outbox event → workflow bridge', false, 'workflow.master_off', 'off', 0, true)
ON CONFLICT (key) DO NOTHING;
