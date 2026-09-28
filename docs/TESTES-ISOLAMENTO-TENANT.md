# Testes de isolamento multi-tenant (Etapa 6)

## Testes automatizados existentes

- **`packages/backend/src/utils/tenantScope.test.ts`** — testes unitários dos helpers de `tenantScope.ts`:
  - Geração correta de subqueries, JOINs e WHERE (tenantUserIdsSubquery, joinUserTenant, whereUserInTenantFromUserId, etc.).
  - assertTenantId, getTenantIdOrNull, ensureTenantIdForInsert, ensureUserIdForInsert, stripTenantIdFromBody.

Execução: `cd packages/backend && npm test` (ou `npm run test:watch`).

---

## Cenários de integração / E2E (a implementar com API + banco de testes)

Estes cenários garantem que um usuário do tenant A não veja nem altere dados do tenant B. Recomenda-se implementá-los com um banco de testes e tokens JWT de dois usuários em tenants diferentes.

### 1. Listagens

- **Cenário:** Usuário do tenant A chama `GET /api/...` (ex.: clientes, leads, produtos).
- **Esperado:** Resposta contém apenas registros cujo dono pertence ao tenant A (ou cujo `tenant_id` é o tenant A). Nenhum registro do tenant B aparece.

### 2. Get por ID

- **Cenário:** Usuário do tenant A chama `GET /api/.../ :id` com um `id` de registro que pertence ao tenant B.
- **Esperado:** `404 Not Found` (ou corpo vazio). O registro do tenant B não é retornado.

### 3. Update

- **Cenário:** Usuário do tenant A chama `PATCH /api/.../ :id` com `id` de registro do tenant B.
- **Esperado:** `404 Not Found` (ou `403 Forbidden`). O registro do tenant B não é alterado.

### 4. Delete

- **Cenário:** Usuário do tenant A chama `DELETE /api/.../ :id` com `id` de registro do tenant B.
- **Esperado:** `404 Not Found` (ou `403 Forbidden`). O registro do tenant B não é excluído.

### Módulos a cobrir

Aplicar os cenários acima aos endpoints tenant-scoped, por exemplo: clientes, client_groups, leads, lead_statuses, lead_tasks, funnels, funnel_stages, products, proposals, contracts, contract_templates, invoices, expenses, tickets, ticket_categories, message_templates, projects, project_lists, project_tasks, project_areas, project_templates, tasks, teams, user_profiles, dashboard, search.

---

## RLS (Etapa 5)

Com RLS ativo, mesmo que a aplicação omita o filtro por tenant, o banco não retorna linhas de outro tenant (desde que `SET LOCAL app.current_tenant_id` esteja definido no request). Os testes E2E acima continuam válidos para validar o comportamento de ponta a ponta.
