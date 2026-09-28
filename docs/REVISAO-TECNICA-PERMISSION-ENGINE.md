# Revisão técnica da arquitetura do Permission Engine

**Objetivo:** Validar a arquitetura antes da implementação; identificar riscos, melhorias e ajustes necessários.

---

## 1) Segurança multi-tenant

### Análise

- **Fonte do userId:** O engine recebe apenas `userId` (e opcionalmente `ownerId`/`assigneeId` do recurso). O `userId` deve vir **sempre** do contexto autenticado (`req.userId`), nunca de body, query ou params. Nos controllers atuais isso já é o caso.
- **getEffectiveModulePermissions:** Obtém o perfil do usuário com:
  - `user_profiles` ligado a `users` onde `u.id = $1` (userId) e `o.tenant_id = u.tenant_id` (owner do profile no mesmo tenant do usuário). Ou seja, o profile é sempre do tenant do usuário autenticado. Não há parâmetro `tenantId` explícito; o isolamento vem do join.
- **role_module_permissions / custom_role_module_permissions:** São dados por profile/tenant (custom roles por `profile_id`; system roles por `role`). O resolver não recebe tenant; o profile já está implicitamente no tenant do usuário.
- **RLS:** As tabelas de dados (clients, leads, tickets, etc.) já possuem RLS por `tenant_id`/`user_id`. O Permission Engine não substitui o RLS; apenas autoriza ação (create/edit/delete) por módulo. O acesso aos dados continua filtrado pelo tenant na camada de dados.

### Riscos

| Risco | Severidade | Mitigação |
|-------|------------|-----------|
| Controller passar `userId` de outra fonte (ex.: body) | Alta | Documentar regra: "sempre usar `req.userId`". Opcional: em `requirePermission`/`assertModulePermission` não aceitar `userId` como parâmetro externo (só do request). |
| Cache por `userId` sem escopo de tenant | Baixa | O mapa de permissões já é por usuário; o usuário pertence a um tenant. Se o cache for por `userId`, não há vazamento entre tenants. Garantir que a chave de cache seja apenas `userId` (não incluir tenant na chave para não confundir). |

### Conclusão

Não há vazamento de dados entre tenants pela arquitetura atual, desde que o `userId` usado em todas as chamadas ao engine seja **sempre** o do usuário autenticado (`req.userId`). Recomenda-se deixar isso explícito na documentação e no código (comentários ou validação em desenvolvimento).

---

## 2) Integração com o sistema atual

### getEffectiveModulePermissions como fonte de verdade

- **Situação:** O `modulePermissionResolver` chama apenas `getEffectiveModulePermissions(userId)` do `modulePermissionsService`. Não há duplicação de lógica de resolução (role, custom role, profile).
- **Conclusão:** A fonte de verdade é mantida. Nenhum ajuste necessário.

### Controllers atuais não quebrem

- **Situação:** Os controllers (clients, leads, projects, projectTasks) importam `assertModulePermission` e `ModulePermissionError` de `../services/modulePermissionsService.js`. A nova pasta `permissions/` exporta uma função e classe com o **mesmo nome e assinatura**, mas são implementações distintas.
- **Risco:** Se um controller migrar para `import { assertModulePermission, ModulePermissionError } from '../permissions/index.js'`, o comportamento é o mesmo (ambos delegam à mesma lógica de permissão). Porém, `ModulePermissionError` está definida em **dois lugares** (modulePermissionsService e permissions/assertModulePermission). Um `catch (error instanceof ModulePermissionError)` no controller só reconhece a classe do módulo de onde importou. Se misturar imports (alguns de services, outros de permissions), o `instanceof` pode falhar.
- **Recomendação:** Definir `ModulePermissionError` em **um único lugar** (por exemplo `permissions/assertModulePermission.ts` ou `permissions/errors.ts`) e no `modulePermissionsService` reexportar ou fazer o `assertModulePermission` antigo delegar para o novo e lançar a mesma classe. Assim, tanto quem importa de `services` quanto de `permissions` usa a mesma classe de erro.

### assertModulePermission – mesma assinatura

- **Situação:** A assinatura em `permissions/assertModulePermission.ts` é:
  - `assertModulePermission(userId, moduleId, action, options?)` com `action: 'create'|'edit'|'delete'` e `options?: { ownerId?, assigneeId? }`.
- O `modulePermissionsService` usa a mesma assinatura.
- **Conclusão:** Compatível. Nenhum ajuste necessário na assinatura.

### Ajustes recomendados na integração

1. **Unificar ModulePermissionError:** Ter uma única definição (ex.: em `permissions/`) e fazer o `modulePermissionsService.assertModulePermission` importar e usar essa classe, ou reexportar `assertModulePermission` e `ModulePermissionError` de `permissions/` a partir do service (thin re-export).
2. **Documentar migração:** No plano de implementação, indicar que os controllers podem migrar o import de `modulePermissionsService` para `permissions/index` sem alterar chamadas; após migração, considerar deprecar a exportação de `assertModulePermission` no service.

---

## 3) Performance

### Cache proposto

- **Situação:** Existe `permissionCache.ts` com interface `PermissionCacheAdapter` e implementação em memória (get/set/invalidate por `userId`). Porém, o **permissionEngine** e o **modulePermissionResolver** **não utilizam o cache**. Cada chamada a `check()` ou `assertModulePermission()` dispara uma nova chamada a `resolveModulePermissions()` → `getEffectiveModulePermissions()`, que executa várias queries (profile, custom role, role, mapa de permissões).
- **Risco:** Em um mesmo request, múltiplas verificações (ex.: requirePermission na rota + assertModulePermission no controller para create, ou várias asserts em um mesmo controller) geram **múltiplas vezes** o mesmo fluxo de resolução e as mesmas queries.

### Quantidade de queries por request

- **getEffectiveModulePermissions:** 1 query (profile) + condicionalmente 1 (getUserCustomRoleInProfile) + 1 (getUserRoleInTenant ou getCustomRoleModulePermissions) + 1 (getRoleModulePermissions ou getCustomRoleModulePermissions). Na prática, 2 a 4 queries por chamada.
- Se um request fizer 2 asserts (ex.: rota com requirePermission + controller com assert), são 2 × (2–4) = 4–8 queries só de permissão.

### Melhorias sugeridas

1. **Integrar o cache no resolver:** No `modulePermissionResolver.resolveModulePermissions(userId)`, antes de chamar `getEffectiveModulePermissions`, consultar o cache (por exemplo `permissionCache.get(userId)`). Em cache hit, retornar o mapa; em cache miss, chamar `getEffectiveModulePermissions`, armazenar no cache (TTL curto, ex.: 60–300 s) e retornar. Assim, múltiplas verificações no mesmo request (e em requests seguintes do mesmo usuário) reutilizam o mapa.
2. **Cache por request (opcional):** Para evitar até mesmo uma segunda chamada ao cache no mesmo request, o resolver pode usar um `AsyncLocalStorage` ou um Map keyed por request (ex.: `requestId` ou closure) para guardar o mapa de permissões já resolvido para aquele `userId` naquele request. Assim, a primeira assert do request preenche e as seguintes leem do contexto do request.
3. **Invalidação:** Ao alterar role ou custom role do usuário (ex.: em `putMyTenantUserRole` ou ao editar permissões de um custom role), chamar `permissionCache.invalidate(userId)` para os usuários afetados (e, se usar Redis, para todos os nós).

### Conclusão

O cache atual **não está integrado** ao fluxo; sem isso, há risco de muitas queries por request quando há várias verificações. **Ajuste recomendado antes/durante a implementação:** usar o cache dentro do `modulePermissionResolver` (cache hit → retornar mapa; cache miss → getEffectiveModulePermissions + set no cache) e definir pontos de invalidação quando roles/permissions forem alterados.

---

## 4) Consistência das regras own_only

### Regra atual

- **Permitir** se `userId === ownerId` **ou** `userId === assigneeId` (quando informado).
- **ownerId** = `user_id` do registro; **assigneeId** = `assignee_id` ou `responsible_id` conforme o módulo (ver `REGRAS-OWN-ONLY-PERMISSOES.md`).

### Verificação por módulo

| Módulo    | Tabela          | user_id | assignee_id / responsible_id | Observação |
|-----------|------------------|---------|-------------------------------|------------|
| clients   | clients          | sim     | —                             | OK.        |
| leads     | leads            | sim     | —                             | OK.        |
| projects  | projects         | sim     | —                             | OK.        |
| tasks     | project_tasks    | sim     | assignee_id                   | OK.        |
| tickets   | tickets          | sim     | assignee_id                   | OK.        |
| contracts | contracts        | sim     | responsible_id                | OK (mapear como assigneeId). |
| proposals | proposals        | sim     | —                             | OK.        |
| products  | products         | sim     | responsible_id no schema      | Ver abaixo. |

### Produtos (products)

- No schema, a tabela `products` tem **responsible_id**.
- Em `REGRAS-OWN-ONLY-PERMISSOES.md` está definido que **products** não tem assignee (só owner).
- **Inconsistência:** O banco permite “responsável” no produto; a regra de own_only não o considera. Se no futuro o módulo products tiver `edit_own_only`/`delete_own_only`, pode fazer sentido incluir `responsible_id` como assignee para manter padrão (quem é responsável pelo produto pode editar/excluir como “own”). Ou então documentar explicitamente que em products apenas `user_id` conta como “own”, mesmo existindo `responsible_id`.

### Conclusão

A regra **ownerId OU assigneeId** é suficiente e consistente para todos os módulos cobertos por `REGRAS-OWN-ONLY-PERMISSOES.md`. **Ajuste recomendado:** Alinhar products: ou (a) incluir `responsible_id` como assigneeId quando products passar a usar assertModulePermission com own_only, ou (b) documentar que em products apenas `user_id` é usado para own_only (e `responsible_id` não afeta permissão).

---

## 5) Pontos que podem gerar bugs futuros

### Módulos que ainda não usam assertModulePermission

- **tickets**
- **contracts**
- **proposals**
- **products**

Hoje esses controllers só aplicam isolamento por tenant (e filtro por `user_id` nas queries). Qualquer usuário do tenant que consiga acessar a rota pode criar/editar/excluir desde que a query permita (ex.: “onde user_id no tenant”). Ou seja, não há checagem de “pode criar ticket?”, “pode editar este contrato?” por módulo/own.

### Riscos ao integrar o Permission Engine

1. **Ordem de verificação:** O padrão correto é: (1) carregar o recurso (ou ao menos `user_id` e, se houver, `assignee_id`/`responsible_id`); (2) chamar `assertModulePermission(userId, moduleId, action, { ownerId, assigneeId })`; (3) executar a operação. Se alguém inverter (assert antes de carregar) ou passar `ownerId`/`assigneeId` errados (ex.: do body), a regra own_only pode permitir ou negar indevidamente.
2. **Contracts – responsible_id:** O controller deve passar `assigneeId: row.responsible_id` nas options. Se esquecer, usuários com `edit_own_only`/`delete_own_only` que são apenas “responsáveis” do contrato (e não donos) serão indevidamente negados.
3. **Tickets – assignee_id:** Idem: usar `assigneeId: row.assignee_id` em edit/delete.
4. **Proposals:** Só owner (`user_id`); sem assignee. Não passar `assigneeId`.
5. **Products:** Conforme alinhamento acima: ou usar `responsible_id` como assigneeId ou só ownerId; documentar e manter consistente.
6. **Mensagem de erro:** Quando a assert falhar por own_only, a mensagem atual é genérica (“Sem permissão para editar este registro”). Pode ser aceitável; se no futuro for necessário distinguir “sem permissão no módulo” de “sem permissão por não ser dono/atribuído”, a interface do engine pode expor um código ou tipo de motivo (opcional).

### Checklist para implementação nos 4 módulos

- [ ] **tickets:** Adicionar assertModulePermission em create (sem options), em update/delete com `ownerId: row.user_id`, `assigneeId: row.assignee_id`. Garantir que a query que busca o ticket para update/delete já filtre por tenant e retorne `user_id` e `assignee_id`.
- [ ] **contracts:** Idem; em update/delete usar `ownerId: row.user_id`, `assigneeId: row.responsible_id`.
- [ ] **proposals:** create sem options; update/delete com `ownerId: row.user_id` apenas.
- [ ] **products:** create sem options; update/delete com `ownerId: row.user_id`; definir se usa `assigneeId: row.responsible_id` e documentar em REGRAS-OWN-ONLY.

---

## 6) Resumo: riscos, melhorias e ajustes

### Riscos

| # | Risco | Mitigação |
|---|--------|------------|
| 1 | Uso de `userId` de fonte não confiável (body/params) | Regra explícita: sempre `req.userId`. Documentar; opcional validar em dev. |
| 2 | Duas classes `ModulePermissionError` (services vs permissions) | Unificar em um único módulo (ex.: permissions) e reexportar ou delegar no service. |
| 3 | Múltiplas queries de permissão por request (cache não usado) | Integrar cache no resolver; opcional cache por request (AsyncLocalStorage/request-scoped map). |
| 4 | Invalidação de cache ao mudar roles/permissions | Chamar `permissionCache.invalidate(userId)` (e propagar em Redis se houver) nos endpoints que alteram role/custom role do usuário. |
| 5 | Controllers tickets/contracts/proposals/products sem assert | Incluir checklist de implementação e usar ownerId/assigneeId corretos (contracts: responsible_id como assigneeId). |
| 6 | Produtos: `responsible_id` no schema vs regra “sem assignee” | Alinhar: usar como assigneeId em products ou documentar que não conta para own_only. |

### Melhorias sugeridas

1. **Cache:** Resolver usar `permissionCache`: get antes de getEffectiveModulePermissions; set após com TTL; invalidate ao alterar role/custom role do usuário.
2. **Cache por request:** Opcional: manter mapa de permissões por (request, userId) para evitar mais de uma resolução por request.
3. **Unificação de ModulePermissionError:** Uma única definição em `permissions/`; `modulePermissionsService` reexporta ou delega e usa a mesma classe.
4. **Documentação:** Em ARQUITETURA-PERMISSION-ENGINE ou REGRAS-OWN-ONLY: “userId em todas as chamadas do engine deve ser req.userId (contexto autenticado)”.
5. **Checklist de integração:** Manter em REVISAO-TECNICA ou no plano: lista dos 4 módulos (tickets, contracts, proposals, products) com passos exatos (onde chamar assert, quais options).

### Ajustes na arquitetura antes da implementação

1. **Resolver:** Documentar que o `modulePermissionResolver` deve usar o cache (get → se null, getEffectiveModulePermissions → set → return). Implementar isso na primeira fase do engine.
2. **Erro:** Decidir onde fica `ModulePermissionError` (recomendado: `permissions/`) e fazer o service atual reexportar ou delegar para não ter duas classes.
3. **Products/own_only:** Decidir se `responsible_id` entra como assigneeId; atualizar REGRAS-OWN-ONLY e, se sim, incluir products na tabela de assignee.
4. **Pontos de invalidação:** Listar no plano os pontos de código que alteram role ou custom role do usuário e onde chamar `permissionCache.invalidate(userId)` (ex.: myTenantPlanController.putMyTenantUserRole, atualização de custom role permissions, etc.).

Com esses ajustes, a arquitetura fica pronta para implementação segura e alinhada ao sistema atual.
