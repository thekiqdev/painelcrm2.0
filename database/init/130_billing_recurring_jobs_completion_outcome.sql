-- Etapa 1 — observabilidade: resultado explícito do job de recorrência (não é sucesso financeiro se não houve invoice).
ALTER TABLE public.billing_recurring_jobs
  ADD COLUMN IF NOT EXISTS completion_outcome TEXT NULL;

ALTER TABLE public.billing_recurring_jobs
  ADD COLUMN IF NOT EXISTS completion_detail TEXT NULL;

COMMENT ON COLUMN public.billing_recurring_jobs.completion_outcome IS
  'Classificação do término: invoice criada, idempotência, skip sem itens elegíveis, cancelado (motivo), etc.';

COMMENT ON COLUMN public.billing_recurring_jobs.completion_detail IS
  'JSON ou texto curto com contexto (ex.: prev_invoice_id, contagens de itens).';

CREATE INDEX IF NOT EXISTS idx_billing_recurring_jobs_completion_outcome
  ON public.billing_recurring_jobs (completion_outcome)
  WHERE completion_outcome IS NOT NULL;
