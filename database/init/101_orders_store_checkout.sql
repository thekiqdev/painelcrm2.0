-- MVP loja: vínculo pedido ↔ fatura (customer_invoices) e idempotência mínima do checkout público.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_invoice_id UUID NULL REFERENCES public.customer_invoices(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS store_checkout_idempotency_key TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_store_checkout_idempotency_key
  ON public.orders (store_checkout_idempotency_key)
  WHERE store_checkout_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_customer_invoice_id
  ON public.orders (customer_invoice_id)
  WHERE customer_invoice_id IS NOT NULL;

COMMENT ON COLUMN public.orders.customer_invoice_id IS 'Fatura CRM (customer_invoices) gerada no checkout público da loja.';
COMMENT ON COLUMN public.orders.store_checkout_idempotency_key IS 'Chave idempotência (ex.: header Idempotency-Key) para POST /api/store-checkout/create.';
