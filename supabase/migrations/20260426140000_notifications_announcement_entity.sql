-- Igual a database/init/156_notifications_announcement_entity.sql
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS href TEXT;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS entity_type TEXT;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS entity_id UUID;

ALTER TABLE public.notifications
  ALTER COLUMN title TYPE TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_entity_lookup
  ON public.notifications (user_id, entity_type, entity_id)
  WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id
  ON public.notifications (tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_announcement_entity
  ON public.notifications (user_id, entity_id)
  WHERE entity_type = 'announcement' AND entity_id IS NOT NULL AND type = 'announcement';

COMMENT ON COLUMN public.notifications.href IS 'Caminho na app (ex.: /updates/<uuid>) para navegação';
COMMENT ON COLUMN public.notifications.entity_type IS 'Tipo de entidade relacionada (ex.: announcement)';
COMMENT ON COLUMN public.notifications.entity_id IS 'ID da entidade (ex.: announcements.id)';
COMMENT ON COLUMN public.notifications.tenant_id IS 'Tenant do destinatário (quando aplicável)';
