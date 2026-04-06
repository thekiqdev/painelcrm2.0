-- Idempotência para POST público pay-with-card (sem dados sensíveis; só resposta de negócio cacheada).
CREATE TABLE IF NOT EXISTS public_pay_card_idempotency (
  payment_token uuid NOT NULL,
  idempotency_key text NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (payment_token, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_public_pay_card_idempotency_created_at ON public_pay_card_idempotency (created_at);
