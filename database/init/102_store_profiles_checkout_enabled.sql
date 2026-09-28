-- Checkout público da loja: opt-in por loja (default = fluxo WhatsApp/orçamento).

ALTER TABLE public.store_profiles
  ADD COLUMN IF NOT EXISTS store_checkout_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.store_profiles.store_checkout_enabled IS 'Se true (e flags globais), vitrine permite Comprar com checkout online; se false, apenas WhatsApp/orçamento.';
