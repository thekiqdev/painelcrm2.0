-- Etapa 1 — Ciclos rastreáveis de assinatura (PLANO_DEFINITIVO_FATURAS_RECORRENTES_COM_CICLOS.md).
-- Tabela + RLS + flags globais + backfill idempotente. Não altera scheduler/worker.

-- ---------------------------------------------------------------------------
-- 1) Tabela
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  cycle_date DATE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'queued', 'processing', 'invoiced', 'skipped', 'failed', 'cancelled')),
  invoice_id UUID NULL REFERENCES public.customer_invoices(id) ON DELETE SET NULL,
  job_id UUID NULL REFERENCES public.billing_recurring_jobs(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ NULL,
  skipped_reason TEXT NULL,
  error_message TEXT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, cycle_date)
);

CREATE INDEX IF NOT EXISTS idx_subscription_cycles_tenant_subscription_cycle
  ON public.subscription_cycles (tenant_id, subscription_id, cycle_date DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_cycles_subscription_status
  ON public.subscription_cycles (subscription_id, status);

CREATE INDEX IF NOT EXISTS idx_subscription_cycles_invoice_id
  ON public.subscription_cycles (invoice_id)
  WHERE invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_cycles_job_id
  ON public.subscription_cycles (job_id)
  WHERE job_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_subscription_cycles_updated_at ON public.subscription_cycles;
CREATE TRIGGER update_subscription_cycles_updated_at
  BEFORE UPDATE ON public.subscription_cycles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.subscription_cycles IS
  'Ciclo lógico de cobrança por assinatura (Etapa 1: leitura/backfill; worker passa a dual-write nas fases seguintes).';
COMMENT ON COLUMN public.subscription_cycles.cycle_date IS
  'Dia âncora do ciclo (YYYY-MM-DD), alinhado a cycle_key / period_start da fatura quando existir.';
COMMENT ON COLUMN public.subscription_cycles.status IS
  'pending|queued|processing|invoiced|skipped|failed|cancelled — ver docs/SUBSCRIPTION_CYCLES_PHASE1.md';

-- ---------------------------------------------------------------------------
-- 2) RLS (mesmo padrão de subscriptions / billing_recurring_jobs)
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscription_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_cycles_tenant_policy ON public.subscription_cycles;
CREATE POLICY subscription_cycles_tenant_policy ON public.subscription_cycles
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

COMMENT ON POLICY subscription_cycles_tenant_policy ON public.subscription_cycles IS
  'Etapa 1 RLS: isolamento por tenant_id (billing).';

-- ---------------------------------------------------------------------------
-- 3) Feature flags globais (superadmin_settings; Etapa 2+ consome no backend)
-- ---------------------------------------------------------------------------
INSERT INTO public.superadmin_settings (key, value, updated_at)
VALUES
  ('subscription_cycles_read', 'true', now()),
  ('subscription_cycles_write', 'true', now())
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4) Backfill idempotente — ordem: faturas → jobs → próximo ciclo pendente
-- ---------------------------------------------------------------------------

-- 4a) customer_invoices → invoiced (cycle_date = period_start)
INSERT INTO public.subscription_cycles (
  tenant_id, subscription_id, cycle_date, period_start, period_end,
  status, invoice_id, job_id, processed_at, skipped_reason, error_message, metadata
)
SELECT
  ci.tenant_id,
  ci.subscription_id,
  ci.period_start,
  ci.period_start,
  ci.period_end,
  'invoiced',
  ci.id,
  NULL,
  ci.updated_at,
  NULL,
  NULL,
  jsonb_build_object('backfill_source', 'customer_invoices', 'backfill_version', 1)
FROM public.customer_invoices ci
WHERE ci.subscription_id IS NOT NULL
  AND ci.period_start IS NOT NULL
  AND ci.period_end IS NOT NULL
ON CONFLICT (subscription_id, cycle_date) DO UPDATE SET
  invoice_id = EXCLUDED.invoice_id,
  period_start = EXCLUDED.period_start,
  period_end = EXCLUDED.period_end,
  status = 'invoiced',
  updated_at = now(),
  metadata = COALESCE(subscription_cycles.metadata, '{}'::jsonb) || EXCLUDED.metadata;

-- 4b) billing_recurring_jobs (último job por subscription + dia lógico)
WITH ranked_jobs AS (
  SELECT
    br.*,
    ROW_NUMBER() OVER (
      PARTITION BY br.subscription_id, br.cycle_key
      ORDER BY br.updated_at DESC NULLS LAST, br.created_at DESC NULLS LAST
    ) AS rn
  FROM public.billing_recurring_jobs br
  WHERE trim(br.cycle_key) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND length(trim(br.cycle_key)) = 10
),
j AS (
  SELECT * FROM ranked_jobs WHERE rn = 1
),
job_rows AS (
  SELECT
    j.tenant_id,
    j.subscription_id,
    j.cycle_key::date AS cycle_date,
    COALESCE(ci.period_start, j.cycle_key::date) AS period_start,
    COALESCE(
      ci.period_end,
      ((j.cycle_key::date + CASE s.billing_interval
        WHEN 'monthly' THEN INTERVAL '1 month'
        WHEN 'quarterly' THEN INTERVAL '3 months'
        WHEN 'semi_annual' THEN INTERVAL '6 months'
        WHEN 'yearly' THEN INTERVAL '1 year'
        ELSE INTERVAL '1 month'
      END)::date) - 1
    ) AS period_end,
    CASE j.status
      WHEN 'pending' THEN 'queued'
      WHEN 'processing' THEN 'processing'
      WHEN 'failed' THEN 'failed'
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'completed' THEN
        CASE
          WHEN j.result_invoice_type = 'tenant_billing' AND j.result_invoice_id IS NOT NULL THEN 'skipped'
          WHEN ci.id IS NOT NULL THEN 'invoiced'
          WHEN j.result_invoice_id IS NOT NULL
            AND (j.result_invoice_type IS NULL OR j.result_invoice_type = 'customer_invoice')
            AND EXISTS (
              SELECT 1 FROM public.customer_invoices x
              WHERE x.id = j.result_invoice_id AND x.subscription_id = j.subscription_id
            )
            THEN 'invoiced'
          WHEN j.completion_outcome IN (
            'completed_no_invoice_no_eligible_items',
            'completed_idempotent_existing_customer_invoice',
            'completed_idempotent_existing_saas_invoice'
          ) THEN 'skipped'
          WHEN j.completion_outcome IS NOT NULL THEN 'skipped'
          ELSE 'skipped'
        END
      ELSE 'skipped'
    END AS cycle_status,
    CASE
      WHEN j.result_invoice_type = 'tenant_billing' THEN NULL
      ELSE COALESCE(
        ci.id,
        CASE
          WHEN j.result_invoice_id IS NOT NULL
            AND (j.result_invoice_type IS NULL OR j.result_invoice_type = 'customer_invoice')
            AND EXISTS (
              SELECT 1 FROM public.customer_invoices x
              WHERE x.id = j.result_invoice_id AND x.subscription_id = j.subscription_id
            )
            THEN j.result_invoice_id
          ELSE NULL
        END
      )
    END AS invoice_id_resolved,
    j.id AS job_id_val,
    j.status AS job_status_val,
    CASE WHEN j.status IN ('completed', 'failed', 'cancelled') THEN j.updated_at ELSE NULL END AS processed_at_val,
    CASE
      WHEN j.status = 'failed' THEN COALESCE(j.completion_outcome, 'failed')
      WHEN j.status = 'cancelled' THEN j.completion_outcome
      WHEN j.status = 'completed' AND j.result_invoice_type = 'tenant_billing' AND j.result_invoice_id IS NOT NULL
        THEN COALESCE(j.completion_outcome, 'tenant_billing_invoice_no_crm_fk')
      WHEN j.status = 'completed'
        AND j.result_invoice_id IS NULL
        THEN j.completion_outcome
      ELSE NULL
    END AS skipped_reason_val,
    CASE WHEN j.status = 'failed' THEN j.error_message ELSE NULL END AS error_message_val,
    CASE
      WHEN j.result_invoice_type = 'tenant_billing' AND j.result_invoice_id IS NOT NULL THEN
        jsonb_build_object('tenant_billing_invoice_id', j.result_invoice_id::text)
      ELSE '{}'::jsonb
    END AS extra_meta
  FROM j
  INNER JOIN public.subscriptions s ON s.id = j.subscription_id
  LEFT JOIN public.customer_invoices ci
    ON ci.subscription_id = j.subscription_id AND ci.period_start = j.cycle_key::date
)
INSERT INTO public.subscription_cycles (
  tenant_id, subscription_id, cycle_date, period_start, period_end,
  status, invoice_id, job_id, processed_at, skipped_reason, error_message, metadata
)
SELECT
  tenant_id,
  subscription_id,
  cycle_date,
  period_start,
  period_end,
  cycle_status,
  invoice_id_resolved,
  job_id_val,
  processed_at_val,
  skipped_reason_val,
  error_message_val,
  jsonb_build_object(
    'backfill_source', 'billing_recurring_jobs',
    'backfill_version', 1,
    'job_status', job_rows.job_status_val
  ) || job_rows.extra_meta
FROM job_rows
ON CONFLICT (subscription_id, cycle_date) DO UPDATE SET
  job_id = EXCLUDED.job_id,
  invoice_id = COALESCE(subscription_cycles.invoice_id, EXCLUDED.invoice_id),
  processed_at = COALESCE(subscription_cycles.processed_at, EXCLUDED.processed_at),
  error_message = COALESCE(EXCLUDED.error_message, subscription_cycles.error_message),
  skipped_reason = COALESCE(subscription_cycles.skipped_reason, EXCLUDED.skipped_reason),
  status = CASE
    WHEN COALESCE(subscription_cycles.invoice_id, EXCLUDED.invoice_id) IS NOT NULL THEN 'invoiced'
    WHEN subscription_cycles.status = 'invoiced' THEN 'invoiced'
    ELSE EXCLUDED.status
  END,
  period_start = CASE
    WHEN COALESCE(subscription_cycles.invoice_id, EXCLUDED.invoice_id) IS NOT NULL
      THEN EXCLUDED.period_start
    ELSE COALESCE(subscription_cycles.period_start, EXCLUDED.period_start)
  END,
  period_end = CASE
    WHEN COALESCE(subscription_cycles.invoice_id, EXCLUDED.invoice_id) IS NOT NULL
      THEN EXCLUDED.period_end
    ELSE COALESCE(subscription_cycles.period_end, EXCLUDED.period_end)
  END,
  updated_at = now(),
  metadata = COALESCE(subscription_cycles.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb);

-- 4c) Próximo ciclo por assinatura ativa — pending apenas se ainda não há linha para next_billing_date
INSERT INTO public.subscription_cycles (
  tenant_id, subscription_id, cycle_date, period_start, period_end,
  status, invoice_id, job_id, processed_at, skipped_reason, error_message, metadata
)
SELECT
  s.tenant_id,
  s.id,
  s.next_billing_date,
  s.next_billing_date,
  ((s.next_billing_date + CASE s.billing_interval
    WHEN 'monthly' THEN INTERVAL '1 month'
    WHEN 'quarterly' THEN INTERVAL '3 months'
    WHEN 'semi_annual' THEN INTERVAL '6 months'
    WHEN 'yearly' THEN INTERVAL '1 year'
    ELSE INTERVAL '1 month'
  END)::date) - 1,
  'pending',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  jsonb_build_object('backfill_source', 'subscription_next_billing', 'backfill_version', 1)
FROM public.subscriptions s
WHERE s.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM public.subscription_cycles sc
    WHERE sc.subscription_id = s.id
      AND sc.cycle_date = s.next_billing_date
  )
ON CONFLICT (subscription_id, cycle_date) DO NOTHING;
