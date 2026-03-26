-- No máximo uma tentativa "aberta reutilizável" por (invoice_id, payment_method).
-- Status abertos: mesmo critério de findReusableInvoicePaymentAttempt; exige gateway_reference_id.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY invoice_id, payment_method
      ORDER BY created_at DESC
    ) AS rn
  FROM customer_invoice_payment_attempts
  WHERE status IN ('pending', 'waiting_payment', 'processing', 'overdue')
    AND gateway_reference_id IS NOT NULL
)
UPDATE customer_invoice_payment_attempts a
SET
  status = 'cancelled',
  is_active = false,
  deactivated_at = COALESCE(a.deactivated_at, now()),
  idempotency_key = NULL,
  gateway_metadata = COALESCE(a.gateway_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'superseded', true,
      'superseded_at', to_jsonb(now()::text),
      'superseded_reason', 'migration_84_dedupe_open_attempts_per_method'
    ),
  updated_at = now()
FROM ranked r
WHERE a.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ci_attempts_one_open_reusable_per_invoice_method
  ON public.customer_invoice_payment_attempts (invoice_id, payment_method)
  WHERE status IN ('pending', 'waiting_payment', 'processing', 'overdue')
    AND gateway_reference_id IS NOT NULL;

COMMENT ON INDEX idx_ci_attempts_one_open_reusable_per_invoice_method IS
  'Garante no máximo uma tentativa reutilizável (aberta) por fatura e método de pagamento.';
