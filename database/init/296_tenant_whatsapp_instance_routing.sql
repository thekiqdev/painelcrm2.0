-- WR1: roteamento de instância WhatsApp por finalidade (invoice agora; module na WR2)

CREATE TABLE IF NOT EXISTS public.tenant_whatsapp_instance_routing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL
    CHECK (purpose IN ('invoice', 'module')),
  module_key TEXT NULL,
  chat_instance_id UUID NOT NULL REFERENCES public.chat_instances(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_whatsapp_instance_routing_purpose_module_ck CHECK (
    (purpose = 'invoice' AND module_key IS NULL)
    OR (purpose = 'module' AND module_key IS NOT NULL AND length(trim(module_key)) > 0)
  )
);

COMMENT ON TABLE public.tenant_whatsapp_instance_routing IS
  'WR: qual chat_instance o tenant usa para invoice (faturas) ou module (notificações por módulo).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_whatsapp_routing_invoice
  ON public.tenant_whatsapp_instance_routing (tenant_id)
  WHERE purpose = 'invoice';

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_whatsapp_routing_module
  ON public.tenant_whatsapp_instance_routing (tenant_id, module_key)
  WHERE purpose = 'module';

CREATE INDEX IF NOT EXISTS idx_tenant_whatsapp_routing_instance
  ON public.tenant_whatsapp_instance_routing (chat_instance_id);

CREATE INDEX IF NOT EXISTS idx_tenant_whatsapp_routing_tenant
  ON public.tenant_whatsapp_instance_routing (tenant_id);
