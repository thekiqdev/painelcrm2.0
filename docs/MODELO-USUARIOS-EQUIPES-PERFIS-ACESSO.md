# Modelo: Usuários, Equipes e Perfis de Acesso

Documentação do modelo final implementado conforme o plano em `PLANO-USUARIOS-EQUIPES-PERFIS-ACESSO.md`.

---

## Visão geral

| Entidade | Descrição |
|----------|-----------|
| **Usuário** | Pessoa que acessa o sistema: nome, email, senha, **equipes** vinculadas e **perfil de acesso** (role) no tenant. |
| **Equipe** | Agrupamento por tenant (ex.: Comercial, Design). Usado para filtrar projetos e atribuir tarefas. |
| **Perfil de acesso (Role)** | Conjunto fixo de permissões: Administrador, Gestor, Operacional, Visualizador. |

Relações:

- **User** → pertence a → **Equipes** (N:N via `team_members`)
- **User** (no tenant) → possui → **Role** (em `user_roles` por perfil/workspace)
- **Role** → contém → **Permissions** (mapeamento fixo em código: `rolePermissionsService`)

Restrição: a **criação de usuário** no tenant respeita o **limite do plano** (`plans.max_users` ou override do tenant).

---

## Banco de dados

### Usuários e tenant

| Tabela | Onde | Descrição |
|--------|------|-----------|
| `users` | `01_create_users_and_auth.sql` | id, email, password_hash, **tenant_id**, etc. |
| `profiles` | `01_create_users_and_auth.sql` | Dados 1:1 do usuário: first_name, last_name, company_name, etc. |
| `tenants` | `26_tenants_and_user_tenant.sql` | Conta/empresa; plan_id, max_users_override, etc. |
| `user_profiles` | `01_create_users_and_auth.sql` | Workspace/conta (owner_id = usuário dono do workspace). |
| `profile_members` | `01_create_users_and_auth.sql` | user_id ↔ profile_id (quem pertence a qual workspace). |

### Roles e permissões

| Tabela | Onde | Descrição |
|--------|------|-----------|
| `user_roles` | `03_create_permissions_and_roles.sql` | user_id, **role** (app_role: admin, manager, member, viewer), profile_id. |
| `user_permissions` | `03_create_permissions_and_roles.sql` | user_id, profile_id, **permission** (permission_type). |
| Enum `app_role` | `02_create_enums.sql` | admin, manager, member, viewer. |
| Enum `permission_type` | `02_create_enums.sql` | all_access, manage_clients, view_clients, manage_leads, … |

Ao atribuir um **role** ao usuário, o backend sincroniza as linhas em `user_permissions` conforme o mapeamento do role (ver serviço abaixo).

### Equipes

| Tabela | Onde | Descrição |
|--------|------|-----------|
| `teams` | `49_teams_and_team_members.sql` | tenant_id, name, slug, description. |
| `team_members` | `49_teams_and_team_members.sql` | team_id, user_id, role (lead | member). UNIQUE(team_id, user_id). |

### Planos e limites

| Tabela / campo | Descrição |
|----------------|-----------|
| `plans` | max_users, max_profiles, etc. |
| `tenants.max_users_override` | Override de limite de usuários por tenant. |

---

## API (backend)

### Limites e usuários do tenant (autenticado)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/me/tenant/limits` | Retorna `{ users: { current, limit, allowed } }`. |
| GET | `/api/me/tenant/users` | Lista usuários do tenant (id, email, full_name, role, last_used_at). |
| GET | `/api/me/tenant/roles` | Lista perfis de acesso com nome e permissões. |
| PUT | `/api/me/tenant/users/:userId/role` | Body `{ role }`. Atribui role ao usuário e sincroniza permissões. |

**Onde:** `packages/backend/src/controllers/myTenantPlanController.ts`, rotas em `myTenantPlanRoutes.ts`.

### Equipes

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/teams` | Lista equipes do tenant. |
| GET | `/api/teams/:id` | Detalhe de uma equipe. |
| POST | `/api/teams` | Cria equipe. |
| PATCH | `/api/teams/:id` | Atualiza equipe. |
| DELETE | `/api/teams/:id` | Remove equipe. |
| GET | `/api/teams/:teamId/members` | Membros da equipe. |
| POST | `/api/teams/:teamId/members` | Adiciona membro (user_id, role). |
| DELETE | `/api/teams/:teamId/members/:memberId` | Remove membro. |
| GET | `/api/teams/by-user/:userId` | Equipes às quais o usuário pertence. |
| PUT | `/api/teams/by-user/:userId` | Body `{ team_ids }`. Define as equipes do usuário (substitui vínculos). |

**Onde:** `packages/backend/src/controllers/teamsController.ts`, `teamsRoutes.ts`.

### Criação de usuário e limite

No **registro** (associar usuário ao tenant), o backend chama `checkTenantUsersLimitForAddOne(tenantId)` antes de atribuir `tenant_id`. Se o limite estiver atingido, retorna 403 com mensagem clara.

**Onde:** `packages/backend/src/controllers/authController.ts`, `packages/backend/src/services/tenantLimitService.ts`.

### Mapeamento Role → Permissões

O conjunto de permissões de cada **app_role** é definido em código:

**Onde:** `packages/backend/src/services/rolePermissionsService.ts`.

- **admin:** `all_access`
- **manager:** manage/view clients, leads, funnels, manage_settings, view_reports
- **member:** view + manage clients, leads, funnels, view_reports
- **viewer:** view_clients, view_leads, view_funnels, view_reports

---

## Frontend (onde está o quê)

| Funcionalidade | Onde |
|----------------|------|
| Menu **Usuários e Acesso** (Usuários, Equipes, Perfis de acesso) | `src/components/settings/SettingsMenu.tsx`, `src/pages/Settings.tsx` |
| Lista de usuários, limite (X de Y), botão Novo Usuário desabilitado no limite, edição de equipes por usuário, select de perfil de acesso | `src/components/settings/UsersSection.tsx`, `UserTeamsDialog.tsx` |
| CRUD de equipes e membros | `src/components/settings/TeamsSection.tsx` |
| Perfis de acesso (lista de roles e permissões), perfis e membros (workspaces) | `src/components/settings/UserManagementSection.tsx` |
| Serviços: limites, usuários do tenant, roles, equipes | `src/services/tenantLimits.ts`, `src/services/teams.ts` |

---

## Integração com projetos (Etapa 5)

- **projects.team_id** (opcional): equipe responsável pelo projeto. Migração: `50_projects_team_id.sql`.
- **GET /api/projects?team_id=** : filtra projetos por equipe.
- Na criação/edição de projeto e na atribuição de tarefa, o frontend permite selecionar equipe e filtrar responsáveis por equipe.

Referência do plano: `docs/PLANO-USUARIOS-EQUIPES-PERFIS-ACESSO.md`.
