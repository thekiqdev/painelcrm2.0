-- M5-W Sprint 4 — past_due tracking + legacy partners
-- Plano: PLAN_SPRINTS_M5_W_PARTNER_WHOLESALE.md

ALTER TABLE public.partner_profiles
  ADD COLUMN IF NOT EXISTS wholesale_past_due_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.partner_profiles.wholesale_past_due_at IS
  'M5-W: quando wholesale_status passou a past_due (freeze canal pós-grace).';

-- Plano técnico “legado” (envelope opcional; Partners antigos sem assinatura Platform)
INSERT INTO public.partner_wholesale_plans (
  name, slug, description, status, seats_included, price_cents, billing_interval,
  envelope_plan_id, unit_overage_cents, sort_order, metadata
)
SELECT
  'Legado (manual)',
  'legado-manual',
  'Partners com seats alocados antes do wholesale cobrado. Sem renovação automática.',
  'active',
  0,
  0,
  'monthly',
  NULL,
  NULL,
  999,
  '{"legacy": true}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.partner_wholesale_plans WHERE slug = 'legado-manual'
);

-- Marca Partners com pool > 0 sem plano atacado como legado (não altera purchased_seats)
WITH legado AS (
  SELECT id FROM public.partner_wholesale_plans WHERE slug = 'legado-manual' LIMIT 1
),
targets AS (
  SELECT pp.partner_tenant_id, COALESCE(pl.purchased_seats, 0) AS purchased_seats
  FROM public.partner_profiles pp
  LEFT JOIN public.partner_license_pool pl ON pl.partner_tenant_id = pp.partner_tenant_id
  WHERE pp.wholesale_status = 'none'
    AND pp.wholesale_plan_id IS NULL
    AND COALESCE(pl.purchased_seats, 0) > 0
)
UPDATE public.partner_profiles pp
SET wholesale_plan_id = (SELECT id FROM legado),
    wholesale_status = 'active',
    program_config_json = COALESCE(pp.program_config_json, '{}'::jsonb)
      || jsonb_build_object('grant_source', 'legacy_manual'),
    updated_at = now()
FROM targets t
WHERE pp.partner_tenant_id = t.partner_tenant_id;

-- Auditoria ledger (delta 0) — seats já existiam
INSERT INTO public.partner_license_ledger (
  partner_tenant_id, delta_seats, balance_after, reason,
  wholesale_plan_id, note, metadata
)
SELECT
  t.partner_tenant_id,
  0,
  t.purchased_seats,
  'legacy_manual',
  (SELECT id FROM public.partner_wholesale_plans WHERE slug = 'legado-manual' LIMIT 1),
  'Migração M5-W S4 — seats manuais pré-wholesale',
  jsonb_build_object('grant_source', 'legacy_manual', 'migration', '332_partner_wholesale_s4')
FROM (
  SELECT pp.partner_tenant_id, COALESCE(pl.purchased_seats, 0) AS purchased_seats
  FROM public.partner_profiles pp
  LEFT JOIN public.partner_license_pool pl ON pl.partner_tenant_id = pp.partner_tenant_id
  WHERE pp.wholesale_plan_id = (SELECT id FROM public.partner_wholesale_plans WHERE slug = 'legado-manual' LIMIT 1)
    AND COALESCE(pp.program_config_json->>'grant_source', '') = 'legacy_manual'
) t
WHERE NOT EXISTS (
  SELECT 1 FROM public.partner_license_ledger l
  WHERE l.partner_tenant_id = t.partner_tenant_id
    AND l.reason = 'legacy_manual'
);
