-- OS-S5 — Vínculo fatura ↔ ordem de serviço (espelha proposal_id / uq).

ALTER TABLE public.customer_invoices
  ADD COLUMN IF NOT EXISTS service_order_id UUID NULL
  REFERENCES public.service_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_invoices_service_order_id
  ON public.customer_invoices(service_order_id)
  WHERE service_order_id IS NOT NULL;

-- Uma fatura principal por OS quando service_order_id está preenchido
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_invoices_service_order_id
  ON public.customer_invoices(service_order_id)
  WHERE service_order_id IS NOT NULL;

COMMENT ON COLUMN public.customer_invoices.service_order_id IS
  'Ordem de serviço de origem (conversão OS-S5).';

-- Espelha FK convertida na OS (coluna já existia em 360; reforça FK se ainda não houver)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_orders_converted_invoice_id_fkey'
  ) THEN
    ALTER TABLE public.service_orders
      ADD CONSTRAINT service_orders_converted_invoice_id_fkey
      FOREIGN KEY (converted_invoice_id)
      REFERENCES public.customer_invoices(id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_orders_converted_invoice
  ON public.service_orders(converted_invoice_id)
  WHERE converted_invoice_id IS NOT NULL;
