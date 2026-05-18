ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS last_customer_reply_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_last_customer_reply_at
  ON public.tickets (last_customer_reply_at)
  WHERE last_customer_reply_at IS NOT NULL;
