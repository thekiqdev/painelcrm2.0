# Testes de permissões — Fase 5

Documentação e checklist para validar que o Permission Engine e os controllers retornam **403** quando o usuário não tem permissão no módulo para a ação (5.1), que **own_only** é respeitado (5.2) e que o **userId** usado nas verificações vem sempre do usuário autenticado (5.3 — isolamento multi-tenant).

---

## 5.1 Testes de permissão por módulo

**Cenários a validar (por módulo):**

| Cenário | Resultado esperado |
|--------|---------------------|
| Usuário com role que tem permissão (ex.: can_create no módulo) | Sucesso (201 create / 200 update / 200 ou 204 delete) |
| Usuário com role sem permissão (ex.: viewer só can_view) | 403 com mensagem de permissão |
| Usuário sem role no tenant (ou sem profile) | 403 ou comportamento documentado |

**Módulos a cobrir:** clients, leads, projects, tasks (project_tasks), tickets, contracts, proposals, products.

### Checklist manual — create / edit / delete

Para cada módulo, testar com **dois usuários**: um com permissão (ex.: member/admin com can_create, can_edit, can_delete) e outro sem (ex.: viewer ou role com permissões restritas).

| Módulo | Create (com permissão) | Create (sem permissão) | Edit (com permissão) | Edit (sem permissão) | Delete (com permissão) | Delete (sem permissão) |
|--------|------------------------|------------------------|----------------------|----------------------|------------------------|-------------------------|
| clients | [ ] 201 | [ ] 403 | [ ] 200 | [ ] 403 | [ ] 200/204 | [ ] 403 |
| leads | [ ] 201 | [ ] 403 | [ ] 200 | [ ] 403 | [ ] 200/204 | [ ] 403 |
| projects | [ ] 201 | [ ] 403 | [ ] 200 | [ ] 403 | [ ] 200/204 | [ ] 403 |
| tasks (project_tasks) | [ ] 201 | [ ] 403 | [ ] 200 | [ ] 403 | [ ] 200/204 | [ ] 403 |
| tickets | [ ] 201 | [ ] 403 | [ ] 200 | [ ] 403 | [ ] 200/204 | [ ] 403 |
| contracts | [ ] 201 | [ ] 403 | [ ] 200 | [ ] 403 | [ ] 200/204 | [ ] 403 |
| proposals | [ ] 201 | [ ] 403 | [ ] 200 | [ ] 403 | [ ] 204 | [ ] 403 |
| products | [ ] 201 | [ ] 403 | [ ] 200 | [ ] 403 | [ ] 200 | [ ] 403 |

**Critério de conclusão 5.1:** 403 quando o usuário não tem permissão no módulo para a ação. Testes automatizados do engine em `packages/backend/src/permissions/permissionEngine.test.ts` (Vitest).

---

## 5.2 Validação de own_only

Comportamento deve estar de acordo com `REGRAS-OWN-ONLY-PERMISSOES.md`: para edit_own_only/delete_own_only, permitir apenas se **userId === ownerId** ou **userId === assigneeId** (quando existir).

### Cenários padrão

| Cenário | Resultado esperado |
|--------|---------------------|
| Role com can_edit e **edit_own_only = true**: usuário A (owner) edita recurso próprio | Sucesso (200) |
| Role com can_edit e edit_own_only: usuário B (não owner, não assignee) edita recurso de A | 403 |
| Role com can_edit e edit_own_only, recurso com assignee: usuário C (assignee) edita | Sucesso (200) |
| Idem para **delete_own_only**: owner exclui próprio → sucesso; assignee exclui → sucesso; terceiro exclui → 403 | Conforme tabela |

### Módulos com assignee (owner + assignee/responsible)

| Módulo | ownerId (fonte) | assigneeId (fonte) | Checklist manual |
|--------|------------------|---------------------|-------------------|
| **tasks** (project_tasks) | project_task.user_id | project_task.assignee_id | [ ] Owner edita/exclui [ ] Assignee edita/exclui [ ] Terceiro → 403 |
| **tickets** | ticket.user_id | ticket.assignee_id | [ ] Owner edita/exclui [ ] Assignee edita/exclui [ ] Terceiro → 403 |
| **contracts** | contract.user_id | contract.responsible_id | [ ] Owner edita/exclui [ ] Responsible edita/exclui [ ] Terceiro → 403 |
| **products** | product.user_id | product.responsible_id | [ ] Owner edita/exclui [ ] Responsible edita/exclui [ ] Terceiro → 403 |

### Módulos só owner (sem assignee)

| Módulo | ownerId (fonte) | assigneeId | Checklist manual |
|--------|------------------|------------|-------------------|
| **clients** | client.user_id | — | [ ] Owner edita/exclui [ ] Terceiro → 403 |
| **leads** | lead.user_id | — | [ ] Owner edita/exclui [ ] Terceiro → 403 |
| **projects** | project.user_id | — | [ ] Owner edita/exclui [ ] Terceiro → 403 |
| **proposals** | proposal.user_id | — | [ ] Owner edita/exclui [ ] Terceiro → 403 |

### Testes automatizados (engine)

Os cenários own_only do engine estão cobertos em `packages/backend/src/permissions/permissionEngine.test.ts`: edit com owner/assignee/nenhum; delete com owner/assignee/nenhum. Executar: `npm run test -- src/permissions/permissionEngine.test.ts`.

**Critério de conclusão 5.2:** Comportamento de own_only em conformidade com REGRAS-OWN-ONLY-PERMISSOES.md; testes automatizados do engine + checklist manual por módulo.

---

## 5.3 Isolamento multi-tenant

**Regra:** Em todas as chamadas ao Permission Engine, o `userId` deve ser **sempre** o do usuário autenticado (`req.userId`), definido pelo middleware de autenticação (JWT). **Nunca** usar `userId` vindo de body, query ou params para verificação de permissão — isso evitaria que um usuário do tenant A se passasse por outro ou obtivesse permissões de outro tenant.

### Revisão de código (checklist)

Garantir que em todos os controllers que chamam `assertModulePermission` ou que usam rotas com `requirePermission`, o `userId` passado ao engine vem de `req.userId` (ou `(req as AuthRequest).userId` / `ensureUserIdForInsert(req)` que retorna `req.userId`).

| Controller | Fonte do userId | assertModulePermission | Observação |
|------------|-----------------|------------------------|------------|
| clientsController | `req.userId!` | ✓ create, edit, delete | OK |
| leadsController | `req.userId!` | ✓ create, edit, delete | OK |
| projectsController | `(req as any).userId` | ✓ create, edit, delete | OK (req após tenantAuth) |
| projectTasksController | `(req as any).userId` | ✓ create, edit, delete | OK |
| ticketsController | `req.userId!` | ✓ create, edit, delete | OK |
| contractsController | `req.userId!` | ✓ create, edit, delete | OK |
| proposalsController | `(req as any).userId` | ✓ create, edit, delete | OK |
| productsController | `req.userId!` / `ensureUserIdForInsert(req)` | ✓ create, edit, delete | OK (ensureUserIdForInsert = req.userId) |

**requirePermission (middleware):** usa `authReq.userId` do request (definido após auth). Nenhum descriptor usa userId de body/query/params.

### Cenário opcional (validação manual)

Dois tenants (A e B); usuário do tenant A não pode obter permissões ou acessar recursos do tenant B. RLS e filtros por `tenant_id` já existem; o engine não deve receber `userId` de outro tenant — o JWT já garante o usuário do request.

**Critério de conclusão 5.3:** Nenhum controller passa `userId` de fonte não confiável para o engine; esta checklist confirma a regra. Documentação atualizada.
