# Análise técnica — Conflito entre os dois sistemas de permissão

**Objetivo:** Mapear equivalência, conflitos e uso real dos modelos **permission_type** (user_permissions) e **module permissions** (role_module_permissions / custom_role_module_permissions), e recomendar qual base usar no Permission Engine.

---

## 1) Mapeamento de equivalência

### 1.1 Inventário

**permission_type (enum no banco, user_permissions):**
- `all_access`
- `manage_clients`, `view_clients`
- `manage_leads`, `view_leads`
- `manage_funnels`, `view_funnels`
- `manage_settings`, `view_reports`, `manage_users`

**Módulos (role_module_permissions / custom_role_module_permissions):**
- Cada módulo tem: `can_view`, `can_create`, `can_edit`, `can_delete`, `edit_own_only`, `delete_own_only`.
- Lista de módulos: `dashboard`, `clients`, `leads`, `funnels`, `products`, `projects`, `tasks`, `project_templates`, `chat`, `tickets`, `proposals`, `contracts`, `billing`, `finance`, `settings`, `meu_plano`.

### 1.2 Equivalência proposta (onde existe correspondência direta)

| permission_type   | Módulo / ações equivalentes (module permissions) | Observação |
|-------------------|---------------------------------------------------|------------|
| **view_clients**  | `clients.can_view`                                | Equivalência direta 1:1. |
| **manage_clients**| `clients.can_create` + `clients.can_edit` + `clients.can_delete` | “Manage” = CRUD; não há flag única “manage” no módulo. |
| **view_leads**    | `leads.can_view`                                  | Equivalência direta 1:1. |
| **manage_leads**  | `leads.can_create` + `leads.can_edit` + `leads.can_delete` | Idem manage_clients. |
| **view_funnels**  | `funnels.can_view`                                | Equivalência direta 1:1. |
| **manage_funnels**| `funnels.can_create` + `funnels.can_edit` + `funnels.can_delete` | Idem. |
| **manage_settings** | `settings.can_view` + `settings.can_edit` (e eventualmente create/delete se existir) | “Manage” mapeado para capacidade de alterar configurações. |
| **all_access**    | Todos os módulos: can_view, can_create, can_edit, can_delete = true onde aplicável | Equivalência conceitual; no módulo é por-role (admin tem tudo). |

### 1.3 Onde **não** existe equivalência clara

| permission_type | Situação |
|-----------------|----------|
| **view_reports** | Não existe módulo `reports` em MODULE_IDS. O mais próximo é `dashboard` (can_view). Relatórios podem ser parte de dashboard ou de vários módulos; não há mapeamento 1:1. |
| **manage_users** | Não existe módulo `users` (ou `manage_users`) em MODULE_IDS. Gestão de usuários do tenant hoje é tratada por “quem é admin/owner” em myTenantPlanController, não por permissão de módulo. Não há can_view/can_create para “users”. |

### 1.4 Módulos sem permission_type correspondente

Os seguintes módulos existem **apenas** no modelo de module permissions; não há nenhum `permission_type` para eles:

- `dashboard`, `products`, `projects`, `tasks`, `project_templates`, `chat`, `tickets`, `proposals`, `contracts`, `billing`, `finance`, `meu_plano`

Ou seja: **a maior parte do produto** (Projects, Finance, Tickets, Chat, etc.) só é modelada no sistema de módulos. O permission_type cobre apenas uma fatia (clients, leads, funnels, settings, reports, users).

**Conclusão do mapeamento:**  
Existe equivalência **parcial** apenas para clients, leads, funnels e settings. Para view_reports e manage_users a equivalência é inexistente ou indireta. O modelo por módulo é **mais rico e alinhado** ao produto (CRM, Projects, Finance, Tickets, Chat, etc.).

---

## 2) Conflitos possíveis

### 2.1 Cenário A: Usuário tem permission_type mas não tem permissão no módulo

- **Como ocorre:** Alguém atribui manualmente em `user_permissions` (ex.: `manage_clients`) a um usuário que tem role com permissões de módulo **reduzidas** (ex.: custom role ou “viewer” com clients.can_view = true e can_create/can_edit/can_delete = false).
- **Efeito na API:** Os endpoints que **realmente** checam autorização (clientsController create/edit/delete) usam **apenas** `assertModulePermission`, que lê **role_module_permissions / custom_role_module_permissions**. Ou seja, **não** leem `user_permissions`. O usuário com `manage_clients` em user_permissions mas sem can_edit/can_delete no módulo **não** consegue criar/editar/excluir clientes: o sistema dominante é o de módulos.
- **Conflito:** A **UI** (lista de permissões do membro) pode mostrar “manage_clients” e o usuário esperar poder gerenciar clientes, mas a API bloqueia. Comportamento inconsistente para quem olha só a tela de permissões (permission_type).

### 2.2 Cenário B: Usuário tem permissão no módulo mas não tem permission_type

- **Como ocorre:** Usuário tem role “member” (ou custom role) com `clients.can_create = true` em role_module_permissions, mas por algum bug ou fluxo antigo **não** tem a linha correspondente em `user_permissions` (ex.: manage_clients).
- **Efeito na API:** `assertModulePermission` usa só módulo; então o usuário **consegue** criar/editar/excluir clientes. Na UI de “membros” (que lista user_permissions), ele pode **não** aparecer com “manage_clients”.
- **Conflito:** A API deixa fazer a ação; a UI de permissões (permission_type) não reflete essa capacidade. Fonte da verdade para a API é o módulo; para a tela de membros é permission_type.

### 2.3 Sincronização atual (myTenantPlanController)

- Ao atribuir role do sistema (putMyTenantUserRole), o backend **sobrescreve** user_permissions com `getPermissionsForRole(role)` (rolePermissionsService). Ou seja, **user_permissions** é mantido em sync com o **role** no fluxo “Meu plano / usuários / alterar perfil”.
- Porém: **getEffectiveModulePermissions** (usado por assertModulePermission) **não** lê user_permissions; lê apenas user_roles → role_module_permissions ou user_custom_roles → custom_role_module_permissions. Então mesmo com user_permissions sincronizado, a **decisão de acesso** é 100% baseada em módulos. As duas fontes podem divergir se alguém editar user_permissions manualmente (API de membros) sem alterar role/custom role.

### 2.4 Resumo de conflitos

| Situação | Quem “vence” na prática | Risco |
|----------|--------------------------|-------|
| permission_type diz “pode”, módulo diz “não pode” | Módulo (API bloqueia) | UI engana: usuário acha que pode e não pode. |
| permission_type diz “não pode”, módulo diz “pode” | Módulo (API permite) | UI engana: lista de permissões não mostra o que a API realmente permite. |
| Edição manual de user_permissions (membros) | Não altera comportamento da API | Fonte da verdade para autorização é só o modelo de módulos. |

---

## 3) Qual sistema está sendo usado na prática

### 3.1 Uso de permission_type (user_permissions)

| Local | Uso |
|-------|-----|
| **authController** | INSERT em user_permissions no registro (all_access para o primeiro usuário). |
| **userPermissionsController** | GET lista de permissões do membro; POST criar permissão para membro; DELETE remover permissão. Rotas: GET/POST .../members/:memberId/permissions, DELETE .../permissions/:permissionId. |
| **profileMembersController** | GET membros do perfil: para cada membro, SELECT permission FROM user_permissions. DELETE membro: DELETE em user_permissions antes de remover profile_member. |
| **myTenantPlanController** | Ao criar usuário no tenant: INSERT user_permissions para cada getPermissionsForRole('member'). Ao trocar role: DELETE user_permissions e INSERT getPermissionsForRole(role). Nunca **lê** user_permissions para decidir se o usuário pode executar uma ação. |

Nenhum controller **consulta** user_permissions (ou permission_type) para **autorizar** create/edit/delete (ou view). A função SQL `has_permission()` existe no banco mas **não é chamada** pelo backend Node.

### 3.2 Uso de assertModulePermission (module permissions)

| Controller | Uso |
|------------|-----|
| **clientsController** | assertModulePermission(userId, 'clients', 'create' | 'edit' | 'delete') em createClient, updateClient, deleteClient. |
| **leadsController** | assertModulePermission(userId, 'leads', 'create' | 'edit' | 'delete') em createLead, updateLead, deleteLead. |
| **projectsController** | assertModulePermission(userId, 'projects', 'create' | 'edit' | 'delete') em createProject, updateProject, deleteProject. |
| **projectTasksController** | assertModulePermission(userId, 'tasks', 'create' | 'edit' | 'delete') em createProjectTask, updateProjectTask, deleteProjectTask. |

Nenhum outro controller (products, funnels, tickets, contracts, invoices, expenses, proposals, etc.) chama assertModulePermission hoje.

### 3.3 Conclusão de uso

- **permission_type (user_permissions):** usado para **exibição** (lista de permissões do membro), **escrita** ao atribuir role e na API de “membros” (adicionar/remover permissão). **Não** usado para **negar ou permitir** acesso a nenhum endpoint de negócio.
- **Module permissions:** usado para **autorização efetiva** nos únicos lugares onde ela existe (clients, leads, projects, tasks). Fonte dos dados: role_module_permissions e custom_role_module_permissions, via getEffectiveModulePermissions.

---

## 4) Sistema dominante

O modelo que **realmente controla o acesso** hoje é o de **module permissions** (role_module_permissions / custom_role_module_permissions), por meio de:

- `getEffectiveModulePermissions(userId)` (considera user_roles ou user_custom_roles e lê só tabelas de módulo).
- `assertModulePermission(userId, moduleId, action)` (create/edit/delete).

O modelo **permission_type (user_permissions)**:

- Influencia apenas a **UI** (lista de permissões do membro) e é mantido em sync com o role ao trocar perfil em “Meu plano”.
- **Não** participa de nenhuma decisão de autorização na API Node (e has_permission no banco não é chamada pelo backend).

Portanto: **sistema dominante = module permissions.** permission_type é secundário e apenas refletido na interface e na consistência com o role; não é a base da autorização.

---

## 5) Recomendação arquitetural

### 5.1 Opções

- **A) permission_type como base:** Expandir permission_type para cobrir todos os recursos (products, projects, tickets, etc.) e fazer a API passar a consultar user_permissions (ou has_permission) para toda ação.
- **B) Module permissions como base:** Adotar definitivamente o modelo “módulo + can_view/can_create/can_edit/can_delete (edit_own_only, delete_own_only)” como única fonte da verdade; unificar UI e API nesse modelo; tratar permission_type como legado ou derivado.
- **C) Híbrido:** Manter os dois: permission_type para “membros do perfil” e module permissions para “perfil de acesso” do tenant, com regra explícita de qual usar em cada contexto.

### 5.2 Recomendação: **B) Module permissions como base do Permission Engine**

Motivos principais:

1. **Cobertura do produto:** O modelo por módulo já cobre todos os domínios do SaaS (CRM = clients/leads/funnels; Projects = projects/tasks/project_templates; Finance = billing/finance; Tickets; Chat; Config = settings; Meu plano). permission_type cobre só clients, leads, funnels, settings, reports, users e não tem equivalente para products, projects, tasks, tickets, proposals, contracts, billing, finance, chat, dashboard, meu_plano.
2. **Granularidade e consistência:** Um único esquema “módulo + view/create/edit/delete (+ edit_own_only/delete_own_only)” é suficiente para expressar “quem pode ver/criar/editar/excluir o quê” em todos os módulos. Evita duplicar conceitos (manage_X vs can_create+can_edit+can_delete) e reduz inconsistência.
3. **Já é a fonte efetiva:** A única autorização real na API hoje é assertModulePermission; faz sentido consolidar e estender esse modelo em vez de reintroduzir uma segunda fonte (permission_type) que hoje não controla nada.
4. **Custom roles:** Perfis customizados já vivem só no modelo de módulos (custom_role_module_permissions). Unificar em module permissions evita ter que manter dois esquemas (um para roles do sistema e outro para custom).
5. **Escalabilidade para novos módulos:** Novos módulos (ex.: Automations) entram como mais uma linha em role_module_permissions / custom_role_module_permissions, com as mesmas flags. Não é necessário criar novos permission_type e decidir como mapear para “manage_automations” vs “view_automations”.
6. **SaaS multi-tenant com módulos claros:** Para um produto com CRM, Projects, Finance, Tickets, Chat, Automations, o conceito “módulo” é natural. Cada área do produto = um módulo; cada módulo tem as mesmas dimensões (view, create, edit, delete, opcionalmente edit_own/delete_own). permission_type é uma lista fixa e menos alinhada a essa estrutura.

### 5.3 O que fazer com permission_type / user_permissions

- **Curto prazo:** Manter user_permissions para não quebrar a UI de “membros do perfil” que lista/edita permissões, mas **derivar** o que é exibido/gravado a partir do modelo de módulos (ex.: “manage_clients” = clients.can_create && (can_edit || can_delete) para exibição; ao salvar na UI de membros, atualizar role/custom_role ou um cache de “effective module permissions” por usuário, em vez de manter uma tabela separada com vida própria).
- **Médio prazo:** Migrar a UI de “permissões do membro” para mostrar/editar permissões por **módulo** (can_view, can_create, can_edit, can_delete), alinhada a getEffectiveModulePermissions. Depreciar ou remover a escrita direta em user_permissions para “permissões granulares” e manter apenas role + custom role + module permissions como fonte da verdade.
- **Banco:** As funções has_permission/has_role podem permanecer para compatibilidade (ex.: Supabase/RLS) ou serem documentadas como legado; o Permission Engine na aplicação deve usar apenas o modelo de módulos para decisões.

### 5.4 Resumo

- **Equivalência:** Só parcial (clients, leads, funnels, settings); view_reports e manage_users não têm módulo 1:1; vários módulos não têm permission_type.
- **Conflitos:** Quem decide na API é sempre o módulo; permission_type pode desalinhar a UI da realidade do acesso.
- **Uso real:** permission_type para exibição e sync com role; module permissions para autorização efetiva (e só em 4 controllers hoje).
- **Sistema dominante:** Module permissions.
- **Recomendação:** Adotar **module permissions (B)** como base do Permission Engine, unificar UI e API nesse modelo e tratar permission_type/user_permissions como legado ou derivado, evoluindo para um único esquema “módulo + ações” adequado a um SaaS multi-tenant com CRM, Projects, Finance, Tickets, Chat e Automations.
