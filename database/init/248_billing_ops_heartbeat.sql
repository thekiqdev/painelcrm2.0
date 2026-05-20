-- Heartbeat operacional: última execução de billing:scheduler e billing:worker (sem alterar motor de jobs).
CREATE TABLE IF NOT EXISTS public.billing_ops_heartbeat (
  process_key TEXT PRIMARY KEY CHECK (process_key IN ('scheduler', 'worker')),
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_exit_json JSONB NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_ops_heartbeat IS
  'Última execução bem-sucedida dos scripts runRecurringScheduler / runRecurringWorker.';
