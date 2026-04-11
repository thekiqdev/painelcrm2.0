-- Etapa 5 / correção listagem: RLS em chat não pode depender só de users.tenant_id = app_current_tenant_id(),
-- senão SELECT devolve 0 linhas para conversas cujo dono tem tenant_id NULL (legado) ou desalinhado.
-- Solução: SELECT também permite user_id = app.actor_user_id (SET LOCAL no backend por request).
-- INSERT mantém o mesmo WITH CHECK que antes (sem actor), para não alterar webhooks/sync sem contexto de tenant.

CREATE OR REPLACE FUNCTION public.app_actor_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(trim(both from current_setting('app.actor_user_id', true)), '')::uuid;
$$;

COMMENT ON FUNCTION public.app_actor_user_id() IS 'UUID do utilizador autenticado (SET LOCAL app.actor_user_id no backend).';

-- chat_conversations: substituir FOR ALL por políticas por comando
DROP POLICY IF EXISTS chat_conversations_tenant_policy ON public.chat_conversations;

CREATE POLICY chat_conversations_select_policy ON public.chat_conversations FOR SELECT
  USING (
    public.app_can_bypass_rls()
    OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    OR user_id = public.app_actor_user_id()
  );

CREATE POLICY chat_conversations_insert_policy ON public.chat_conversations FOR INSERT
  WITH CHECK (
    public.app_can_bypass_rls()
    OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
  );

CREATE POLICY chat_conversations_update_policy ON public.chat_conversations FOR UPDATE
  USING (
    public.app_can_bypass_rls()
    OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    OR user_id = public.app_actor_user_id()
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    OR user_id = public.app_actor_user_id()
  );

CREATE POLICY chat_conversations_delete_policy ON public.chat_conversations FOR DELETE
  USING (
    public.app_can_bypass_rls()
    OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    OR user_id = public.app_actor_user_id()
  );

-- chat_instances
DROP POLICY IF EXISTS chat_instances_tenant_policy ON public.chat_instances;

CREATE POLICY chat_instances_select_policy ON public.chat_instances FOR SELECT
  USING (
    public.app_can_bypass_rls()
    OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    OR user_id = public.app_actor_user_id()
  );

CREATE POLICY chat_instances_insert_policy ON public.chat_instances FOR INSERT
  WITH CHECK (
    public.app_can_bypass_rls()
    OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
  );

CREATE POLICY chat_instances_update_policy ON public.chat_instances FOR UPDATE
  USING (
    public.app_can_bypass_rls()
    OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    OR user_id = public.app_actor_user_id()
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    OR user_id = public.app_actor_user_id()
  );

CREATE POLICY chat_instances_delete_policy ON public.chat_instances FOR DELETE
  USING (
    public.app_can_bypass_rls()
    OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    OR user_id = public.app_actor_user_id()
  );

-- chat_messages: alinhar visibilidade ao SELECT da conversa-mãe
DROP POLICY IF EXISTS chat_messages_tenant_policy ON public.chat_messages;

CREATE POLICY chat_messages_select_policy ON public.chat_messages FOR SELECT
  USING (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.chat_conversations cc
      WHERE cc.id = chat_messages.conversation_id
        AND (
          cc.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
          OR cc.user_id = public.app_actor_user_id()
        )
    )
  );

CREATE POLICY chat_messages_insert_policy ON public.chat_messages FOR INSERT
  WITH CHECK (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.chat_conversations cc
      WHERE cc.id = chat_messages.conversation_id
        AND cc.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    )
  );

CREATE POLICY chat_messages_update_policy ON public.chat_messages FOR UPDATE
  USING (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.chat_conversations cc
      WHERE cc.id = chat_messages.conversation_id
        AND (
          cc.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
          OR cc.user_id = public.app_actor_user_id()
        )
    )
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.chat_conversations cc
      WHERE cc.id = chat_messages.conversation_id
        AND (
          cc.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
          OR cc.user_id = public.app_actor_user_id()
        )
    )
  );

CREATE POLICY chat_messages_delete_policy ON public.chat_messages FOR DELETE
  USING (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.chat_conversations cc
      WHERE cc.id = chat_messages.conversation_id
        AND (
          cc.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
          OR cc.user_id = public.app_actor_user_id()
        )
    )
  );
