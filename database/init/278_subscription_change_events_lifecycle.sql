-- Sprint S2.4: eventos de ciclo de vida (pause, resume, reactivate) em subscription_change_events.

ALTER TABLE public.subscription_change_events
  ADD COLUMN IF NOT EXISTS change_type TEXT,
  ADD COLUMN IF NOT EXISTS next_billing_date DATE;

ALTER TABLE public.subscription_change_events
  ALTER COLUMN effective_at DROP NOT NULL,
  ALTER COLUMN amount_cents DROP NOT NULL,
  ALTER COLUMN billing_interval DROP NOT NULL,
  ALTER COLUMN description DROP NOT NULL;

ALTER TABLE public.subscription_change_events
  DROP CONSTRAINT IF EXISTS subscription_change_events_amount_cents_check;

ALTER TABLE public.subscription_change_events
  ADD CONSTRAINT subscription_change_events_amount_cents_check
  CHECK (amount_cents IS NULL OR amount_cents > 0);

COMMENT ON COLUMN public.subscription_change_events.change_type IS
  'Tipo: upgrade, downgrade, interval_change, description_change, contract_update, pause, resume, reactivate';
