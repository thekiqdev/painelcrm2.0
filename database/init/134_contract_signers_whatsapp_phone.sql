-- WhatsApp opcional por signatário (notificações por convite individual).
ALTER TABLE public.contract_signers
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT NULL;

COMMENT ON COLUMN public.contract_signers.whatsapp_phone IS
  'WhatsApp para envio do link de assinatura; armazenar só dígitos (DDD + número BR; opcional prefixo 55).';
