-- Fase 2 — Trial no checkout, suspensão pós-trial, retomada de pagamento
-- Ref: PLANO-EXECUTIVO-TRIAL-CHECKOUT-COBRANCA-E-RETOMADA.md

-- Planos: dias de trial antes da cobrança obrigatória (distinto de is_free / free_access_days)
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS trial_days INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.plans.trial_days IS 'Dias de trial no checkout; 0 = pagamento imediato (Fase 1). Não confundir com plano gratuito permanente (is_free).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'plans' AND c.conname = 'plans_trial_days_check'
  ) THEN
    ALTER TABLE public.plans
      ADD CONSTRAINT plans_trial_days_check CHECK (trial_days >= 0);
  END IF;
END $$;

-- Tenants: motivo de suspensão, auditoria de trial consumido
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS has_used_trial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_consumed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.tenants.suspension_reason IS 'Ex.: trial_expired, payment_overdue, manual';
COMMENT ON COLUMN public.tenants.has_used_trial IS 'True após iniciar trial de checkout ou equivalente; bloqueia segundo trial (CPF/e-mail/WA).';
COMMENT ON COLUMN public.tenants.trial_consumed_at IS 'Quando o direito a trial foi marcado como consumido neste tenant.';

CREATE INDEX IF NOT EXISTS idx_tenants_trial_expiry_job
  ON public.tenants (status, trial_ends_at)
  WHERE status = 'trial' AND trial_ends_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_cpf_cnpj_has_trial
  ON public.tenants (cpf_cnpj)
  WHERE cpf_cnpj IS NOT NULL AND length(trim(cpf_cnpj)) > 0 AND has_used_trial = true;

-- Retrocompatível: quem já está ativo ou já pagou não deve ganhar “novo trial”
UPDATE public.tenants
SET has_used_trial = true,
    trial_consumed_at = COALESCE(trial_consumed_at, updated_at, created_at)
WHERE status = 'active';

UPDATE public.tenants
SET has_used_trial = true,
    trial_consumed_at = COALESCE(trial_consumed_at, updated_at, created_at)
WHERE activated_billing_id IS NOT NULL;

-- Tenants já em trial (legado): considerar trial já alocado
UPDATE public.tenants
SET has_used_trial = true,
    trial_consumed_at = COALESCE(trial_consumed_at, created_at)
WHERE status = 'trial';
