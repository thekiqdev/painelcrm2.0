-- WhatsApp do cliente (opcional) — matching no portal público de tickets
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS whatsapp TEXT;

COMMENT ON COLUMN public.clients.whatsapp IS
  'Número WhatsApp do cliente; usado em conjunto com phone no matching do portal público.';
