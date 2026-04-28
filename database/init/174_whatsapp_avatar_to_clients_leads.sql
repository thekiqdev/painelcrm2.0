-- Persistência durável de avatar WhatsApp no CRM (cliente/lead).
-- Regra de escrita no backend: só atualiza quando há nova URL válida; nunca limpa por vazio.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS whatsapp_avatar_url TEXT;

COMMENT ON COLUMN public.clients.whatsapp_avatar_url IS
  'Avatar WhatsApp persistido para o cliente; fallback visual no Chat/CRM.';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS whatsapp_avatar_url TEXT;

COMMENT ON COLUMN public.leads.whatsapp_avatar_url IS
  'Avatar WhatsApp persistido para o lead; fallback visual no Chat/CRM.';

