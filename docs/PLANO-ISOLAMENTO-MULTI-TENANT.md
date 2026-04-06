# Plano de implementação: isolamento multi-tenant global

## Objetivo

Garantir que **todas** as queries respeitem automaticamente o tenant atual, evitando vazamento de dados entre tenants e reduzindo a necessidade de o desenvolvedor lembrar manualmente do filtro.

**Regra de ouro:** todo dado pertence a um tenant; se não pertence, deve ser global ou explicitamente compartilhado.

---

## 1. Estado atual (investigação)

### 1.1 Como o tenant é identificado

| Aspecto | Situação atual |
|--------|----------------|
| **Autenticação** | JWT contém `userId` (payload). Middleware `authenticateToken` em `packages/backend/src/middleware/auth.ts` define apenas `req.userId` e `req.user`. |
| **Tenant** | **Não** existe `req.tenantId`. O tenant é obtido sob demanda via `getTenantIdForUser(userId)` em `utils/tenant.ts`, que faz `SELECT tenant_id FROM users WHERE id = $1`. |
| **Onde é usado** | Cada controller que precisa de escopo por tenant chama `getTenantIdForUser(req.userId!)` (ou equivalente) e aplica o filtro manualmente nas queries. |

Conclusão: o tenant é derivado do usuário autenticado; não há um “tenant atual” único por request.

### 1.2 Onde `tenant_id` está presente nas tabelas

**Tabelas com coluna `tenant_id` (escopo direto por tenant):**

- `users` (tenant_id) — usuário pertence a um tenant
- `tenants` — entidade tenant
- `tenant_plan`, `tenant_billing`, `tenant_feature_overrides`, `tenant_admin_notes`, `tenant_tags` — dados do tenant
- `teams` — tenant_id NOT NULL
- `project_templates` — tenant_id NULL (template sistema) ou preenchido (template do tenant)

**Tabelas apenas com `user_id` (escopo indireto: “dono” no tenant):**

- clients, client_groups, client_tasks  
- leads, lead_statuses, lead_tasks  
- sales_funnels, funnel_stages  
- products, proposals, contracts, contract_templates  
- tickets, ticket_categories, message_templates  
- invoices, expenses, notifications  
- projects, project_lists, project_tasks  
- chat_instances, chat_conversations  
- entre outras

Nestas, o isolamento hoje é feito por condição do tipo:  
`entity.user_id IN (SELECT id FROM users WHERE tenant_id = $tenantId)` ou JOIN com `users.tenant_id`.

### 1.3 Queries/endpoints que ainda podem não aplicar filtro de tenant

Conforme `docs/PLANO-PERMISSOES-VISIBILIDADE-TENANT.md`, ainda **pendentes** de escopo tenant explícito:

- **Produtos** — productsController  
- **Propostas** — proposalsController  
- **Contratos e templates** — contractsController, contractTemplatesController  
- **Tickets e categorias** — ticketsController, ticketCategoriesController  
- **Financeiro** — invoicesController, expensesController  
- **Dashboard** — dashboardController (contagens/listas)  
- **Busca** — searchController  
- **Message templates** — messageTemplatesController  
- **Chat** — chatController (lookups clientes/leads)  
- **Cart/Orders** — cartController, ordersController (se aplicável)  
- **Store/Evolution/WhatsApp** — storeProfileController e demais (se multi-tenant)

Além disso, qualquer **novo** endpoint ou query pode ser esquecido de filtrar por tenant.

---

## 2. Arquitetura alvo

```
Request (JWT)
    → authenticateToken (req.userId)
    → setCurrentTenant (req.tenantId, req.tenantContext?)
    → Rotas
        → Controller usa TenantContext / scopedPool / repository
        → Toda query recebe tenant automaticamente ou falha se não houver
```

- **Middleware** define `currentTenant` por request.  
- **Camada de acesso a dados** (base repository ou “scoped query”) aplica o filtro de tenant de forma uniforme.  
- **Validação** garante que inserts/updates em tabelas tenant-scoped sempre incluam `tenant_id` (ou `user_id` de usuário do tenant).

---

## 3. Plano por etapas

### Etapa 1 — Middleware e contexto do tenant (sem quebrar nada) ✅

**Objetivo:** Ter um “tenant atual” por request e um lugar único onde ele é definido.
**Status:** Implementado. `AuthRequest.tenantId`, middleware `setCurrentTenant`, helpers `getCurrentTenantId`/`requireTenantId`/`requireTenant`; aplicado em todas as rotas tenant-scoped (exceto superadmin).

1. **Estender o tipo da request**
   - Em `middleware/auth.ts` (ou tipo compartilhado), estender a interface para incluir:
     - `tenantId?: string | null`
   - Manter `userId` como hoje.

2. **Criar middleware `setCurrentTenant`**
   - Rodar **após** `authenticateToken` nas rotas que precisam de tenant.
   - Fazer uma única chamada a `getTenantIdForUser(req.userId!)` e atribuir a `req.tenantId`.
   - Se o usuário não tiver `tenant_id` (ex.: superadmin sem tenant), definir `req.tenantId = null` e documentar que rotas “tenant-scoped” devem rejeitar ou tratar à parte.

3. **Aplicar o middleware nas rotas**
   - Adicionar `setCurrentTenant` nas rotas de API que já usam `authenticateToken` e que devem ser tenant-scoped (excluindo apenas rotas superadmin ou globais).
   - Rotas que não precisam de tenant (ex.: auth login, health, superadmin) não usam `setCurrentTenant`.

4. **Helpers de uso**
   - Criar `getCurrentTenantId(req): string | null` e, se quiser, `requireTenantId(req): string` (lança 403 se null).
   - Controllers passam a usar `req.tenantId` ou `requireTenantId(req)` em vez de chamar `getTenantIdForUser(req.userId!)` em todo lugar (refatorar gradualmente).

**Entregável:** Todo request autenticado (exceto os explicitamente sem tenant) tem `req.tenantId` definido; nenhuma lógica de negócio nova ainda; só centralização.

---

### Etapa 2 — Auditoria e correção de endpoints sem filtro ✅

**Objetivo:** Nenhum endpoint tenant-scoped retornar dados de outro tenant.
**Status:** Implementado. Produtos, propostas, contratos, contract templates, invoices, expenses, tickets, ticket categories, message templates, dashboard (KPIs, charts, activities, tasks, stats), search global passam a filtrar por tenant (req.tenantId / JOIN com users.tenant_id).

1. **Listar todos os controllers e métodos** que leem/escrevem dados “por conta” (lista em `PLANO-PERMISSOES-VISIBILIDADE-TENANT.md`).
2. **Para cada um**, verificar:
   - Listagens: WHERE/JOIN com `tenant_id` ou `user_id IN (… tenant …)`.
   - GetById: mesma restrição.
   - Create: `user_id` = usuário do tenant (ou `tenant_id` se a tabela tiver).
   - Update/Delete: condição de tenant no WHERE.
3. **Corrigir** os que ainda filtram por `user_id = req.userId` (só “meus” dados) para escopo tenant (todos do tenant), usando `req.tenantId` ou `getTenantIdForUser`.
4. **Prioridade:** produtos, propostas, contratos, tickets, invoices, expenses, dashboard, search, message templates, chat (e cart/orders/store se aplicável).

**Entregável:** Auditoria documentada (checklist) e todos os endpoints tenant-scoped corrigidos.

---

### Etapa 3 — Camada de acesso a dados “tenant-aware”

**Objetivo:** Reduzir o risco de esquecer o filtro; não depender só de “lembrar” em cada controller.

**Opção A — Helper / query builder leve (recomendado primeiro)**

1. **Criar módulo `db/tenantScope.ts`** (ou junto a `utils/tenant.ts`):
   - `tenantUserIdsSubquery(tenantId: string): string` — retorna a subquery `(SELECT id FROM users WHERE tenant_id = $N)` para uso em SQL.
   - `assertTenantId(tenantId: string | null): asserts tenantId is string` — lança se null (para rotas que exigem tenant).
2. **Padronizar padrões de query:**
   - Tabelas com `tenant_id`: sempre `WHERE tenant_id = $tenantId` (e documentar).
   - Tabelas com `user_id`: sempre `WHERE user_id IN (tenantUserIdsSubquery(tenantId))` ou JOIN equivalente.
3. **Documentar** no código e no plano que “toda query que toca dado de tenant deve usar esse helper ou o padrão documentado”.

**Opção B — “Scoped pool” / wrapper de `pool`**

1. Criar um wrapper que recebe `tenantId` no construtor ou por request e expõe apenas métodos que já injetam o tenant (ex.: `scopedQuery(tenantId, sql, params)` que adiciona restrições ou valida que a query contém certo padrão).
2. Exige mais refatoração e convenção (ex.: todas as queries passarem por esse módulo). Pode ser uma fase posterior.

**Opção C — Row Level Security (RLS) no PostgreSQL**

1. Em tabelas com `tenant_id`, criar política RLS: `WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid`.
2. Em tabelas só com `user_id`, política: `WHERE user_id IN (SELECT id FROM users WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid)`.
3. No início de cada request, após obter `tenantId`, executar `SET LOCAL app.current_tenant_id = '...'` na mesma conexão usada para as queries daquele request (ex.: usando um pool por request ou “session”).
4. Exige: conexão por request ou uso de session; migração em todas as tabelas; tratamento de tabelas globais (sem RLS ou política permissiva). Pode ser Etapa 5.

**Recomendação:** Implementar **Etapa 3 com Opção A** primeiro; depois avaliar Opção C como segunda barreira.

**Entregável:** Módulo de helpers de tenant + documentação de padrões; controllers migrados a usar esses helpers onde fizer sentido.

**Exemplo de uso (referência):** `productsController.ts` — listagem com `joinUserTenant`, getById com `joinUserTenantByUserId`, update/delete com `whereUserInTenantFromUserId`, e `getTenantIdOrNull(req.tenantId)` para listagem vazia quando sem tenant.

---

### Etapa 4 — Validação em criação/atualização ✅

**Objetivo:** Novos registros sempre com tenant (ou user do tenant).
**Status:** Implementado. Helpers em `utils/tenantScope.ts`: `ensureTenantIdForInsert(req)`, `ensureUserIdForInsert(req)`, `stripTenantIdFromBody(body)`. Aplicado em `teamsController` (create/update) e `productsController` (create). Checklist em `docs/PADROES-TENANT-SCOPE.md`.

1. **Tabelas com `tenant_id`:**
   - Em inserts, garantir que `tenant_id` venha de `req.tenantId` (nunca do body).
   - Em updates, não permitir alterar `tenant_id` (ou validar que continua igual ao `req.tenantId`).
2. **Tabelas com `user_id`:**
   - Em inserts, garantir `user_id = req.userId` (e que `req.userId` pertence ao `req.tenantId` — já garantido pelo auth).
   - Em updates/deletes, manter a condição de tenant no WHERE (já previsto no padrão).
3. **Centralizar validação:**
   - Criar helpers do tipo `withTenantId(req, (tenantId) => { ... })` ou `ensureTenantForInsert(req, body)` que retornam o objeto já com `tenant_id` preenchido e validado.
4. **Code review / checklist:** “Todo INSERT em tabela tenant-scoped usa tenantId do request?”.

**Entregável:** Regra clara + helpers (ou exemplos) de insert/update; revisão nos controllers que criam/atualizam dados.

---

### Etapa 5 — (Opcional) Row Level Security como segunda barreira ✅

**Objetivo:** Mesmo que um controller esqueça o filtro, o banco não retorna linhas de outro tenant.
**Status:** Implementado. Migração `57_rls_tenant_isolation.sql`; funções `app_can_bypass_rls`, `app_current_tenant_id`, `app_tenant_visible`; RLS em tabelas tenant-scoped. Backend: pool wrapper + AsyncLocalStorage; middleware `setRequestDb`; rotas usam `tenantAuth`/`superadminAuth`. Ver `docs/RLS-ETAPA5.md`. Rodar `npm run migrate` para aplicar.

1. Definir quais tabelas são “tenant-scoped” e quais são “globais” (ex.: `tenants`, `plans`, configurações superadmin).
2. Para cada tabela tenant-scoped:
   - Habilitar RLS: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
   - Criar política que usa `current_setting('app.current_tenant_id', true)`.
3. No backend, garantir que toda conexão usada no request execute no início `SET LOCAL app.current_tenant_id = '<req.tenantId>'` (por exemplo, obtendo uma conexão do pool no início do request e devolvendo no fim).
4. Testes: tentar acessar com tenant A um id de registro do tenant B deve retornar vazio ou 404.

**Cuidados:** Superadmin ou rotas sem tenant precisam de política específica (ex.: bypass para usuário superadmin) ou uso de conexão sem a variável definida, dependendo do desenho.

**Entregável:** RLS ativo nas tabelas definidas; documentação e testes.

---

### Etapa 6 — Testes e documentação ✅

**Status:** Testes unitários em `tenantScope.test.ts` (Vitest); cenários E2E em `docs/TESTES-ISOLAMENTO-TENANT.md`; `PLANO-PERMISSOES-VISIBILIDADE-TENANT.md` e `CONTRIBUTING.md` atualizados; ver checklist em CONTRIBUTING.

1. **Testes automatizados:**
   - Usuário do tenant A não vê dados do tenant B (listagens e getById).
   - Usuário do tenant A não pode atualizar/excluir registro do tenant B (404 ou 403).
2. **Documentação:**
   - Atualizar `PLANO-PERMISSOES-VISIBILIDADE-TENANT.md` com o fluxo: middleware → tenantId → helpers/queries.
   - Documentar no repositório (README ou CONTRIBUTING): “Todo dado pertence a um tenant; novos endpoints devem usar req.tenantId e o padrão de queries documentado.”
3. **Checklist para novos endpoints:** “Usa req.tenantId? WHERE inclui tenant? INSERT inclui tenant_id/user_id correto?”.

---

## 4. Ordem sugerida e riscos

| Ordem | Etapa | Risco de quebrar |
|-------|--------|-------------------|
| 1 | Middleware + contexto do tenant | Baixo (só adiciona `req.tenantId`) |
| 2 | Auditoria e correção de endpoints | Médio (mudança de comportamento em listagens) |
| 3 | Helpers / padrão de queries | Baixo (introdução gradual) |
| 4 | Validação em criação/atualização | Baixo (garante consistência) |
| 5 | RLS (opcional) | Médio (exige cuidado com conexões e superadmin) |
| 6 | Testes e documentação | Nenhum |

Recomendação: fazer **1 → 2 → 3 → 4** em sequência; **5** apenas se quiser uma segunda barreira no banco; **6** em paralelo a partir da Etapa 2.

---

## 5. Modelo mental (SaaS)

```
Tenant (conta)
 ├── Users (pertencem ao tenant via users.tenant_id)
 ├── Teams (tenant_id)
 │    └── Permissions / roles
 ├── Projects (user_id → usuário do tenant)
 │    └── Members / Areas
 └── Resources (clientes, leads, etc. — user_id ou tenant_id)
```

- **Todo dado** pertence a um tenant (via `tenant_id` ou `user_id` em usuário do tenant).
- **Exceções:** dados globais (ex.: planos, features do sistema, superadmin) ou compartilhados de forma explícita (ex.: template “sistema” com `tenant_id` NULL).
- **Objetivo da arquitetura:** garantir que, por padrão, nenhum endpoint retorne ou altere dados de outro tenant e que novos desenvolvimentos sigam o mesmo padrão sem depender só da memória do desenvolvedor.

---

## 6. Resumo

1. **Middleware** define `currentTenant` (`req.tenantId`) a partir do JWT (userId).  
2. **Auditoria** garante que todos os endpoints tenant-scoped já aplicam filtro por tenant.  
3. **Helpers / padrão** de queries (e, opcionalmente, RLS) aplicam o isolamento de forma uniforme e reduzindo esquecimentos.  
4. **Validação** em inserts/updates garante que `tenant_id` (ou `user_id` do tenant) está sempre presente.  
5. **Testes e docs** fixam a regra e facilitam onboarding de novos desenvolvedores.

Com isso, o sistema passa a ter uma arquitetura explícita de isolamento multi-tenant, sem quebrar o que já funciona, e com um caminho claro para evoluir (incluindo RLS) se desejado.
