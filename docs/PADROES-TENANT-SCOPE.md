# Padrões de escopo por tenant (tenant-scope)

Referência para uso dos helpers em `packages/backend/src/utils/tenantScope.ts`. Ver também **Etapa 3** em `docs/PLANO-ISOLAMENTO-MULTI-TENANT.md`.

## Regra

Toda query que toca dado de tenant deve usar os helpers de `tenantScope.ts` ou o padrão documentado abaixo.

## Helpers disponíveis

| Helper | Uso |
|--------|-----|
| `tenantUserIdsSubquery(tenantParamIndex)` | Subquery `(SELECT id FROM users WHERE tenant_id = $N)` para uso em IN. |
| `joinUserTenant(entityAlias, userColumn, tenantParamIndex)` | JOIN para **listagens** quando você tem `req.tenantId` (ex.: `params = [tenantId, ...]`). |
| `joinUserTenantByUserId(entityAlias, userColumn, userIdParamIndex)` | JOIN para **getById** quando você deriva o tenant do `req.userId` (ex.: `params = [id, userId]`). |
| `whereUserInTenant(userIdColumn, tenantParamIndex)` | WHERE para filtro por tenant (tabela com `user_id`). |
| `whereUserInTenantFromUserId(userIdColumn, userIdParamIndex)` | WHERE para **update/delete** (deriva tenant do userId; ex.: `params = [..., id, userId]`). |
| `assertTenantId(tenantId)` | Garante tenant válido; lança se null. |
| `getTenantIdOrNull(tenantId)` | Retorna `req.tenantId ?? null` para listagens que retornam `[]` sem tenant. |

### Etapa 4 — Validação em criação/atualização

| Helper | Uso |
|--------|-----|
| `ensureTenantIdForInsert(req)` | Retorna `req.tenantId` para INSERT em tabelas com `tenant_id`. Lança se não houver tenant (tratar → 403). |
| `ensureUserIdForInsert(req)` | Retorna `req.userId` para INSERT em tabelas com `user_id`. Lança se não autenticado (tratar → 401). |
| `stripTenantIdFromBody(body)` | Remove `tenant_id` do body; usar antes de parse/insert para nunca aceitar tenant_id do cliente. |

**Regras:**  
- Em tabelas com `tenant_id`: em INSERT usar sempre `ensureTenantIdForInsert(req)`; em UPDATE não permitir alterar `tenant_id` (usar `stripTenantIdFromBody` no body se aplicar).  
- Em tabelas com `user_id`: em INSERT usar sempre `ensureUserIdForInsert(req)` (ou `req.userId` já garantido pelo auth).

## Padrões de query

### Tabelas com coluna `tenant_id`

- **Listagem / filtro:** `WHERE tenant_id = $N` com `params[N-1] = req.tenantId`.
- **Update/Delete:** incluir `AND tenant_id = $N` no WHERE.

### Tabelas com coluna `user_id` (dono no tenant)

- **Listagem:**  
  `FROM entity e ${joinUserTenant('e', 'user_id', 1)} WHERE ...`  
  Params: `[req.tenantId, ...]`. Se não houver tenant, retornar `[]`.

- **Get por ID:**  
  `FROM entity e ${joinUserTenantByUserId('e', 'user_id', 2)} WHERE e.id = $1`  
  Params: `[id, req.userId]`.

- **Update:**  
  `UPDATE entity SET ... WHERE id = $x AND ${whereUserInTenantFromUserId('user_id', x+1)}`  
  Params: `[..., id, req.userId]`.

- **Delete:**  
  `DELETE FROM entity WHERE id = $1 AND ${whereUserInTenantFromUserId('user_id', 2)}`  
  Params: `[id, req.userId]`.

- **Create:** usar `user_id = ensureUserIdForInsert(req)` (ou `req.userId`); nunca aceitar `user_id` do body.

## Checklist Etapa 4 (INSERT/UPDATE tenant-scoped)

- [ ] Todo INSERT em tabela com coluna `tenant_id` usa `tenant_id = ensureTenantIdForInsert(req)` (nunca do body).
- [ ] Todo INSERT em tabela com coluna `user_id` usa `user_id = ensureUserIdForInsert(req)` (ou `req.userId`).
- [ ] Body de create/update passa por `stripTenantIdFromBody` quando a tabela tem `tenant_id`, para não aceitar `tenant_id` do cliente.
- [ ] Em UPDATE em tabelas com `tenant_id`, o WHERE já restringe por `tenant_id`; não incluir `tenant_id` nos SET.

## Verificação em desenvolvimento (`tenantSecurity.ts`)

O utilitário **`assertTenantScopedQuery(sql)`** em `utils/tenantSecurity.ts` é chamado automaticamente pelo `pool.query()` em **NODE_ENV=development**. Ele analisa SELECTs que referenciam tabelas tenant-scoped e, se não encontrar nenhum dos padrões de filtro abaixo, emite um **warning** no log:

- Uso de `tenant_id` (WHERE, JOIN, etc.)
- `user_id IN (SELECT ... FROM users WHERE tenant_id ...)`
- `JOIN users ... tenant_id` ou `FROM users ... tenant_id`

Objetivo: detectar regressões (queries sem filtro de tenant) antes de ir para produção. Em produção a função não faz nada.

## Exemplo de referência

O controller **`productsController.ts`** foi migrado para usar esses helpers:

- `getProducts`: `getTenantIdOrNull(req.tenantId)` + `joinUserTenant('p', 'user_id', 1)`.
- `getProductById`: `joinUserTenantByUserId('p', 'user_id', 2)` com `[id, userId]`.
- `createProduct`: `ensureUserIdForInsert(req)` para `user_id` no INSERT.
- `updateProduct`: `whereUserInTenantFromUserId('user_id', paramIndex + 1)` nos params `[..., id, userId]`.
- `deleteProduct`: `whereUserInTenantFromUserId('user_id', 2)` com `[id, userId]`.

O controller **`teamsController.ts`** usa os helpers da Etapa 4 para tabelas com `tenant_id`:

- `createTeam`: `ensureTenantIdForInsert(req)` para `tenant_id`; `stripTenantIdFromBody(req.body)` antes do parse.
- `updateTeam`: `stripTenantIdFromBody(req.body)` antes do parse (não permite alterar `tenant_id`).

Outros controllers podem ser migrados gradualmente para esses helpers; até lá, o padrão manual (JOIN/WHERE equivalente) continua válido desde que o filtro por tenant seja aplicado.
