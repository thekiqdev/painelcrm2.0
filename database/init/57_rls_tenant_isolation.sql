-- Etapa 5: Row Level Security (RLS) como segunda barreira de isolamento multi-tenant.
-- Requer que a aplicação execute SET LOCAL app.current_tenant_id = '<uuid>' (e opcionalmente
-- app.bypass_rls = '1' para superadmin) no início de cada request que acessa dados tenant-scoped.
--
-- Tabelas globais (sem RLS): users, tenants, plans, plan_features, system_features,
-- superadmin_settings, super_admin_audit_log, sessions, profiles (auth), etc.

-- Função auxiliar: retorna true se a conexão pode ignorar RLS (superadmin).
CREATE OR REPLACE FUNCTION public.app_can_bypass_rls()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.bypass_rls', true) = '1';
$$;

-- Função auxiliar: retorna o tenant_id da sessão atual (NULL se não definido).
CREATE OR REPLACE FUNCTION public.app_current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

-- Predicado reutilizável: linha visível para o tenant atual ou bypass.
CREATE OR REPLACE FUNCTION public.app_tenant_visible(row_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.app_can_bypass_rls()
     OR (public.app_current_tenant_id() IS NOT NULL AND row_tenant_id = public.app_current_tenant_id());
$$;

-- ---------------------------------------------------------------------------
-- Tabelas com coluna tenant_id (política direta)
-- ---------------------------------------------------------------------------

-- teams
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teams_tenant_policy ON public.teams;
CREATE POLICY teams_tenant_policy ON public.teams
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- tenant_plan
ALTER TABLE public.tenant_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_plan_tenant_policy ON public.tenant_plan;
CREATE POLICY tenant_plan_tenant_policy ON public.tenant_plan
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- tenant_billing
ALTER TABLE public.tenant_billing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_billing_tenant_policy ON public.tenant_billing;
CREATE POLICY tenant_billing_tenant_policy ON public.tenant_billing
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- tenant_feature_overrides
ALTER TABLE public.tenant_feature_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_feature_overrides_tenant_policy ON public.tenant_feature_overrides;
CREATE POLICY tenant_feature_overrides_tenant_policy ON public.tenant_feature_overrides
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- tenant_admin_notes
ALTER TABLE public.tenant_admin_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_admin_notes_tenant_policy ON public.tenant_admin_notes;
CREATE POLICY tenant_admin_notes_tenant_policy ON public.tenant_admin_notes
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- tenant_tags
ALTER TABLE public.tenant_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_tags_tenant_policy ON public.tenant_tags;
CREATE POLICY tenant_tags_tenant_policy ON public.tenant_tags
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- project_templates (tenant_id nullable: NULL = template sistema, visível para todos os tenants)
ALTER TABLE public.project_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_templates_tenant_policy ON public.project_templates;
CREATE POLICY project_templates_tenant_policy ON public.project_templates
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR (public.app_current_tenant_id() IS NOT NULL AND (tenant_id IS NULL OR tenant_id = public.app_current_tenant_id()))
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR (public.app_current_tenant_id() IS NOT NULL AND (tenant_id IS NULL OR tenant_id = public.app_current_tenant_id()))
  );

-- ---------------------------------------------------------------------------
-- team_members: escopo via team -> tenant
-- ---------------------------------------------------------------------------
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_members_tenant_policy ON public.team_members;
CREATE POLICY team_members_tenant_policy ON public.team_members
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_members.team_id
        AND public.app_tenant_visible(t.tenant_id)
    )
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_members.team_id
        AND t.tenant_id = public.app_current_tenant_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Tabelas com user_id: visível se user pertence ao tenant atual
-- (users não tem RLS para que a subquery funcione)
-- ---------------------------------------------------------------------------

-- user_profiles (owner_id)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_profiles_tenant_policy ON public.user_profiles;
CREATE POLICY user_profiles_tenant_policy ON public.user_profiles
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR owner_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR owner_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
  );

-- Tabelas com user_id (política padrão: user no tenant atual)
-- clients, client_groups, client_tasks, leads, lead_statuses, lead_tasks
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clients_tenant_policy ON public.clients;
CREATE POLICY clients_tenant_policy ON public.clients FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.client_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_groups_tenant_policy ON public.client_groups;
CREATE POLICY client_groups_tenant_policy ON public.client_groups FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_tasks_tenant_policy ON public.client_tasks;
CREATE POLICY client_tasks_tenant_policy ON public.client_tasks FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leads_tenant_policy ON public.leads;
CREATE POLICY leads_tenant_policy ON public.leads FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.lead_statuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_statuses_tenant_policy ON public.lead_statuses;
CREATE POLICY lead_statuses_tenant_policy ON public.lead_statuses FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_tasks_tenant_policy ON public.lead_tasks;
CREATE POLICY lead_tasks_tenant_policy ON public.lead_tasks FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

-- sales_funnels, funnel_stages, products, proposals, contracts, contract_templates
ALTER TABLE public.sales_funnels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_funnels_tenant_policy ON public.sales_funnels;
CREATE POLICY sales_funnels_tenant_policy ON public.sales_funnels FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.funnel_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS funnel_stages_tenant_policy ON public.funnel_stages;
CREATE POLICY funnel_stages_tenant_policy ON public.funnel_stages FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_tenant_policy ON public.products;
CREATE POLICY products_tenant_policy ON public.products FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proposals_tenant_policy ON public.proposals;
CREATE POLICY proposals_tenant_policy ON public.proposals FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contracts_tenant_policy ON public.contracts;
CREATE POLICY contracts_tenant_policy ON public.contracts FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_templates_tenant_policy ON public.contract_templates;
CREATE POLICY contract_templates_tenant_policy ON public.contract_templates FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

-- invoices, expenses, tickets, ticket_categories, message_templates
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_tenant_policy ON public.invoices;
CREATE POLICY invoices_tenant_policy ON public.invoices FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expenses_tenant_policy ON public.expenses;
CREATE POLICY expenses_tenant_policy ON public.expenses FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tickets_tenant_policy ON public.tickets;
CREATE POLICY tickets_tenant_policy ON public.tickets FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.ticket_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ticket_categories_tenant_policy ON public.ticket_categories;
CREATE POLICY ticket_categories_tenant_policy ON public.ticket_categories FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_templates_tenant_policy ON public.message_templates;
CREATE POLICY message_templates_tenant_policy ON public.message_templates FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

-- projects, project_lists, project_tasks, project_areas, project_versions, project_area_comments, tasks, notifications
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS projects_tenant_policy ON public.projects;
CREATE POLICY projects_tenant_policy ON public.projects FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.project_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_lists_tenant_policy ON public.project_lists;
CREATE POLICY project_lists_tenant_policy ON public.project_lists FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_tasks_tenant_policy ON public.project_tasks;
CREATE POLICY project_tasks_tenant_policy ON public.project_tasks FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.project_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_areas_tenant_policy ON public.project_areas;
CREATE POLICY project_areas_tenant_policy ON public.project_areas FOR ALL
  USING (public.app_can_bypass_rls() OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_areas.project_id AND p.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())))
  WITH CHECK (public.app_can_bypass_rls() OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_areas.project_id AND p.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())));

ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_versions_tenant_policy ON public.project_versions;
CREATE POLICY project_versions_tenant_policy ON public.project_versions FOR ALL
  USING (public.app_can_bypass_rls() OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_versions.project_id AND p.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())))
  WITH CHECK (public.app_can_bypass_rls() OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_versions.project_id AND p.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())));

ALTER TABLE public.project_area_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_area_comments_tenant_policy ON public.project_area_comments;
CREATE POLICY project_area_comments_tenant_policy ON public.project_area_comments FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tasks_tenant_policy ON public.tasks;
CREATE POLICY tasks_tenant_policy ON public.tasks FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_tenant_policy ON public.notifications;
CREATE POLICY notifications_tenant_policy ON public.notifications FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

-- user_roles, user_permissions, chat_instances, chat_conversations, chat_messages, store_profiles, registration_steps
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_roles_tenant_policy ON public.user_roles;
CREATE POLICY user_roles_tenant_policy ON public.user_roles FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_permissions_tenant_policy ON public.user_permissions;
CREATE POLICY user_permissions_tenant_policy ON public.user_permissions FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.chat_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_instances_tenant_policy ON public.chat_instances;
CREATE POLICY chat_instances_tenant_policy ON public.chat_instances FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_conversations_tenant_policy ON public.chat_conversations;
CREATE POLICY chat_conversations_tenant_policy ON public.chat_conversations FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_messages_tenant_policy ON public.chat_messages;
CREATE POLICY chat_messages_tenant_policy ON public.chat_messages FOR ALL
  USING (public.app_can_bypass_rls() OR EXISTS (SELECT 1 FROM public.chat_conversations cc WHERE cc.id = chat_messages.conversation_id AND cc.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())))
  WITH CHECK (public.app_can_bypass_rls() OR EXISTS (SELECT 1 FROM public.chat_conversations cc WHERE cc.id = chat_messages.conversation_id AND cc.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())));

ALTER TABLE public.store_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_profiles_tenant_policy ON public.store_profiles;
CREATE POLICY store_profiles_tenant_policy ON public.store_profiles FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.registration_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS registration_steps_tenant_policy ON public.registration_steps;
CREATE POLICY registration_steps_tenant_policy ON public.registration_steps FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

-- shopping_carts (user_id), orders (store_user_id)
ALTER TABLE public.shopping_carts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shopping_carts_tenant_policy ON public.shopping_carts;
CREATE POLICY shopping_carts_tenant_policy ON public.shopping_carts FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orders_tenant_policy ON public.orders;
CREATE POLICY orders_tenant_policy ON public.orders FOR ALL
  USING (public.app_can_bypass_rls() OR store_user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR store_user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));

-- Tabelas que podem ter coluna user_id ou store_user_id (cart_items via cart; order_items via order)
-- shopping_carts e orders já incluídos acima com user_id/store_user_id. Verificar colunas.
-- contract_signers, contract_events: escopo via contract
ALTER TABLE public.contract_signers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_signers_tenant_policy ON public.contract_signers;
CREATE POLICY contract_signers_tenant_policy ON public.contract_signers
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_signers.contract_id
        AND c.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    )
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_signers.contract_id
        AND c.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    )
  );

ALTER TABLE public.contract_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_events_tenant_policy ON public.contract_events;
CREATE POLICY contract_events_tenant_policy ON public.contract_events
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_events.contract_id
        AND c.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    )
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_events.contract_id
        AND c.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    )
  );

-- cart_items: escopo via shopping_carts.user_id
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cart_items_tenant_policy ON public.cart_items;
CREATE POLICY cart_items_tenant_policy ON public.cart_items
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.shopping_carts sc
      WHERE sc.id = cart_items.cart_id
        AND sc.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    )
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.shopping_carts sc
      WHERE sc.id = cart_items.cart_id
        AND sc.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    )
  );

-- order_items: escopo via orders.store_user_id
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_items_tenant_policy ON public.order_items;
CREATE POLICY order_items_tenant_policy ON public.order_items
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.store_user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    )
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.store_user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    )
  );

-- profile_members: escopo via user_profiles.owner_id
ALTER TABLE public.profile_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profile_members_tenant_policy ON public.profile_members;
CREATE POLICY profile_members_tenant_policy ON public.profile_members
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = profile_members.profile_id
        AND up.owner_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    )
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = profile_members.profile_id
        AND up.owner_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    )
  );

COMMENT ON FUNCTION public.app_can_bypass_rls() IS 'Etapa 5 RLS: true se app.bypass_rls=1 (superadmin)';
COMMENT ON FUNCTION public.app_current_tenant_id() IS 'Etapa 5 RLS: app.current_tenant_id da sessão';
COMMENT ON FUNCTION public.app_tenant_visible(uuid) IS 'Etapa 5 RLS: linha visível para tenant atual ou bypass';
