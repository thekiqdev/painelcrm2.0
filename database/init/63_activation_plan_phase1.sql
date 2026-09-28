-- Fase 1 — Ativação automática de planos: modelagem do banco
-- Ref: PLANO-ATIVACAO-AUTOMATICA-PLANOS-PAGAMENTO.md, CHECKLIST-IMPLEMENTACAO-ATIVACAO-PLANOS.md

-- 1) tenant_billing: novas colunas
ALTER TABLE public.tenant_billing
  ADD COLUMN IF NOT EXISTS users_count INTEGER,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS billing_reason TEXT;

COMMENT ON COLUMN public.tenant_billing.users_count IS 'Planos custom: quantidade de usuários na fatura';
COMMENT ON COLUMN public.tenant_billing.source IS 'Origem da cobrança: superadmin, self_service, api';
COMMENT ON COLUMN public.tenant_billing.billing_reason IS 'Motivo: plan_purchase, plan_upgrade, plan_renewal, manual_charge';

-- Constraint opcional para source (valores permitidos)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'tenant_billing' AND c.conname = 'tenant_billing_source_check'
  ) THEN
    ALTER TABLE public.tenant_billing
      ADD CONSTRAINT tenant_billing_source_check
      CHECK (source IS NULL OR source IN ('superadmin', 'self_service', 'api'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'tenant_billing' AND c.conname = 'tenant_billing_billing_reason_check'
  ) THEN
    ALTER TABLE public.tenant_billing
      ADD CONSTRAINT tenant_billing_billing_reason_check
      CHECK (billing_reason IS NULL OR billing_reason IN ('plan_purchase', 'plan_upgrade', 'plan_renewal', 'manual_charge'));
  END IF;
END $$;

-- 2) tenant_billing: incluir 'cancelled' no status (timeout 48h e cancelamentos)
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'tenant_billing' AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%status%'
  LIMIT 1;
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tenant_billing DROP CONSTRAINT IF EXISTS %I', conname);
  END IF;
END $$;

ALTER TABLE public.tenant_billing
  ADD CONSTRAINT tenant_billing_status_check
  CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled'));

-- 3) tenant_billing: índice para lookup no webhook por asaas_payment_id
-- (59 já tem índice composto gateway+asaas_payment_id; este otimiza buscas só por payment_id)
CREATE INDEX IF NOT EXISTS idx_tenant_billing_payment
  ON public.tenant_billing(asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;

-- idx_tenant_billing_tenant_id já existe em 33_tenant_billing.sql — nada a fazer

-- 4) tenants: período ativo e fatura que ativou
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS plan_period_start DATE,
  ADD COLUMN IF NOT EXISTS plan_period_end DATE,
  ADD COLUMN IF NOT EXISTS activated_billing_id UUID REFERENCES public.tenant_billing(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tenants.plan_period_start IS 'Início do período ativo atual do plano';
COMMENT ON COLUMN public.tenants.plan_period_end IS 'Fim do período ativo; validar acesso com plan_period_end >= now()';
COMMENT ON COLUMN public.tenants.activated_billing_id IS 'Fatura que ativou o plano atual (auditoria, suporte, disputas)';

CREATE INDEX IF NOT EXISTS idx_tenants_activated_billing_id
  ON public.tenants(activated_billing_id)
  WHERE activated_billing_id IS NOT NULL;

-- 5) tenants.status: incluir payment_pending (aguardando pagamento)
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'tenants' AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%status%'
  LIMIT 1;
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS %I', conname);
  END IF;
END $$;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('trial', 'payment_pending', 'active', 'suspended'));

COMMENT ON COLUMN public.tenants.status IS 'trial | payment_pending (aguardando pagamento) | active | suspended';
