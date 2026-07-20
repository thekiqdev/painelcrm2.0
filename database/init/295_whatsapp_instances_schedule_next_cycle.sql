-- WI4: downgrade agendado de conexões WhatsApp no próximo ciclo (espelho seats).

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS max_whatsapp_instances_scheduled_next_cycle INTEGER;

COMMENT ON COLUMN public.tenants.max_whatsapp_instances_scheduled_next_cycle IS
  'Na próxima renovação SaaS, aplicar este número como max_whatsapp_instances_override (downgrade agendado; sem estorno).';
