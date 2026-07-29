-- CRM8 — permite status `requested` (intenção Pix Auto sem auth Asaas / sem fatura aberta).
-- Alarga o CHECK criado em 301_billing2_pix_automatic_authorization.sql.

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_pix_automatic_auth_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_pix_automatic_auth_status_check
  CHECK (
    pix_automatic_auth_status IS NULL
    OR pix_automatic_auth_status IN (
      'requested',
      'pending',
      'active',
      'cancelled',
      'expired',
      'refused',
      'cleared'
    )
  );

COMMENT ON COLUMN public.subscriptions.pix_automatic_auth_status IS
  'requested | pending | active | cancelled | expired | refused | cleared';
