-- Billing 2.0 Sprint 10 — Pix Automático (autorização BACEN via gateway).
-- Inerte enquanto billing2.pix_automatic = OFF. Sem migração silenciosa de base.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pix_automatic_authorization_id TEXT,
  ADD COLUMN IF NOT EXISTS pix_automatic_auth_status TEXT,
  ADD COLUMN IF NOT EXISTS pix_automatic_auth_gateway TEXT,
  ADD COLUMN IF NOT EXISTS pix_automatic_authorized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pix_automatic_cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pix_automatic_contract_id TEXT,
  ADD COLUMN IF NOT EXISTS pix_automatic_qr_payload TEXT,
  ADD COLUMN IF NOT EXISTS pix_automatic_qr_image TEXT,
  ADD COLUMN IF NOT EXISTS pix_automatic_conciliation_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_pix_automatic_auth_status_check'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_pix_automatic_auth_status_check
      CHECK (
        pix_automatic_auth_status IS NULL
        OR pix_automatic_auth_status IN (
          'pending',
          'active',
          'cancelled',
          'expired',
          'refused',
          'cleared'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.subscriptions.pix_automatic_authorization_id IS
  'Billing 2.0 S10 — ID da autorização Pix Automático no gateway (Asaas).';
COMMENT ON COLUMN public.subscriptions.pix_automatic_auth_status IS
  'pending | active | cancelled | expired | refused | cleared';
COMMENT ON COLUMN public.subscriptions.pix_automatic_qr_payload IS
  'QR composto (copia-e-cola) para consentimento + 1º pagamento; limpar após ACTIVE.';

CREATE INDEX IF NOT EXISTS idx_subscriptions_saas_pix_auto_auth
  ON public.subscriptions (tenant_id)
  WHERE type = 'saas'
    AND pix_automatic_authorization_id IS NOT NULL
    AND pix_automatic_auth_status = 'active';

CREATE INDEX IF NOT EXISTS idx_subscriptions_pix_auto_auth_id
  ON public.subscriptions (pix_automatic_authorization_id)
  WHERE pix_automatic_authorization_id IS NOT NULL;
