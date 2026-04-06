-- Notas administrativas e tags por tenant (Super Admin)
CREATE TABLE IF NOT EXISTS public.tenant_admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_admin_notes_tenant_id ON public.tenant_admin_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_admin_notes_created_at ON public.tenant_admin_notes(created_at DESC);

CREATE TRIGGER update_tenant_admin_notes_updated_at
  BEFORE UPDATE ON public.tenant_admin_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.tenant_admin_notes IS 'Notas internas do Super Admin por empresa';

CREATE TABLE IF NOT EXISTS public.tenant_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_tenant_tags_tenant_id ON public.tenant_tags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_tags_tag ON public.tenant_tags(tag);

COMMENT ON TABLE public.tenant_tags IS 'Tags por empresa (Super Admin)';
