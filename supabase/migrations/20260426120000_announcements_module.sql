-- Módulo Anúncios / Atualizações (alinhado a database/init/154_announcements_module.sql)
-- Cria announcement_send_recipients e tabelas relacionadas (worker em packages/backend).

CREATE TABLE IF NOT EXISTS public.announcement_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.announcement_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.announcement_groups(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_group_members_tenant ON public.announcement_group_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_announcement_group_members_group ON public.announcement_group_members(group_id);

CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('whatsapp_only', 'whatsapp_and_updates_page')),
  whatsapp_message TEXT NOT NULL DEFAULT '',
  page_summary TEXT,
  page_content TEXT,
  category TEXT CHECK (
    category IS NULL OR category IN ('novidade', 'melhoria', 'correcao', 'aviso')
  ),
  banner_url TEXT,
  featured BOOLEAN NOT NULL DEFAULT false,
  version TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'unpublished')),
  published_at TIMESTAMPTZ,
  visibility_group_id UUID REFERENCES public.announcement_groups(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_status_type ON public.announcements(status, type);
CREATE INDEX IF NOT EXISTS idx_announcements_published_at ON public.announcements(published_at DESC);

CREATE TABLE IF NOT EXISTS public.announcement_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.announcement_groups(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')
  ),
  delay_seconds INTEGER NOT NULL DEFAULT 5 CHECK (delay_seconds >= 0 AND delay_seconds <= 3600),
  scheduled_start_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcement_sends_announcement ON public.announcement_sends(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_sends_status ON public.announcement_sends(status);

CREATE TABLE IF NOT EXISTS public.announcement_send_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id UUID NOT NULL REFERENCES public.announcement_sends(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (send_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_send_recipients_pending
  ON public.announcement_send_recipients(status, scheduled_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

DROP TRIGGER IF EXISTS update_announcement_groups_updated_at ON public.announcement_groups;
CREATE TRIGGER update_announcement_groups_updated_at
  BEFORE UPDATE ON public.announcement_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_announcements_updated_at ON public.announcements;
CREATE TRIGGER update_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_announcement_send_recipients_updated_at ON public.announcement_send_recipients;
CREATE TRIGGER update_announcement_send_recipients_updated_at
  BEFORE UPDATE ON public.announcement_send_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.announcements IS 'Comunicados da plataforma (Super Admin): WhatsApp e/ou página de atualizações';
COMMENT ON COLUMN public.announcements.visibility_group_id IS 'Se preenchido, só estes tenants veem a entrada na página Atualizações; NULL = todos';
