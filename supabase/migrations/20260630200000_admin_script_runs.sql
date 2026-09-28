-- Mirror database/init/204_admin_script_runs.sql
CREATE TABLE IF NOT EXISTS public.admin_script_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('preview', 'execute')),
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  executed_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  affected_count INTEGER NOT NULL DEFAULT 0,
  preview_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_script_runs_script_created
  ON public.admin_script_runs (script_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_script_runs_executed_by
  ON public.admin_script_runs (executed_by, created_at DESC);
