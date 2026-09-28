-- Mirror: database/init/217_chat_kanban_tags.sql
CREATE TABLE IF NOT EXISTS public.chat_kanban_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_kanban_tags_label_trim CHECK (length(trim(label)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_chat_kanban_tags_tenant_label_lower
  ON public.chat_kanban_tags (tenant_id, lower(trim(label)));

CREATE INDEX IF NOT EXISTS idx_chat_kanban_tags_tenant ON public.chat_kanban_tags (tenant_id);

ALTER TABLE public.chat_kanban_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_kanban_tags_select_policy ON public.chat_kanban_tags;
DROP POLICY IF EXISTS chat_kanban_tags_insert_policy ON public.chat_kanban_tags;
DROP POLICY IF EXISTS chat_kanban_tags_update_policy ON public.chat_kanban_tags;
DROP POLICY IF EXISTS chat_kanban_tags_delete_policy ON public.chat_kanban_tags;

CREATE POLICY chat_kanban_tags_select_policy ON public.chat_kanban_tags
  FOR SELECT
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id));

CREATE POLICY chat_kanban_tags_insert_policy ON public.chat_kanban_tags
  FOR INSERT
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

CREATE POLICY chat_kanban_tags_update_policy ON public.chat_kanban_tags
  FOR UPDATE
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

CREATE POLICY chat_kanban_tags_delete_policy ON public.chat_kanban_tags
  FOR DELETE
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id));
