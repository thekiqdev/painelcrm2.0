# Relatório técnico — Auditoria do isolamento multi-tenant

**Data da auditoria:** 2026-03-05  
**Escopo:** Implementação recente do plano de isolamento multi-tenant (Etapas 1 a 6).  
**Objetivo:** Verificar conformidade com o plano e identificar falhas de isolamento de dados entre tenants.

---

## 1 — Middleware de tenant

### 1.1 setCurrentTenant

- **Local:** `packages/backend/src/middleware/auth.ts` (linhas 61–76).
- **Comportamento:** Roda após `authenticateToken`; chama `getTenantIdForUser(req.userId)` uma vez e atribui a `req.tenantId`. Se o usuário não tiver tenant (ex.: superadmin), `req.tenantId` fica `null`.
- **Ordem:** Garantida pela cadeia `tenantAuth = [authenticateToken, setCurrentTenant, setRequestDb]`: primeiro auth, depois tenant, depois RLS.
- **Consultas ao banco:** Uma chamada a `getTenantIdForUser` por request (uma query `SELECT tenant_id FROM users WHERE id = $1`) quando há `req.userId`. Não há múltiplas consultas no middleware.
- **Fallback superadmin:** Usuários sem `tenant_id` (superadmin) recebem `req.tenantId = null`; rotas superadmin usam `superadminAuth` (bypass RLS) e não dependem de tenant.

### 1.2 Onde o middleware é aplicado

**Cadeia `tenantAuth` (authenticateToken + setCurrentTenant + setRequestDb)** aplicada em:

- `authRoutes.ts`: `/me`, `/me/features`, `/logout`
- `productsRoutes`, `storeProfileRoutes`, `clientsRoutes`, `clientGroupsRoutes`, `profileRoutes`, `registrationStepsRoutes`, `leadsRoutes`, `leadStatusesRoutes`, `leadTasksRoutes`, `funnelsRoutes`, `funnelStagesRoutes`, `cartRoutes`, `ordersRoutes`, `ticketsRoutes`, `ticketCategoriesRoutes`, `contractsRoutes`, `contractTemplatesRoutes`, `projectTemplatesRoutes`, `projectsRoutes`, `projectListsRoutes`, `projectAreasRoutes`, `projectTasksRoutes`, `teamsRoutes`, `userProfilesRoutes`, `profileMembersRoutes`, `userPermissionsRoutes`, `searchRoutes`, `tasksRoutes`, `invoicesRoutes`, `expensesRoutes`, `proposalsRoutes`, `membersRoutes`, `dashboardRoutes`, `chatRoutes`, `notificationsRoutes`, `messageTemplatesRoutes`, `messagesRoutes`, `myTenantPlanRoutes`

**Cadeia `superadminAuth`** (authenticateToken + requireSuperAdmin + setRequestDb):

- `superadminRoutes`, `plansRoutes`, `tenantsRoutes`

**Rotas sem tenant (intencional):**

- `authRoutes`: `/register`, `/login` (públicas)
- `productsRoutes`: `GET /public/:userId` (público, antes de `tenantAuth`)

### 1.3 Rotas protegidas sem setCurrentTenant

- **Nenhuma.** Todas as rotas que usam autenticação usam `tenantAuth` ou `superadminAuth`; em ambos os casos `setCurrentTenant` está incluído (em `tenantAuth`) ou não é necessário (superadmin usa bypass).
- **Observação:** Rotas de planos (`/api/plans`) estão atrás de `superadminAuth`. Se a aplicação precisar de listagem pública de planos para pricing, será necessário um endpoint público ou um middleware alternativo.

---

## 2 — Uso de getTenantIdForUser nos controllers

### 2.1 Controllers que ainda usam getTenantIdForUser (ou getTenantId local)

| Arquivo | Linhas | Observação |
|---------|--------|------------|
| `middleware/auth.ts` | 73 | Uso correto: único ponto que popula `req.tenantId`. |
| `leadStatusesController.ts` | 5, 15 | Obtém tenantId após ler userId; poderia usar `req.tenantId`. |
| `funnelStagesController.ts` | 5, 21 | Idem. |
| `leadTasksController.ts` | 5, 16 | Idem. |
| `teamsController.ts` | 17, 39, 66, 126, 176, 198, 242, 295, 325, 360 | Função local `getTenantId(userId)` duplicada; poderia usar `req.tenantId`. |
| `clientsController.ts` | 10, 17, 44 | Função local `getTenantIdForUser` duplicada; poderia usar `req.tenantId`. |
| `funnelsController.ts` | 5, 19 | Obtém tenantId; poderia usar `req.tenantId`. |
| `projectsController.ts` | 5, 93 | Idem. |
| `tasksController.ts` | 4, 33 | Idem. |
| `projectTemplatesController.ts` | 4, 36 | Idem. |
| `leadsController.ts` | 6, 24 | Idem. |
| `projectAreasController.ts` | 4, 27, 86 | Idem. |
| `projectTasksController.ts` | 5, 88, 181, 422 | Várias chamadas; poderia usar `req.tenantId`. |
| `projectListsController.ts` | 4, 17, 52 | Idem. |

**Conclusão:** O middleware já define `req.tenantId` em todas as rotas tenant-scoped. **Refatoração aplicada (2026):** todos os controllers listados acima passaram a usar apenas `req.tenantId`; funções locais `getTenantId`/`getTenantIdForUser` foram removidas dos controllers. A única chamada a `getTenantIdForUser` restante é no middleware (`auth.ts`), uma vez por request.

### 2.2 Controllers que usam req.tenantId (após refatoração)

- Todos os controllers tenant-scoped usam `req.tenantId ?? null` ou `(req as AuthRequest).tenantId`. Nenhum controller chama mais `getTenantIdForUser` nem mantém função local `getTenantId`.
- `productsController.ts` — `getTenantIdOrNull(req.tenantId)` e helpers tenantScope
- `teamsController.ts` — removida função local `getTenantId`; todas as funções usam `(req as AuthRequest).tenantId`
- `clientsController.ts` — removida função local `getTenantIdForUser`; helper `clientBelongsToTenant(clientId, tenantId)` recebe `req.tenantId`
- `leadTasksController.ts` — helper `leadBelongsToTenant(leadId, tenantId)` recebe `req.tenantId`

---

## 3 — Queries sem isolamento de tenant

### 3.1 Queries consideradas seguras

- Maioria dos controllers de domínio (clients, leads, contracts, invoices, expenses, tickets, message_templates, dashboard, search, products, etc.) aplica filtro por tenant via:
  - `INNER JOIN users u ON u.id = <entity>.user_id AND u.tenant_id = $1` (com `req.tenantId`), ou
  - `WHERE user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $N))` (com `req.userId`).
- `teamsController`: uso de `tenant_id = $2` com tenantId do request.
- RLS (Etapa 5) atua como segunda barreira nas tabelas com políticas aplicadas.

### 3.2 Queries potencialmente inseguras ou a reforçar

| Arquivo | Contexto | Risco |
|---------|----------|--------|
| `ordersController.ts` | Linhas 63–64: `SELECT id, name, type FROM products WHERE id = ANY($1::uuid[])` | **Médio.** Lista de `product_id` vem do body; não há filtro por tenant. Um cliente malicioso poderia enviar IDs de produtos de outro tenant e obter nomes/tipos. **Recomendação:** restringir com `AND user_id IN (SELECT id FROM users WHERE tenant_id = $2)` usando `req.tenantId`. |
| `clientGroupsController.ts` | Linhas 25, 118, 144: `SELECT COUNT(*) FROM clients WHERE group_id = $1` | **Baixo.** O `group_id` pertence a grupos já filtrados por tenant. Para maior rigor, adicionar `AND user_id IN (SELECT id FROM users WHERE tenant_id = $2)`. |
| `chatController.ts` | Linhas 251–258: `SELECT id FROM clients WHERE user_id = $1 AND phone = ...` | **Baixo.** `user_id` é do dono da instância (já no contexto do request). Escopo por tenant garantido pelo fluxo da instância. |
| `chatController.ts` | Linhas 1976, 1990, 2024: `SELECT * FROM clients WHERE id = $1 AND user_id = $2` (e equivalente para leads) | **Baixo.** Filtro por `user_id = req.userId`; apenas o dono do registro acessa. Não vaza dados entre tenants; pode ser considerado restrito ao dono (não compartilha no tenant). |

---

## 4 — Inserts inseguros

### 4.1 Análise

- **Nenhum INSERT** foi encontrado que use `tenant_id` vindo do body. Os que gravam `tenant_id` usam valor do servidor (ex.: `teamsController` com `ensureTenantIdForInsert(req)`, `tenantsController`/auth com tenant recém-criado ou da sessão).
- **Tabelas com `user_id`:** Inserts usam `req.userId` (ou equivalente) para o dono; não foi encontrado uso de `user_id` do body para dados tenant-scoped.
- **Boas práticas já adotadas:** `teamsController` usa `stripTenantIdFromBody` e `ensureTenantIdForInsert`; `productsController` usa `ensureUserIdForInsert`.

### 4.2 Inserções que ainda não usam helpers de tenantScope

Vários controllers fazem INSERT com `user_id = req.userId!` sem usar `ensureUserIdForInsert(req)` ou `stripTenantIdFromBody` em tabelas com `tenant_id`. Funcionalmente corretos (valor vem do request), mas não padronizados:

- Ex.: `leadStatusesController`, `ticketCategoriesController`, `ticketsController`, `contractTemplatesController`, `leadsController`, `funnelStagesController`, `messageTemplatesController`, `userProfilesController`, `projectTemplatesController`, etc.

**Recomendação:** Migrar gradualmente para `ensureUserIdForInsert` / `ensureTenantIdForInsert` e `stripTenantIdFromBody` onde se aplique, para alinhar ao padrão e à documentação.

---

## 5 — Uso de user_id, created_by, updated_by, tenant_id

### 5.1 Padrão atual

- **tenant_id:** Usado em tabelas como `teams`, `tenant_plan`, `tenant_billing`, `tenant_feature_overrides`, `tenant_admin_notes`, `tenant_tags`, `users`, `project_templates` (nullable). Controllers que escrevem nessas tabelas usam `req.tenantId` ou contexto de tenant já validado.
- **user_id:** Usado como “dono” em muitas tabelas (clients, leads, products, contracts, etc.). Isolamento feito por `user_id IN (SELECT id FROM users WHERE tenant_id = ...)` ou JOIN com `users.tenant_id`.
- **created_by / updated_by:** Aparecem em várias tabelas (ex.: `profile_members`, `user_permissions`, `user_roles`). São preenchidos com `req.userId` ou equivalente; não há leitura desses campos do body para decisão de escopo.

### 5.2 Tabelas que dependem apenas de user_id (sem coluna tenant_id)

São as tabelas “dono por user_id” já cobertas pelo plano: clients, client_groups, leads, lead_statuses, lead_tasks, sales_funnels, funnel_stages, products, proposals, contracts, contract_templates, invoices, expenses, tickets, message_templates, projects, project_lists, project_tasks, tasks, notifications, user_roles, user_permissions, chat_instances, store_profiles, registration_steps, shopping_carts (user_id/store_user_id), orders (store_user_id), etc. O isolamento é feito via `users.tenant_id` nas queries e, quando ativo, pelas políticas RLS.

### 5.3 Tabelas com tenant_id

- Já listadas no plano e na migração RLS (teams, tenant_plan, tenant_billing, tenant_feature_overrides, tenant_admin_notes, tenant_tags, project_templates). Nenhuma tabela claramente “tenant-scoped” foi identificada como faltando `tenant_id` na auditoria.

---

## 6 — Helpers de tenant

### 6.1 Existência e uso

- **requireTenantId:** Existe em `middleware/auth.ts` (linha 91). Não é usado nos controllers auditados; eles usam `req.tenantId ?? null` e retornam 403 ou lista vazia quando null.
- **tenantScope (joinUserTenant, joinUserTenantByUserId, whereUserInTenantFromUserId, getTenantIdOrNull, assertTenantId, ensureTenantIdForInsert, ensureUserIdForInsert, stripTenantIdFromBody):** Implementados em `utils/tenantScope.ts` e com testes em `tenantScope.test.ts`.
- **Uso nos controllers:** Apenas **productsController** e **teamsController** usam explicitamente os helpers de `tenantScope` (joinUserTenant, joinUserTenantByUserId, whereUserInTenantFromUserId, ensureTenantIdForInsert, ensureUserIdForInsert, stripTenantIdFromBody). Os demais aplicam o mesmo critério de isolamento manualmente (JOIN/WHERE equivalente), mas não reutilizam os helpers.
- **withTenantContext:** Não existe no código; o contexto de tenant é `req.tenantId` + `setRequestDb` (RLS).

### 6.2 Recomendação

- Ampliar o uso de `tenantScope` (e, quando fizer sentido, `requireTenantId`) nos demais controllers, usando `productsController` e `teamsController` como referência, para reduzir duplicação e risco de erro.

---

## 7 — Tabelas de roles e permissions

### 7.1 Estrutura encontrada

- **user_roles** (03_create_permissions_and_roles.sql): `user_id`, `role` (enum app_role), `profile_id`, `created_by`. Escopo por tenant indireto via `user_id` e `profile_id` (user_profiles.owner_id no tenant).
- **user_permissions:** `user_id`, `profile_id`, `permission`, `created_by`. Mesmo modelo.
- **tenant_enabled_roles** (52): perfis habilitados por tenant (profile).
- **tenant_custom_roles** e **user_custom_roles** (53): roles customizados por tenant/profile.

Não existem tabelas nomeadas exatamente **roles**, **permissions** ou **role_permissions**; o modelo é **user_roles** + **user_permissions** + **tenant_enabled_roles** + **tenant_custom_roles/user_custom_roles**, com escopo por usuário e perfil (e indiretamente por tenant via owner do profile). RLS aplicado em **user_roles** e **user_permissions** na migração 57.

### 7.2 Relacionamento com tenant

- Roles e permissions são atrelados a `user_id` e `profile_id`; o tenant vem de `users.tenant_id` e de `user_profiles.owner_id`. As políticas RLS para essas tabelas usam `user_id IN (SELECT id FROM users WHERE tenant_id = app_current_tenant_id())`, alinhado ao plano.

---

## 8 — Teste lógico de isolamento (Tenant A vs Tenant B)

### 8.1 Cenários simulados

- **Usuário tenant A acessa registro do tenant B (getById):** Controllers que fazem getById usam WHERE/JOIN com tenant (via `req.tenantId` ou subquery com `req.userId`). Com RLS ativo, mesmo que a aplicação falhasse, o banco não retornaria linhas do tenant B. **Resultado:** isolamento garantido na aplicação e reforçado pelo RLS.
- **Listagens:** Listagens auditadas usam `req.tenantId` ou subquery por `req.userId`; RLS também filtra. **Resultado:** não há mistura de dados entre tenants nas listagens verificadas.
- **Updates/deletes:** UPDATE/DELETE incluem condição de tenant (ex.: `user_id IN (SELECT id FROM users WHERE tenant_id = ...)`). **Resultado:** usuário do tenant A não altera ou exclui registros do tenant B.

### 8.2 Riscos pontuais

- **ordersController — produtos por IDs:** Possível vazamento de informação (nomes/tipos de produtos) se o cliente enviar `product_id` de outro tenant (ver item 3.2).
- **Chat:** Acesso a cliente/lead por `user_id = req.userId` restringe ao dono; não há vazamento entre tenants, mas o modelo é “só dono” e não “qualquer usuário do tenant”.

---

## 9 — Score de segurança multi-tenant

### Multi-tenant safety score: **8/10**

### Riscos críticos

- Nenhum risco crítico identificado. Nenhum endpoint retorna listagens ou getById sem filtro de tenant; inserts de `tenant_id`/`user_id` não usam body; RLS está ativo nas tabelas tenant-scoped.

### Riscos médios

1. **ordersController — SELECT de produtos por IDs** (linhas 63–64): query sem filtro de tenant; possível vazamento de nomes/tipos de produtos de outro tenant. Correção: adicionar filtro por tenant (ex.: `AND user_id IN (SELECT id FROM users WHERE tenant_id = $2)` com `req.tenantId`).
2. **Redundância de getTenantIdForUser/getTenantId em vários controllers:** consultas extras ao banco e risco de inconsistência futura se alguém deixar de passar `req.tenantId` em algum path. Correção: usar sempre `req.tenantId` e, onde possível, helpers de `tenantScope`.

### Melhorias recomendadas

1. **Refatorar controllers** que ainda chamam `getTenantIdForUser` ou `getTenantId` local para usar apenas `req.tenantId` (e tenantScope quando aplicável).
2. **Corrigir SELECT de produtos em ordersController** com filtro por tenant (e validar que os `product_id` do body pertencem ao tenant antes de usar).
3. **Padronizar INSERTs** com `ensureUserIdForInsert` / `ensureTenantIdForInsert` e `stripTenantIdFromBody` nos controllers que ainda não usam.
4. **Estender uso dos helpers de tenantScope** (joinUserTenant, whereUserInTenantFromUserId, etc.) nos demais controllers, seguindo `productsController` e `teamsController`.
5. **Revisar GET /api/plans:** se a aplicação precisar de listagem pública de planos (pricing), criar endpoint ou rota sem `superadminAuth` e documentar.
6. **Opcional:** Adicionar testes E2E para cenários “tenant A não vê/altera dados do tenant B” conforme `docs/TESTES-ISOLAMENTO-TENANT.md`.

---

**Conclusão:** A implementação está alinhada ao plano de isolamento multi-tenant. O middleware de tenant está correto e aplicado em todas as rotas protegidas; as queries de domínio aplicam filtro por tenant; não há inserts inseguros com `tenant_id`/`user_id` do body. O principal ponto a corrigir é a query de produtos em `ordersController`; em seguida, a padronização com `req.tenantId` e helpers de `tenantScope` nos demais controllers.
