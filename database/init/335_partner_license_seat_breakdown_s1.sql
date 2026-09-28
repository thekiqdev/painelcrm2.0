-- M5-W License Sprint 1 — seats do pacote vs avulsas (base para reajuste recorrente)

ALTER TABLE public.partner_license_pool
  ADD COLUMN IF NOT EXISTS included_seats INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.partner_license_pool
  ADD COLUMN IF NOT EXISTS extra_seats INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.partner_license_pool
  DROP CONSTRAINT IF EXISTS partner_license_pool_included_seats_chk;
ALTER TABLE public.partner_license_pool
  ADD CONSTRAINT partner_license_pool_included_seats_chk
  CHECK (included_seats >= 0);

ALTER TABLE public.partner_license_pool
  DROP CONSTRAINT IF EXISTS partner_license_pool_extra_seats_chk;
ALTER TABLE public.partner_license_pool
  ADD CONSTRAINT partner_license_pool_extra_seats_chk
  CHECK (extra_seats >= 0);

-- Backfill: incluídas = min(pool, seats do plano atacado); resto = extra
UPDATE public.partner_license_pool pl
SET included_seats = LEAST(pl.purchased_seats, COALESCE(w.seats_included, 0)),
    extra_seats = GREATEST(0, pl.purchased_seats - COALESCE(w.seats_included, 0))
FROM public.partner_profiles pp
LEFT JOIN public.partner_wholesale_plans w ON w.id = pp.wholesale_plan_id
WHERE pl.partner_tenant_id = pp.partner_tenant_id;

COMMENT ON COLUMN public.partner_license_pool.included_seats IS
  'Seats do pacote atacado (não reajustam overage).';
COMMENT ON COLUMN public.partner_license_pool.extra_seats IS
  'Seats avulsas (unit_overage). Sprint 2 reajusta recorrência com este saldo.';
