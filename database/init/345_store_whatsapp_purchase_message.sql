-- Mensagem automática de compra via WhatsApp (template com {{product_name}} etc.).

ALTER TABLE public.store_profiles
  ADD COLUMN IF NOT EXISTS store_whatsapp_purchase_message TEXT;

COMMENT ON COLUMN public.store_profiles.store_whatsapp_purchase_message IS
  'Template da mensagem enviada ao clicar em Comprar via WhatsApp. Placeholders: {{product_name}}, {{product_type}}, {{variant}}, {{store_name}}. NULL/vazio = mensagem padrão.';
