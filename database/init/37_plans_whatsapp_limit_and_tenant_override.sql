-- Limite de instâncias WhatsApp no plano e override por tenant
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_whatsapp_instances INTEGER;

COMMENT ON COLUMN public.plans.max_whatsapp_instances IS 'Limite de instâncias WhatsApp (chat_instances) do plano; NULL = ilimitado';

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS max_whatsapp_instances_override INTEGER;

COMMENT ON COLUMN public.tenants.max_whatsapp_instances_override IS 'Limite de instâncias WhatsApp para este tenant; NULL = usar limite do plano';
