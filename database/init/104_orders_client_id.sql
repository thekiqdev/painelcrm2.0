-- MVP checkout loja: vínculo do pedido ao cliente CRM (clients).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS client_id UUID NULL REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_client_id
  ON public.orders (client_id)
  WHERE client_id IS NOT NULL;

COMMENT ON COLUMN public.orders.client_id IS 'Cliente CRM (clients) resolvido no checkout público por telefone.';
