-- Billing 2.0 Sprint 9 — token de cartão gateway-safe em subscriptions SaaS.
-- Nunca armazena PAN/CVV. Inerte enquanto billing2.card_auto_renew = OFF (captura auto).
-- Persistência do token após pay-with-card bem-sucedido é aditiva e segura (só token/máscara).

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS card_token TEXT,
  ADD COLUMN IF NOT EXISTS card_brand TEXT,
  ADD COLUMN IF NOT EXISTS card_last4 TEXT,
  ADD COLUMN IF NOT EXISTS card_token_gateway TEXT,
  ADD COLUMN IF NOT EXISTS card_tokenized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS card_token_status TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_card_token_status_check'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_card_token_status_check
      CHECK (
        card_token_status IS NULL
        OR card_token_status IN ('active', 'invalid', 'replaced', 'cleared')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.subscriptions.card_token IS
  'Billing 2.0 S9 — creditCardToken do gateway (Asaas). Sem PAN/CVV.';
COMMENT ON COLUMN public.subscriptions.card_brand IS
  'Bandeira mascarada (VISA, MASTERCARD, …) para UI.';
COMMENT ON COLUMN public.subscriptions.card_last4 IS
  'Últimos 4 dígitos do cartão (display).';
COMMENT ON COLUMN public.subscriptions.card_token_gateway IS
  'Gateway que emitiu o token (ex.: asaas).';
COMMENT ON COLUMN public.subscriptions.card_token_status IS
  'active | invalid | replaced | cleared';

CREATE INDEX IF NOT EXISTS idx_subscriptions_saas_card_token_active
  ON public.subscriptions (tenant_id)
  WHERE type = 'saas'
    AND card_token IS NOT NULL
    AND card_token_status = 'active';
