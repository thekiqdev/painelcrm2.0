-- Compra via WhatsApp na vitrine (independente do checkout online).
-- Default true: preserva comportamento atual (botão WhatsApp se houver número).

ALTER TABLE public.store_profiles
  ADD COLUMN IF NOT EXISTS store_whatsapp_purchase_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.store_profiles.store_whatsapp_purchase_enabled IS
  'Se true e contact_whatsapp preenchido, vitrine exibe Comprar via WhatsApp (pode coexistir com store_checkout_enabled).';
