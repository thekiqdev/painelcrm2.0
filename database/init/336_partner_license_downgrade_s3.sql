-- M5-W License Sprint 3 — downgrade de seats avulsas (ledger reason)

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.partner_license_ledger'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%reason%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.partner_license_ledger DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.partner_license_ledger
  ADD CONSTRAINT partner_license_ledger_reason_check
  CHECK (reason IN (
    'grant',
    'plan_activate',
    'plan_renewal',
    'topup_purchase',
    'topup_downgrade',
    'clawback',
    'admin_adjust',
    'legacy_manual'
  ));

COMMENT ON CONSTRAINT partner_license_ledger_reason_check ON public.partner_license_ledger IS
  'License S3: topup_downgrade reduz extras; sem estorno do ciclo corrente.';
