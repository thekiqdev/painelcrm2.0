-- Snapshot de preço contratado (Etapa 1 — só estrutura + backfill). Ver database/init/221_subscriptions_pricing_snapshot.sql.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS contracted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contracted_billing_interval TEXT,
  ADD COLUMN IF NOT EXISTS contracted_plan_price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS contracted_price_per_user_cents INTEGER,
  ADD COLUMN IF NOT EXISTS contract_currency TEXT DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS pricing_snapshot_source TEXT;

COMMENT ON COLUMN public.subscriptions.contracted_at IS 'Momento em que o snapshot contratual foi definido (backfill ou futura escrita).';
COMMENT ON COLUMN public.subscriptions.contracted_billing_interval IS 'Intervalo de cobrança vigente no contrato (mensal/anual/etc.).';
COMMENT ON COLUMN public.subscriptions.contracted_plan_price_cents IS 'Preço total do ciclo para plano standard; em custom também pode espelhar total da última fatura (auditoria).';
COMMENT ON COLUMN public.subscriptions.contracted_price_per_user_cents IS 'Unitário por usuário no plano custom.';
COMMENT ON COLUMN public.subscriptions.contract_currency IS 'Moeda do snapshot (default BRL).';
COMMENT ON COLUMN public.subscriptions.pricing_snapshot_source IS 'Origem do backfill ou futura gravação do snapshot.';

UPDATE public.subscriptions s
SET
  contracted_at = COALESCE(b.paid_at, b.updated_at),
  contracted_billing_interval = b.billing_interval,
  contracted_plan_price_cents = b.amount_cents,
  contracted_price_per_user_cents = CASE
    WHEN p.plan_type IS DISTINCT FROM 'custom' THEN NULL
    WHEN COALESCE(NULLIF(b.users_count, 0), NULLIF(s.users_count, 0), 0) > 0 THEN
      ROUND(b.amount_cents::numeric / COALESCE(NULLIF(b.users_count, 0), NULLIF(s.users_count, 0))::numeric)::integer
    ELSE (
      SELECT pip.price_per_user_cents
      FROM public.plan_interval_prices pip
      WHERE pip.plan_id = s.plan_id
        AND pip.billing_interval::text = b.billing_interval::text
      LIMIT 1
    )
  END,
  contract_currency = COALESCE(s.contract_currency, 'BRL'),
  pricing_snapshot_source = CASE
    WHEN p.plan_type = 'custom'
      AND COALESCE(NULLIF(b.users_count, 0), NULLIF(s.users_count, 0), 0) <= 0
      AND EXISTS (
        SELECT 1 FROM public.plan_interval_prices pip
        WHERE pip.plan_id = s.plan_id AND pip.billing_interval::text = b.billing_interval::text
      )
      THEN 'backfill_current_plan_interval_price'
    ELSE 'backfill_last_paid_billing'
  END
FROM public.plans p,
(
  SELECT DISTINCT ON (tb.subscription_id)
    tb.subscription_id AS sid,
    tb.amount_cents,
    tb.billing_interval,
    tb.users_count,
    tb.paid_at,
    tb.updated_at
  FROM public.tenant_billing tb
  WHERE tb.status = 'paid'
    AND COALESCE(tb.billing_reason, 'plan_purchase') IN ('plan_purchase', 'plan_upgrade', 'plan_renewal')
    AND tb.subscription_id IS NOT NULL
  ORDER BY tb.subscription_id, COALESCE(tb.paid_at, tb.updated_at) DESC NULLS LAST
) b
WHERE s.type = 'saas'
  AND s.plan_id = p.id
  AND s.id = b.sid;

UPDATE public.subscriptions s
SET
  contracted_at = COALESCE(b.paid_at, b.updated_at),
  contracted_billing_interval = b.billing_interval,
  contracted_plan_price_cents = b.amount_cents,
  contracted_price_per_user_cents = CASE
    WHEN p.plan_type IS DISTINCT FROM 'custom' THEN NULL
    WHEN COALESCE(NULLIF(b.users_count, 0), NULLIF(s.users_count, 0), 0) > 0 THEN
      ROUND(b.amount_cents::numeric / COALESCE(NULLIF(b.users_count, 0), NULLIF(s.users_count, 0))::numeric)::integer
    ELSE (
      SELECT pip.price_per_user_cents
      FROM public.plan_interval_prices pip
      WHERE pip.plan_id = s.plan_id
        AND pip.billing_interval::text = b.billing_interval::text
      LIMIT 1
    )
  END,
  contract_currency = COALESCE(s.contract_currency, 'BRL'),
  pricing_snapshot_source = CASE
    WHEN p.plan_type = 'custom'
      AND COALESCE(NULLIF(b.users_count, 0), NULLIF(s.users_count, 0), 0) <= 0
      AND EXISTS (
        SELECT 1 FROM public.plan_interval_prices pip
        WHERE pip.plan_id = s.plan_id AND pip.billing_interval::text = b.billing_interval::text
      )
      THEN 'backfill_current_plan_interval_price'
    ELSE 'backfill_last_paid_billing'
  END
FROM public.plans p,
(
  SELECT DISTINCT ON (tb.tenant_id)
    tb.tenant_id AS tid,
    tb.amount_cents,
    tb.billing_interval,
    tb.users_count,
    tb.paid_at,
    tb.updated_at
  FROM public.tenant_billing tb
  WHERE tb.status = 'paid'
    AND COALESCE(tb.billing_reason, 'plan_purchase') IN ('plan_purchase', 'plan_upgrade', 'plan_renewal')
  ORDER BY tb.tenant_id, COALESCE(tb.paid_at, tb.updated_at) DESC NULLS LAST
) b
WHERE s.type = 'saas'
  AND s.contracted_at IS NULL
  AND s.plan_id = p.id
  AND s.tenant_id = b.tid;

UPDATE public.subscriptions s
SET
  contracted_at = COALESCE(s.updated_at, s.created_at),
  contracted_billing_interval = s.billing_interval,
  contracted_plan_price_cents = s.amount_cents,
  contracted_price_per_user_cents = CASE
    WHEN p.plan_type IS DISTINCT FROM 'custom' THEN NULL
    WHEN COALESCE(NULLIF(s.users_count, 0), 0) > 0 THEN
      ROUND(s.amount_cents::numeric / NULLIF(s.users_count, 0)::numeric)::integer
    ELSE (
      SELECT pip.price_per_user_cents
      FROM public.plan_interval_prices pip
      WHERE pip.plan_id = s.plan_id AND pip.billing_interval::text = s.billing_interval::text
      LIMIT 1
    )
  END,
  contract_currency = COALESCE(s.contract_currency, 'BRL'),
  pricing_snapshot_source = CASE
    WHEN p.plan_type = 'custom'
      AND COALESCE(NULLIF(s.users_count, 0), 0) <= 0
      AND EXISTS (
        SELECT 1 FROM public.plan_interval_prices pip
        WHERE pip.plan_id = s.plan_id AND pip.billing_interval::text = s.billing_interval::text
      )
      THEN 'backfill_current_plan_interval_price'
    ELSE 'backfill_subscription_amount'
  END
FROM public.plans p
WHERE s.type = 'saas'
  AND s.contracted_at IS NULL
  AND s.plan_id = p.id;

UPDATE public.subscriptions s
SET
  contracted_plan_price_cents = p.price_cents,
  contracted_billing_interval = s.billing_interval,
  contracted_price_per_user_cents = NULL,
  contracted_at = NOW(),
  contract_currency = 'BRL',
  pricing_snapshot_source = 'backfill_current_plan'
FROM public.plans p
WHERE s.type = 'saas'
  AND s.contracted_at IS NULL
  AND s.plan_id = p.id
  AND p.plan_type IS DISTINCT FROM 'custom';

UPDATE public.subscriptions s
SET
  contracted_price_per_user_cents = pip.price_per_user_cents,
  contracted_plan_price_cents = pip.price_per_user_cents * GREATEST(COALESCE(s.users_count, 1), 1),
  contracted_billing_interval = s.billing_interval,
  contracted_at = NOW(),
  contract_currency = 'BRL',
  pricing_snapshot_source = 'backfill_current_plan_interval_price'
FROM public.plans p,
     public.plan_interval_prices pip
WHERE s.type = 'saas'
  AND s.contracted_at IS NULL
  AND s.plan_id = p.id
  AND p.plan_type = 'custom'
  AND pip.plan_id = s.plan_id
  AND pip.billing_interval::text = s.billing_interval::text;
