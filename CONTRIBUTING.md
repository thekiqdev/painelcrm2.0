# Contribuindo

## Isolamento multi-tenant

**Regra:** Todo dado pertence a um tenant. Se algo não pertence, ele precisa ser global ou explicitamente compartilhado.

Novos endpoints que tocam dados de tenant devem:

1. Usar a cadeia de middleware **tenantAuth** (`authenticateToken`, `setCurrentTenant`, `setRequestDb`) nas rotas, para que `req.tenantId` e o contexto RLS estejam definidos.
2. Em **listagens e GET por ID**, filtrar sempre por tenant:
   - Tabelas com coluna `tenant_id`: `WHERE tenant_id = $N` com `req.tenantId`.
   - Tabelas com coluna `user_id`: usar os helpers de `packages/backend/src/utils/tenantScope.ts` (ex.: `joinUserTenant`, `joinUserTenantByUserId`) ou o padrão documentado em `docs/PADROES-TENANT-SCOPE.md`.
3. Em **INSERT**, nunca aceitar `tenant_id` ou `user_id` do body do cliente:
   - Tabelas com `tenant_id`: usar `ensureTenantIdForInsert(req)` e `stripTenantIdFromBody(body)`.
   - Tabelas com `user_id`: usar `ensureUserIdForInsert(req)` (ou `req.userId`).
4. Em **UPDATE/DELETE**, incluir condição de tenant no WHERE (ex.: `whereUserInTenantFromUserId('user_id', paramIndex)` com `req.userId`).

### Checklist para novos endpoints tenant-scoped

- [ ] A rota usa `tenantAuth` (ou `superadminAuth` para rotas de superadmin)?
- [ ] Listagem/GET usa `req.tenantId` ou helpers de `tenantScope` para filtrar por tenant?
- [ ] INSERT usa `ensureTenantIdForInsert(req)` ou `ensureUserIdForInsert(req)` conforme a tabela (e nunca lê `tenant_id` do body)?
- [ ] UPDATE/DELETE inclui condição de tenant no WHERE (ex.: via helpers de `tenantScope`)?

Documentação completa: `docs/PLANO-ISOLAMENTO-MULTI-TENANT.md`, `docs/PADROES-TENANT-SCOPE.md`, `docs/PLANO-PERMISSOES-VISIBILIDADE-TENANT.md`.
