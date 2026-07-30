-- Sprint 3 — fim natural de ciclos (Finalizada) + motivo de encerramento
-- status completed = contrato cumpriu max_cycles (não cancelamento do operador)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_status_check'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_status_check;
  END IF;
END $$;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'paused', 'completed'));

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS ended_reason TEXT NULL;

COMMENT ON COLUMN public.subscriptions.ended_reason IS
  'Motivo de término: cycles_exhausted | subscription_cancelled_* | etc.';
