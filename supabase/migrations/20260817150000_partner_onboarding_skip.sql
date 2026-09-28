-- M5 — Partner não usa onboarding SaaS de cliente; backfill + default em criação via app.

UPDATE public.tenants
SET onboarding_completed = true
WHERE account_type = 'partner'
  AND onboarding_completed IS DISTINCT FROM true;
