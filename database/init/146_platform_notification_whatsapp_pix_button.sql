-- Opção por template (sistema + override): enviar botão PIX copia e cola no WhatsApp após o texto (Uazapi /send/pix-button).
-- MVP: usado pelo motor da plataforma para platform.billing.charge.created (fatura SaaS).

ALTER TABLE public.platform_notification_template_system
  ADD COLUMN IF NOT EXISTS send_whatsapp_pix_copy_paste_button BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.platform_notification_template_overrides
  ADD COLUMN IF NOT EXISTS send_whatsapp_pix_copy_paste_button BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.platform_notification_template_system.send_whatsapp_pix_copy_paste_button IS
  'WhatsApp: após o texto da notificação, enviar botão PIX copia e cola (código da cobrança) quando existir no gateway_metadata da fatura.';

COMMENT ON COLUMN public.platform_notification_template_overrides.send_whatsapp_pix_copy_paste_button IS
  'Override do envio do botão PIX para o mesmo evento/canal/locale.';
