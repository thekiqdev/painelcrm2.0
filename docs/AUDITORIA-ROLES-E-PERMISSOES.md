# Relatório técnico — Auditoria do sistema de roles e permissões

**Data:** 2026  
**Objetivo:** Entender como roles e permissões estão estruturados e utilizados antes de evoluir para um Permission Engine mais robusto.

---

## 1) Estrutura das tabelas

### 1.1 Tabelas principais

| Tabela | Colunas principais | Papel no sistema |
|--------|--------------------|------------------|
| **user_roles** | id, user_id, role (app_role), profile_id, created_at, created_by. UNIQUE(user_id, profile_id, role) | Atribui um **perfil de acesso** (admin, manager, member, viewer) a um usuário em um **perfil de conta** (user_profile). Um usuário pode ter um role por profile. |
| **user_permissions** | id, user_id, profile_id, permission (permission_type), created_at, created_by, updated_at. UNIQUE(user_id, profile_id, permission) | Permissões **granulares** (all_access, manage_clients, view_clients, etc.) por usuário e profile. Usado em paralelo ao role para controle fino em algumas UIs (ex.: membros do perfil). |
| **tenant_enabled_roles** | profile_id, role (app_role), created_at. PK(profile_id, role) | Define **quais roles do sistema** estão habilitados no tenant (por profile). Por padrão cada tenant tem admin e member; pode adicionar manager e viewer. Trigger em user_profiles insere admin + member para novos perfis. |
| **tenant_custom_roles** | id, profile_id, name, slug, created_at, updated_at. UNIQUE(profile_id, slug) | **Perfis de acesso personalizados** por tenant (nome livre). Permite criar perfis além de admin/member/manager/viewer. |
| **user_custom_roles** | user_id, profile_id, custom_role_id, created_at, created_by. PK(user_id, profile_id) | Atribui um **perfil customizado** ao usuário no tenant. Quando preenchido, o usuário **não** tem linha em user_roles para esse profile (ou a lógica de “effective role” prioriza o custom). |

### 1.2 Tabelas de permissões por módulo (RBAC por módulo)

| Tabela | Colunas principais | Papel no sistema |
|--------|--------------------|------------------|
| **role_module_permissions** | role (app_role), module (text), can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only, created_at, updated_at. PK(role, module) | Permissões **por módulo** para cada role do sistema (admin, member, manager, viewer). Define o que cada perfil pode fazer em dashboard, clients, leads, projects, etc. Não tem tenant_id: é **global** por role. |
| **custom_role_module_permissions** | custom_role_id, module, can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only, created_at, updated_at. PK(custom_role_id, module) | Mesma ideia para **perfis customizados** (tenant_custom_roles). Escopo tenant indireto via custom_role_id → tenant_custom_roles.profile_id. |

### 1.3 Tabelas relacionadas (contexto)

| Tabela | Relação com roles/permissões |
|--------|------------------------------|
| **user_profiles** | id, owner_id (user), name, description, is_admin. Um “perfil de conta” pertence a um owner (usuário). O tenant é derivado: owner → users.tenant_id. Roles e permissions são por (user_id, profile_id). |
| **profile_members** | profile_id, user_id, created_by. Associa usuários a um user_profile. Quem está no profile pode receber role e permissions. |
| **users** | tenant_id. Usuário pertence a um tenant. RLS em user_roles/user_permissions usa user_id IN (users WHERE tenant_id = current). |

### 1.4 Enums

- **app_role:** `'admin' | 'manager' | 'member' | 'viewer'`
- **permission_type:** `'all_access' | 'manage_clients' | 'view_clients' | 'manage_leads' | 'view_leads' | 'manage_funnels' | 'view_funnels' | 'manage_settings' | 'view_reports' | 'manage_users'`

### 1.5 Funções SQL (definidas no banco, init 03)

- **has_role(_user_id, _role, _profile_id):** retorna true se existir linha em user_roles para esse user/role/profile. Não é chamada pelo backend Node hoje.
- **has_permission(_user_id, _profile_id, _permission):** retorna true se o usuário é owner do profile, ou tem all_access, ou tem a permissão específica em user_permissions. Não é chamada pelo backend Node.
- **is_profile_member(_profile_id, _user_id):** retorna true se está em profile_members ou é owner do profile. Não é chamada pelo backend Node.

---

## 2) Onde essas tabelas são usadas no código

### 2.1 user_roles

| Arquivo | Uso |
|---------|-----|
| **authController.ts** | No registro: após criar user_profile e profile_members, insere `user_roles (user_id, 'admin', profile_id, user_id)` e `user_permissions (..., 'all_access', ...)`. |
| **myTenantPlanController.ts** | `getMyTenantUsers`: subquery para obter `role` do usuário (JOIN user_profiles + users por tenant). `postMyTenantUser`: insere `user_roles (..., 'member', profile_id, requesterId)`. `putMyTenantUserRole`: verifica admin com `SELECT 1 FROM user_roles WHERE user_id = $1 AND profile_id = $2 AND role = 'admin'`; ao atribuir role do sistema, deleta user_roles e user_custom_roles e insere novo user_roles; ao atribuir custom_role, deleta user_roles e insere user_custom_roles. |
| **tenantsController.ts** | `getTenantUsers`: subquery para listar role do usuário (ur.role de user_roles JOIN user_profiles onde up.owner_id = u.id). |
| **utils/tenant.ts** | `isTenantAdmin`: `SELECT 1 FROM user_roles ur JOIN user_profiles up ... WHERE ur.user_id = $1 AND ur.role = 'admin' AND o.tenant_id = (SELECT tenant_id FROM users WHERE id = $1)`. |
| **services/modulePermissionsService.ts** | `getUserRoleInTenant`: `SELECT ur.role FROM user_roles ur JOIN user_profiles up JOIN users ... WHERE ur.user_id = $1 LIMIT 1` para obter o role do usuário no tenant e depois buscar permissões em role_module_permissions. |
| **utils/tenantSecurity.ts** | Lista `user_roles` como tabela tenant-scoped (para assertTenantScopedQuery). |

### 2.2 user_permissions

| Arquivo | Uso |
|---------|-----|
| **authController.ts** | No registro: insere `user_permissions (user_id, profile_id, 'all_access', user_id)`. |
| **userPermissionsController.ts** | `getMemberPermissions`: SELECT em user_permissions por (member.user_id, member.profile_id). `createMemberPermission`: INSERT em user_permissions. `deleteMemberPermission`: DELETE por id (após validar que pertence ao membro e ao perfil do owner). |
| **profileMembersController.ts** | `getProfileMembers`: para cada membro, SELECT permission FROM user_permissions WHERE user_id AND profile_id. `deleteProfileMember`: DELETE FROM user_permissions WHERE user_id/profile_id do membro (antes de deletar o profile_member). |
| **myTenantPlanController.ts** | `postMyTenantUser`: após inserir user_roles('member'), insere user_permissions para cada permissão de getPermissionsForRole('member'). `putMyTenantUserRole`: ao trocar para role do sistema, DELETE user_permissions e INSERT das getPermissionsForRole(role). |

### 2.3 tenant_enabled_roles

| Arquivo | Uso |
|---------|-----|
| **myTenantPlanController.ts** | `getMyTenantRoles`: SELECT role FROM tenant_enabled_roles WHERE profile_id = $1 para listar roles habilitados no tenant. `putMyTenantUserRole`: antes de atribuir role do sistema, verifica `SELECT 1 FROM tenant_enabled_roles WHERE profile_id = $1 AND role = $2`. |

### 2.4 tenant_custom_roles e user_custom_roles

| Arquivo | Uso |
|---------|-----|
| **customRolesService.ts** | `getCustomRolesForProfile`: SELECT em tenant_custom_roles por profile_id. `createCustomRole`: INSERT em tenant_custom_roles e em custom_role_module_permissions. `getCustomRoleModulePermissions` / `setCustomRoleModulePermissions`: custom_role_module_permissions com JOIN tenant_custom_roles por profile_id. `getUserCustomRoleInProfile`: SELECT custom_role_id FROM user_custom_roles WHERE user_id AND profile_id. |
| **myTenantPlanController.ts** | `getMyTenantUsers`: subqueries para custom_role_id e custom_role_name (user_custom_roles + tenant_custom_roles). `putMyTenantUserRole`: se body.custom_role_id, valida em tenant_custom_roles(profile_id), DELETE user_roles, INSERT/UPDATE user_custom_roles. |

### 2.5 role_module_permissions e custom_role_module_permissions

| Arquivo | Uso |
|---------|-----|
| **modulePermissionsService.ts** | `getRoleModulePermissions(role)`: SELECT em role_module_permissions WHERE role = $1. `setRoleModulePermissions`: INSERT/UPDATE por (role, module) para cada MODULE_IDS. `getUserRoleInTenant`: usa user_roles para obter role; depois getRoleModulePermissions(role). `getEffectiveModulePermissions(userId)`: se tem user_custom_roles, usa getCustomRoleModulePermissions; senão role_module_permissions via getUserRoleInTenant. `assertModulePermission`: usa getEffectiveModulePermissions e verifica can_create/can_edit/can_delete (e edit_own_only/delete_own_only com ownerId/assigneeId). |
| **customRolesService.ts** | Leitura/escrita em custom_role_module_permissions ao criar/atualizar perfis customizados e ao buscar permissões por módulo. |

### 2.6 Queries SQL diretas (resumo)

- **user_roles:** consultado em authController (INSERT), myTenantPlanController (SELECT/INSERT/DELETE), tenantsController (SELECT), tenant.ts (SELECT), modulePermissionsService (SELECT).
- **user_permissions:** consultado em authController (INSERT), userPermissionsController (SELECT/INSERT/DELETE), profileMembersController (SELECT/DELETE), myTenantPlanController (INSERT/DELETE).
- **tenant_enabled_roles:** consultado em myTenantPlanController (SELECT).
- **tenant_custom_roles / user_custom_roles:** consultados em customRolesService e myTenantPlanController.
- **role_module_permissions:** consultado em modulePermissionsService (SELECT/INSERT/UPDATE) e em customRolesService indiretamente via getRoleModulePermissions como base para novo custom role.

---

## 3) Verificação de permissão no sistema

### 3.1 assertModulePermission (modulePermissionsService)

- **Onde existe:** `services/modulePermissionsService.ts` — função `assertModulePermission(userId, moduleId, action, options?)`.
- **Comportamento:** Obtém permissões efetivas do usuário via `getEffectiveModulePermissions(userId)` (que considera user_custom_roles ou user_roles → role_module_permissions). Para a ação (`create` | `edit` | `delete`) verifica can_create/can_edit/can_delete; se edit_own_only/delete_own_only, exige ownerId ou assigneeId. Lança `ModulePermissionError(403)` se não permitido.
- **Onde é usado:**
  - **clientsController:** createClient, updateClient, deleteClient (MODULE_CLIENTS).
  - **leadsController:** createLead, updateLead, deleteLead (MODULE_LEADS).
  - **projectsController:** createProject, updateProject, deleteProject (MODULE_PROJECTS).
  - **projectTasksController:** createProjectTask, updateProjectTask, deleteProjectTask (MODULE_TASKS).

### 3.2 isTenantAdmin (utils/tenant)

- **Onde existe:** `utils/tenant.ts` — função `isTenantAdmin(userId)`.
- **Comportamento:** Retorna true se existir user_roles com role = 'admin' para esse usuário em um profile cujo owner pertence ao mesmo tenant do usuário.
- **Onde é usado:**
  - **projectsController:** getProject (visibilidade de áreas), updateProject (permissão para alterar responsáveis/equipes), deleteProject (só owner ou admin).
  - **projectAreasController:** getProjectAreas (admin vê todas as áreas; não-admin filtra por responsible_ids/team_ids).

### 3.3 Verificações ad hoc (sem helper reutilizável)

- **myTenantPlanController.postMyTenantUser:** verifica se requester é owner do profile ou tem `user_roles(role = 'admin')` para o profile antes de criar usuário.
- **myTenantPlanController.getMyTenantPlan / putMyTenantPlan:** apenas “primary user” do tenant pode acessar (via getMyTenantAndPrimary).

Não existe no backend Node uso das funções SQL `has_role`, `has_permission` ou `is_profile_member`; elas existem no banco (init 03 e migrações Supabase) mas não são invocadas pela API atual.

---

## 4) Middleware de autorização

### 4.1 O que existe

- **requireFeature(featureKey)** (`middleware/auth.ts`): verifica se o usuário tem a **feature** no plano/tenant (ex.: `chat`). Retorna 403 se não tiver. Usado em **chatRoutes** com `router.use(requireFeature('chat'))`. Não é baseado em role nem em permission; é baseado em feature do plano.
- **requireSuperAdmin:** exige req.user.is_super_admin. Usado em rotas superadmin.
- **authenticateToken / setCurrentTenant / setRequestDb:** autenticação e contexto de tenant/RLS, não autorização por role/permission.

### 4.2 O que não existe

- Não existe middleware do tipo **requirePermission('projects.create')** ou **requireRole('admin')** aplicado a rotas.
- A verificação de permissão é feita **dentro dos controllers**, chamando `assertModulePermission` manualmente em apenas alguns módulos (clients, leads, projects, projectTasks). Outros módulos (products, funnels, tickets, contracts, invoices, expenses, proposals, etc.) **não** chamam assertModulePermission.

---

## 5) Relação com multi-tenant

### 5.1 RLS (57_rls_tenant_isolation.sql)

- **user_roles:** política `user_roles_tenant_policy`: USING/WITH CHECK com `user_id IN (SELECT id FROM users WHERE tenant_id = public.app_current_tenant_id())`. Acesso apenas a linhas cujo user pertence ao tenant da sessão (ou bypass superadmin).
- **user_permissions:** mesma ideia: `user_permissions_tenant_policy` com user_id IN (users WHERE tenant_id = current). Roles e permissions respeitam tenant ao nível do banco.

### 5.2 Queries no código

- **user_roles / user_permissions:** as consultas que listam ou alteram dados usam profile_id e user_id; o profile pertence a um owner que pertence a um tenant. Em myTenantPlanController e tenantsController as queries filtram por tenant (via profile do tenant ou u.tenant_id = $1). Não há query que liste user_roles ou user_permissions de outro tenant sem passar por profile/tenant já validado.
- **tenant_enabled_roles / tenant_custom_roles:** scoped por profile_id; o profile é do tenant. customRolesService e myTenantPlanController sempre recebem ou derivam profileId do tenant do usuário logado.
- **role_module_permissions:** não tem tenant_id; é global por (role, module). Isso é intencional: define o “template” de permissões por role. O escopo tenant vem de quem tem esse role (user_roles por profile do tenant).

Conclusão: roles e permissões respeitam tenant via RLS e via uso de profile_id/tenant_id nas queries. Um usuário de um tenant não acessa roles/permissions de outro.

---

## 6) Fluxo atual de criação de roles e permissões

### 6.1 Como um role (sistema) é “criado”

- **Roles do sistema** (admin, manager, member, viewer) não são “criados” em runtime; estão no enum e em **role_module_permissions** (seed em 51 e 52). O tenant só escolhe **quais** estão habilitados em **tenant_enabled_roles** (por profile_id). Trigger em novo user_profile insere admin e member em tenant_enabled_roles.

### 6.2 Como um role é atribuído a um usuário

- **Registro (authController):** ao criar conta, insere user_roles(admin) e user_permissions(all_access) para o primeiro usuário no profile.
- **Adicionar usuário ao tenant (myTenantPlanController.postMyTenantUser):** insere profile_members, user_roles('member') e user_permissions para cada permissão de getPermissionsForRole('member').
- **Alterar role do usuário (myTenantPlanController.putMyTenantUserRole):**  
  - Se custom_role_id: remove user_roles, insere/atualiza user_custom_roles.  
  - Se role do sistema: remove user_custom_roles e user_roles, insere user_roles(role) e re-sincroniza user_permissions com getPermissionsForRole(role).  
  - Antes, valida se o role está em tenant_enabled_roles.

### 6.3 Como uma permissão (permission_type) é atribuída

- **userPermissionsController.createMemberPermission:** INSERT em user_permissions (user_id, profile_id, permission, created_by). Usado na UI de “membros do perfil” para dar permissões granulares (manage_clients, view_leads, etc.).
- **myTenantPlanController:** ao atribuir role do sistema, substitui o conjunto de user_permissions pelo retorno de getPermissionsForRole(role) (rolePermissionsService).

### 6.4 Perfis customizados

- **Criação:** myTenantPlanController.postMyTenantRole → customRolesService.createCustomRole(profileId, name, baseRole?). Cria linha em tenant_custom_roles e em custom_role_module_permissions (cópia de baseRole ou tudo false).
- **Edição de permissões por módulo:** putCustomRolePermissionsHandler → setCustomRoleModulePermissions. Interface em “Meu plano” / “Perfis de acesso”.

### 6.5 Interface e automatização

- **Interface:** existe UI para “Perfis de acesso” (roles habilitados, custom roles, atribuição de role a usuário) e para “membros do perfil” com permissões (userPermissionsController) em rotas como /api/user-profiles/... e /api/me/tenant/...
- **Automático:** no registro e ao adicionar usuário ao tenant (postMyTenantUser) a atribuição de role e permissions é feita no backend; ao trocar role (putMyTenantUserRole) as user_permissions são sincronizadas com o mapeamento fixo de rolePermissionsService.

---

## 7) Nível atual de maturidade do sistema de permissões

**Classificação: B) RBAC parcial**

Motivos:

- **Armazenamento:** As tabelas (user_roles, user_permissions, tenant_enabled_roles, tenant_custom_roles, user_custom_roles, role_module_permissions, custom_role_module_permissions) existem e estão populadas e relacionadas; há dois “sistemas” em paralelo: (1) permission_type em user_permissions e (2) módulos (can_view/can_create/can_edit/can_delete) em role_module_permissions / custom_role_module_permissions.
- **Uso real de autorização:** Apenas **parte** dos módulos usa `assertModulePermission` (clients, leads, projects, projectTasks). Outros (products, funnels, tickets, contracts, invoices, expenses, proposals, etc.) não verificam permissão por módulo antes de create/edit/delete. Não há middleware de rota do tipo requirePermission/requireRole; a verificação é manual e incompleta.
- **RBAC completo** exigiria: (a) toda ação sensível protegida por permissão/role, (b) middleware ou camada única de autorização, (c) consistência entre “permission_type” e “módulos” (ou unificação). Por isso é **parcial**, não apenas armazenamento (há assertModulePermission e isTenantAdmin em uso) e não completo (cobertura e middleware faltando).

---

## 8) Pontos que precisam evoluir

### 8.1 Incompletude

- **assertModulePermission** não é usado em: products, funnels, funnel_stages, lead_statuses, lead_tasks, tickets, ticket_categories, contracts, contract_templates, invoices, expenses, proposals, message_templates, notifications, client_groups, client_tasks, project_lists, project_areas, project_templates, dashboard, settings, etc. Create/edit/delete nesses módulos não checam permissão por módulo.
- **View (GET):** não há verificação de “can_view” por módulo nos controllers; listagens e getById dependem apenas de tenant (e em alguns casos isTenantAdmin para visibilidade extra).

### 8.2 Duplicidade / dois sistemas

- **user_permissions (permission_type)** é usado para UI de membros e para has_permission no banco, mas a **autorização** de create/edit/delete na API usa **role_module_permissions** (e custom) via assertModulePermission. Os dois modelos (permission_type vs módulos) não estão unificados; um mesmo “cliente” pode ter manage_clients em user_permissions mas a API só olha can_create/can_edit em role_module_permissions.

### 8.3 Ausência de middleware de autorização

- Não existe middleware que receba algo como `requirePermission('clients.create')` ou `requireRole('admin')` e bloqueie a rota antes do controller. Toda checagem é explícita dentro do controller, o que facilita esquecer em endpoints novos.

### 8.4 Ausência de verificação em vários controllers

- Controllers como productsController, funnelsController, ticketsController, contractsController, invoicesController, expensesController, proposalsController não chamam assertModulePermission. Quem tem acesso ao tenant (e passa no RLS) pode executar create/edit/delete nesses recursos sem checagem de perfil de acesso por módulo.

### 8.5 Outros

- **profileMembersController.deleteProfileMember:** remove user_permissions do membro mas **não** remove user_roles; pode deixar linhas órfãs em user_roles se o fluxo de “membro” for o mesmo que “usuário do tenant com role”.
- **Funções SQL has_role / has_permission / is_profile_member:** existem no banco e não são usadas pelo backend Node; ou passam a ser usadas em um Permission Engine único, ou fica claro que são legado/Supabase.
- **Documentação:** não há documento único que descreva “quem pode fazer o quê” e onde cada permissão é aplicada na API.

---

## 9) Conclusão

### 9.1 O que já está pronto

- Estrutura de tabelas de roles e permissões (user_roles, user_permissions, tenant_enabled_roles, tenant_custom_roles, user_custom_roles, role_module_permissions, custom_role_module_permissions) e enums (app_role, permission_type).
- RLS garantindo isolamento por tenant em user_roles e user_permissions.
- Serviços para permissões por módulo (modulePermissionsService) e para perfis customizados (customRolesService), com `getEffectiveModulePermissions` e `assertModulePermission`.
- Uso de assertModulePermission em clients, leads, projects e project_tasks (create/edit/delete).
- Uso de isTenantAdmin para regras especiais (ex.: áreas de projeto, edição de projeto).
- Fluxo de atribuição de role e custom role na API (myTenantPlanController) e sincronização de user_permissions com role (rolePermissionsService.getPermissionsForRole).
- API e fluxos para listar/alterar perfis habilitados, custom roles e permissões por módulo (Meu plano / Perfis de acesso).
- Middleware de feature de plano (requireFeature) para bloquear acesso a recurso (ex.: chat) por plano.

### 9.2 O que precisa ser corrigido

- Estender **assertModulePermission** (ou equivalente unificado) a todos os módulos que têm create/edit/delete (products, funnels, tickets, contracts, invoices, expenses, proposals, etc.) para que autorização por perfil seja consistente.
- Decidir e documentar a relação entre **user_permissions (permission_type)** e **role_module_permissions**: unificar em um único modelo de permissão na API ou manter dois com regras claras de uso (ex.: UI de membros vs. autorização de endpoints).
- Corrigir **deleteProfileMember** para remover também user_roles (e, se aplicável, user_custom_roles) quando o membro for removido do profile, para não deixar dados órfãos.
- Introduzir checagem de **can_view** onde fizer sentido (listagens/get por módulo), se o modelo de negócio exigir restrição de visualização por perfil.

### 9.3 O que falta para um Permission Engine robusto

- **Middleware de autorização:** algo como `requirePermission('module.action')` ou `requireRole('admin')` aplicado às rotas, centralizando a decisão e reduzindo esquecimentos.
- **Unificação de modelo:** um único conceito de “permissão” (ou mapeamento explícito permission_type ↔ módulo.ação) usado em toda a API e na UI.
- **Cobertura total:** toda ação sensível (create/edit/delete e, se necessário, view) protegida por esse modelo.
- **Uso das funções do banco (opcional):** se o engine for centralizado no backend, avaliar chamar has_role/has_permission onde fizer sentido, ou descontinuar e manter só no app layer.
- **Documentação e testes:** documento de matriz “recurso × ação × role/permission” e testes de autorização (quem pode/não pode) para evitar regressões.
- **Auditoria e cache (opcional):** registro de checagens de permissão e cache de “effective permissions” por usuário/tenant para performance.

Este relatório serve de base para desenhar e implementar o Permission Engine sem alterar comportamento até que as decisões de desenho estejam fechadas.
