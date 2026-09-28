# Etapa 5 — Row Level Security (RLS) para isolamento multi-tenant

## Objetivo

Garantir que, mesmo que um controller esqueça o filtro por tenant na aplicação, o banco de dados não retorne ou altere linhas de outro tenant (segunda barreira).

## O que foi implementado

### 1. Migração SQL (`database/init/57_rls_tenant_isolation.sql`)

- **Funções auxiliares:**
  - `app_can_bypass_rls()` — retorna true se `app.bypass_rls = '1'` (uso superadmin).
  - `app_current_tenant_id()` — retorna `app.current_tenant_id` da sessão (UUID ou NULL).
  - `app_tenant_visible(row_tenant_id)` — retorna true se bypass ou se o tenant da linha é o tenant atual.

- **Tabelas com coluna `tenant_id`:** RLS ativo com política `app_tenant_visible(tenant_id)` e WITH CHECK para inserts/updates.
  - Ex.: `teams`, `tenant_plan`, `tenant_billing`, `tenant_feature_overrides`, `tenant_admin_notes`, `tenant_tags`, `project_templates`.

- **Tabelas com `user_id` (ou equivalente):** política baseada em `user_id IN (SELECT id FROM users WHERE tenant_id = app_current_tenant_id())`.
  - Ex.: `clients`, `leads`, `products`, `contracts`, `invoices`, `projects`, `chat_instances`, `orders`, etc.

- **Tabelas derivadas (team_members, contract_signers, cart_items, order_items, profile_members):** política via tabela pai (team, contract, cart, order, profile).

- **Bypass:** quando `app.bypass_rls = '1'`, as políticas permitem ver/alterar todas as linhas (rotas superadmin).

**Tabelas sem RLS (globais):** `users`, `tenants`, `plans`, `profiles`, `sessions`, `system_features`, `superadmin_settings`, etc., para não quebrar login, migrações e admin.

### 2. Backend

- **`utils/db.ts`:**
  - Pool interno (`internalPool`) + `AsyncLocalStorage<{ client: PoolClient }>`.
  - `pool` exportado é um wrapper: `pool.query()` usa o client do contexto de request (se existir), senão usa o pool interno. Assim as queries do request rodam com o mesmo client onde foi feito `SET LOCAL`.

- **`middleware/auth.ts`:**
  - `setRequestDb`: para requests autenticados (`req.userId`), obtém um client do pool, executa `SET LOCAL app.current_tenant_id = $1` (com `req.tenantId ?? ''`) e, se `req.user?.is_super_admin`, `SET LOCAL app.bypass_rls = '1'`. Armazena o client no AsyncLocalStorage e chama `next()`; ao final da resposta (`res.once('finish')`) libera o client.

- **Cadeias de middleware:**
  - `tenantAuth` = `[authenticateToken, setCurrentTenant, setRequestDb]` — rotas tenant-scoped.
  - `superadminAuth` = `[authenticateToken, requireSuperAdmin, setRequestDb]` — rotas superadmin (bypass RLS).

Todas as rotas que usavam `authenticateToken` + `setCurrentTenant` ou `requireSuperAdmin` passaram a usar `...tenantAuth` ou `...superadminAuth`, garantindo que cada request autenticado use um client com as variáveis de sessão corretas.

## Como aplicar

1. Rodar as migrações: `npm run migrate` (na raiz do projeto ou conforme seu fluxo). Isso executa `57_rls_tenant_isolation.sql`.
2. Reiniciar o backend. Não é necessário alterar código nos controllers; o pool wrapper e o middleware cuidam do contexto.

## Comportamento esperado

- **Usuário com tenant:** todas as queries no request veem apenas dados do seu tenant (e as políticas RLS aplicam o filtro).
- **Superadmin:** com `app.bypass_rls = '1'`, as políticas permitem acesso a todas as linhas nas tabelas com RLS.
- **Request não autenticado (ex.: login):** não há `setRequestDb`; as queries usam o pool interno sem `SET LOCAL`, então não há contexto de tenant. Tabelas como `users` não têm RLS, então login e resolução de tenant continuam funcionando.

## Referências

- Plano geral: `docs/PLANO-ISOLAMENTO-MULTI-TENANT.md` (Etapa 5).
- Migração: `database/init/57_rls_tenant_isolation.sql`.
