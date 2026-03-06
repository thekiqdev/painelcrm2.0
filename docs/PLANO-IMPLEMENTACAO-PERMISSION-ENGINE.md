# Plano de implementação do Permission Engine

**Objetivo:** Implementar o Permission Engine em fases, sem quebrar o sistema atual, com base na revisão técnica (`REVISAO-TECNICA-PERMISSION-ENGINE.md`) e na arquitetura (`ARQUITETURA-PERMISSION-ENGINE.md`).

---

## Visão geral das fases

| Fase | Nome | Objetivo |
|------|------|----------|
| 1 | Preparação da arquitetura | Unificar erro, integrar cache no resolver, definir invalidação |
| 2 | Implementação do Permission Engine | Tipos (PermissionAction, ModuleId, CheckPermissionContext), parsePermissionDescriptor, checkPermission(ctx, req?), assert, requirePermission |
| 3 | Migração gradual dos controllers atuais | clients, leads, projects, tasks → import de permissions/ |
| 4 | Permission Engine nos módulos restantes | tickets, contracts, proposals, products |
| 5 | Validação final | Testes de permissão, own_only, isolamento multi-tenant |

---

## FASE 1 — Preparação da arquitetura

**Objetivo:** Ajustes na base para suportar o engine: erro único em `errors.ts`, cache global integrado ao resolver (com versionamento), cache por request (`req.permissionMap`), versionamento de permissões (tabela + permissionVersionService) e estrutura final da pasta `permissions/`.

**Ordem sugerida de implementação na Fase 1:** (1) 1.1 — Unificar ModulePermissionError; (2) 1.6 — Tabela `user_permission_versions` e permissionVersionService (getPermissionVersion, incrementPermissionVersion), para o resolver poder usar versão na chave do cache; (3) 1.2 — Resolver com cacheKey versionado; (4) 1.3 — Tipagem req.permissionMap e fluxo no engine; (5) 1.4 — Chamadas a incrementPermissionVersion nos pontos que alteram permissões; (6) 1.5 — Estrutura/tipos na pasta permissions.

### 1.1 Unificar ModulePermissionError em errors.ts

**Problema:** A classe `ModulePermissionError` existe em dois lugares: `modulePermissionsService.ts` e `permissions/assertModulePermission.ts`. Controllers que fazem `catch (error instanceof ModulePermissionError)` dependem do módulo de onde importam; misturar imports quebra o `instanceof`.

**Ações:**

1. **Criar `permissions/errors.ts`**
   - Definir a classe `ModulePermissionError` neste arquivo (único lugar).
   - A classe deve ter: `name = 'ModulePermissionError'`, `statusCode: number` (default 403), `message: string`.

2. **Fazer o modulePermissionsService usar a classe unificada**
   - Remover a definição de `ModulePermissionError` de `modulePermissionsService.ts`.
   - Em `modulePermissionsService.ts`: importar `ModulePermissionError` de `../permissions/errors.js`.
   - Manter em `modulePermissionsService` a exportação de `ModulePermissionError` (re-export) para não quebrar os controllers que ainda importam do service.
   - Garantir que a função `assertModulePermission` do service (se ainda existir nesta fase) lance essa mesma classe.

3. **assertModulePermission e index**
   - Em `permissions/assertModulePermission.ts`: importar `ModulePermissionError` de `./errors.js`.
   - Em `permissions/index.ts`: exportar `ModulePermissionError` de `errors.ts`.

4. **Documentar**
   - No código: comentário indicando que `ModulePermissionError` é a única definição (em `errors.ts`) e que controllers podem importar de `permissions/index` ou de `modulePermissionsService` (ambos expõem a mesma classe).

**Critério de conclusão:** Existe uma única definição de `ModulePermissionError` em `permissions/errors.ts`; o service importa e reexporta; nenhum controller precisa ser alterado ainda; testes existentes que tratam 403 por permissão continuam passando.

---

### 1.2 Integrar permissionCache no modulePermissionResolver (com versionamento)

**Problema:** O resolver chama sempre `getEffectiveModulePermissions(userId)`; cada chamada gera 2–4 queries. O cache existe em `permissionCache.ts` mas não é usado. Além disso, é necessário garantir que alterações de role/custom role invalidem o cache — por isso usa-se **versionamento** na chave do cache.

**Ações:**

1. **Fluxo do resolver com versionamento (ver também 1.6)**
   - Obter versão: `version = await getPermissionVersion(userId)` (de `permissionVersionService`).
   - Chave de cache: `cacheKey = "permissions:" + userId + ":" + version`.
   - Chamar `permissionCache.get(cacheKey)`.
   - Se retorno não for null: retornar o mapa em cache.
   - Se null (cache miss):
     - Chamar `getEffectiveModulePermissions(userId)` (do `modulePermissionsService`).
     - Chamar `permissionCache.set(cacheKey, map, ttlSeconds)` com TTL configurável.
     - Retornar o mapa.

2. **Configuração do TTL**
   - Definir constante (ex.: `PERMISSION_CACHE_TTL_SECONDS = 120`) ou ler de `process.env.PERMISSION_CACHE_TTL` (opcional).
   - Com versionamento, a invalidação é feita ao incrementar a versão (nova chave); o TTL apenas limpa entradas antigas do cache.

3. **Cache opcional**
   - Se `PERMISSION_CACHE_TTL` for 0 ou não definido, o resolver pode não usar cache (sempre chamar getEffectiveModulePermissions). Ou manter cache com TTL curto por padrão.

**Critério de conclusão:** O resolver usa cacheKey `permissions:${userId}:${version}`; cache miss chama getEffectiveModulePermissions e set no cache. Uma requisição que faça duas verificações para o mesmo usuário gera apenas uma resolução; alterações de permissão disparam incrementPermissionVersion (ver 1.4 e 1.6).

---

### 1.3 Cache por request (req.permissionMap)

**Motivação:** Durante um único request o sistema pode chamar o engine várias vezes (requirePermission + assertModulePermission + outras validações). Com cache por request **por userId**, há **apenas 1 resolução de permissões por usuário por request**. Usar um mapa por userId evita conflito em cenários futuros (impersonation, sub-requests, troca de usuário no contexto).

**Ações:**

1. **Estender o tipo do Request (Express)**
   - Definir que o objeto `req` pode conter `permissionMap?: Record<string, ModulePermissionsMap>` (opcional). Chave = userId; valor = mapa de permissões daquele usuário.
   - Isso pode ser feito via declaração de módulo (augment) ou interface que estende Request (ex.: em tipos do backend ou em `permissions/permissionTypes.ts` se existir).

2. **Request cache dentro do permissionEngine.checkPermission (não no resolver)**
   - A verificação de `req.permissionMap?.[userId]` ocorre **dentro do permissionEngine.checkPermission(ctx, req?)**, antes de chamar o resolver.
   - Fluxo no engine: se `req?.permissionMap?.[userId]` existir → usar esse mapa; senão chamar `resolver(userId)` (resolver **não** recebe req). Quando o resolver retornar o mapa, o engine faz `req.permissionMap ??= {}` e `req.permissionMap[userId] = map` quando req existir.
   - O **resolver** cuida de: getPermissionVersion, permissionCache (chave com version) e getEffectiveModulePermissions. Assinatura: `resolve(userId): Promise<ModulePermissionsMap>` (sem parâmetro req).

3. **Onde passar o req**
   - `requirePermission` e `assertModulePermission` passam `req` para o **engine** (não para o resolver). O engine é o único que lê e grava `req.permissionMap[userId]`.

4. **Documentar**
   - "Uma única resolução de permissões por userId por request; req.permissionMap é Record<string, ModulePermissionsMap>."

**Critério de conclusão:** Em um request com múltiplas verificações para o mesmo userId, o mapa é resolvido uma vez e armazenado em `req.permissionMap[userId]`; chamadas seguintes reutilizam. Diferentes userIds no mesmo request têm cada um sua entrada.

---

### 1.4 Invalidação do cache via versionamento (incrementPermissionVersion)

**Objetivo:** Quando o role ou as permissões de um usuário mudarem, a próxima verificação deve usar dados atualizados. Com **versionamento** (seção 1.6), não se usa mais `permissionCache.invalidate(userId)`; em vez disso, chama-se **incrementPermissionVersion(userId)** para que a chave do cache mude (`permissions:userId:version`) e o próximo get seja MISS.

**Onde chamar incrementPermissionVersion(userId):**

| # | Local / evento | Ação | Chamada |
|---|----------------|------|---------|
| 1 | **Alteração de role ou custom role de um usuário** | PUT (ou equivalente) que altera o role ou custom role do usuário alvo | Em `myTenantPlanController.putMyTenantUserRole`, após alterar com sucesso o role ou custom role do **targetUserId**: `await incrementPermissionVersion(targetUserId)` (importar de `services/permissionVersionService.js`). |
| 2 | **Alteração de permissões de um role de sistema** | `setRoleModulePermissions(role, permissions)` (ex.: PUT em permissões do role "member") | Após persistir: buscar todos os `user_id` que possuem esse role no tenant (ex.: query em `user_roles` + `user_profiles` por tenant) e para cada um chamar `incrementPermissionVersion(userId)`. |
| 3 | **Alteração de permissões de um custom role** | `setCustomRoleModulePermissions(customRoleId, profileId, permissions)` | Após persistir: buscar todos os `user_id` em `user_custom_roles` com esse `custom_role_id` e `profile_id` e para cada um chamar `incrementPermissionVersion(userId)`. |
| 4 | **Atribuição ou remoção de custom role a um usuário** | Endpoint ou fluxo que atribui/remove custom role de um membro | Após a operação: `incrementPermissionVersion(userId)` para o usuário afetado. |

**Ações:**

1. **putMyTenantUserRole (obrigatório)**  
   - Após atualizar role ou custom role do `targetUserId`, chamar `await incrementPermissionVersion(targetUserId)`.

2. **setRoleModulePermissions**  
   - Após alterar permissões do role: obter lista de userId com esse role no tenant; para cada um, `incrementPermissionVersion(userId)`.

3. **setCustomRoleModulePermissions**  
   - Após alterar permissões do custom role: obter lista de userId com esse custom_role_id (e profile_id); para cada um, `incrementPermissionVersion(userId)`.

4. **Atribuição/remoção de custom role**  
   - Sempre que um usuário receber ou perder um custom role: `incrementPermissionVersion(userId)` para esse usuário.

**Critério de conclusão:** Todos os pontos que alteram permissões efetivas de usuários chamam `incrementPermissionVersion` nos usuários afetados; não é mais necessário `permissionCache.invalidate(userId)` (a chave com nova versão força cache MISS).

---

### 1.5 Estrutura final da pasta permissions e tipos globais

- **Estrutura da pasta `permissions/`:** `permissionTypes.ts`, `parsePermissionDescriptor.ts`, `permissionEngine.ts`, `permissionRulesEngine.ts`, `modulePermissionResolver.ts`, `assertModulePermission.ts`, `requirePermission.ts`, `permissionCache.ts`, `errors.ts`, `index.ts`.

- **permissionTypes.ts — tipagem global:**
  - **PermissionAction:** tipo global `'create' | 'view' | 'edit' | 'delete'`; usado em todo o sistema de permissões para evitar erros de digitação (ex.: "edti", "deleete").
  - **ModuleId:** union type com todos os módulos (dashboard, clients, leads, funnels, products, projects, tasks, project_templates, chat, tickets, proposals, contracts, billing, finance, settings, meu_plano); não usar `string` genérico.
  - **CheckPermissionContext:** `{ userId, tenantId, role, module, action, resource? }` para a função central do engine.
  - **PermissionDescriptor**, **AssertModulePermissionOptions**, **ModulePermissionsMap**, etc., conforme arquitetura.

- **parsePermissionDescriptor.ts:** função `parsePermissionDescriptor(descriptor: PermissionDescriptor): { module: ModuleId; action: PermissionAction }`; valida formato "module.action" e que a action é do tipo PermissionAction; evita duplicação em requirePermission.

- **Preparação para Permission Snapshot (futuro):** Documentar na arquitetura/plano que o `modulePermissionResolver` está preparado para, no futuro, tentar primeiro um snapshot (ex.: tabela `user_permission_snapshots` com JSON do mapa) e só recalcular quando necessário. Não implementar tabela nem lógica de snapshot nesta fase. *(Documentado: comentário em `modulePermissionResolver.ts`.)*

---

### 1.6 Permission Cache Invalidation — versionamento (permissionVersionService)

**Objetivo:** Garantir que o cache global use uma chave que inclua a **versão** das permissões do usuário, de modo que ao incrementar a versão (quando role/custom role ou definição de permissões mudar) a próxima leitura use nova chave e faça MISS, recalculando o mapa. Não implementar código ainda; apenas definir arquitetura, plano e onde `incrementPermissionVersion` será chamado (já definido em 1.4).

**Arquitetura:**

1. **Tabela `user_permission_versions`**
   - **user_id** (UUID, PK)
   - **version** (integer, versão atual; incrementada a cada mudança de permissões efetivas do usuário)
   - Criar em migration/init (ex.: `database/init/XX_user_permission_versions.sql`). Inicialização: ao primeiro uso, versão 0 ou INSERT (user_id, 0).

2. **Serviço `permissionVersionService.ts`**
   - **Local:** `packages/backend/src/services/permissionVersionService.ts`
   - **getPermissionVersion(userId): Promise<number>** — Lê (ou insere com 0) e retorna a versão do usuário. Usado pelo resolver para montar a cacheKey.
   - **incrementPermissionVersion(userId): Promise<void>** — Incrementa a versão (ex.: `UPDATE user_permission_versions SET version = version + 1 WHERE user_id = $1` ou INSERT se não existir). Chamado nos pontos listados em 1.4.

3. **Integração no resolver**
   - O `modulePermissionResolver` (1.2) chama `getPermissionVersion(userId)`, monta `cacheKey = "permissions:" + userId + ":" + version`, e usa essa chave em `permissionCache.get(cacheKey)` e `permissionCache.set(cacheKey, map, ttl)`.

4. **Pontos que chamam incrementPermissionVersion**
   - Ver tabela e ações em **1.4** (putMyTenantUserRole; setRoleModulePermissions para todos os userId com esse role; setCustomRoleModulePermissions para todos os userId com esse custom role; atribuição/remoção de custom role para o userId afetado).

**Não implementar ainda:** Apenas atualizar arquitetura e plano; a implementação da tabela, do serviço e das chamadas a `incrementPermissionVersion` será feita na fase de implementação (Fase 1).

**Critério de conclusão (quando implementado):** Tabela criada; permissionVersionService com get e increment; resolver usando cacheKey com version; todos os pontos de alteração de permissões chamando incrementPermissionVersion nos usuários afetados.

---

## FASE 2 — Implementação do Permission Engine

**Objetivo:** Garantir que o engine central, o assert e o middleware estejam implementados e utilizáveis, integrados ao cache e ao resolver.

### 2.1 permissionEngine.checkPermission(ctx, req?)

**Ações:**

1. **Implementação em `permissions/permissionEngine.ts`**
   - **Entrada:** `checkPermission(ctx: CheckPermissionContext, req?: Request)` onde `ctx` contém `userId`, `tenantId`, `role`, `module` (ModuleId), `action` (PermissionAction), `resource?`. O engine **não** busca tenantId nem role no banco; o caller fornece no contexto (ex.: a partir de req.tenantId e do mapa de permissões ou de req).
   - **Fluxo:** (1) **Request cache** — se `req?.permissionMap?.[ctx.userId]` existir, usar; senão chamar `resolver(ctx.userId)` e preencher `req.permissionMap[userId]` quando req existir. (2) **RBAC** — mapa de permissões (can_*). (3) **ABAC** — chamar `permissionRulesEngine.evaluateRules(user, module, action, resource?)` (user = contexto); se **false** → negar; se **null** ou **true** → continuar. (4) **own_only** — aplicar regras edit_own_only/delete_own_only usando ctx.resource (ownerId, assigneeId). (5) allow/deny.
   - **Saída:** `Promise<boolean>`.

2. **Resolver apenas cache global + getEffectiveModulePermissions**
   - O resolver tem assinatura `resolve(userId)` e cuida apenas de permissionCache e getEffectiveModulePermissions. **Futuro:** arquitetura preparada para o resolver tentar primeiro snapshot (ex.: tabela user_permission_snapshots); não implementar agora.

3. **Extensão ABAC (permissionRulesEngine)** — Ver item 2.5 abaixo. O engine chama evaluateRules entre RBAC e own_only; implementação inicial retorna sempre **null**.

**Critério de conclusão:** `checkPermission(ctx, req?)` recebe contexto completo (userId, tenantId, role, module, action, resource?); faz request cache + RBAC → ABAC → own_only; resolver só retorna mapa; engine não busca tenantId/role no banco.

---

### 2.5 Extensão RBAC + ABAC (permissionRulesEngine) — implementação inicial

**Objetivo:** Preparar a arquitetura para regras baseadas em atributos (ABAC) sem alterar o funcionamento atual. Não alterar controllers, banco nem comportamento.

**Ações:**

1. **Criar `permissions/permissionRulesEngine.ts`**
   - Exportar função `evaluateRules(user, module, action, resource?)`.
   - **Entrada:** `user` (objeto com atributos do usuário, ex.: userId, tenantId, role, teamIds, departmentId, etc.), `module`, `action`, `resource?` (atributos do recurso quando aplicável, ex.: project.teamId, client.assignedTo, ticket.departmentId).
   - **Retorno:** `true` (regra ABAC permite), `false` (regra ABAC nega) ou `null` (nenhuma regra ABAC se aplica — comportamento neutro).
   - **Implementação inicial:** retornar **sempre `null`**, de modo que nenhuma regra ABAC seja aplicada e o fluxo efetivo permaneça RBAC → own_only → allow/deny.

2. **Integrar no permissionEngine.checkPermission(ctx, req?)**
   - Após verificar RBAC (can_* no mapa) e antes de aplicar own_only: chamar `evaluateRules(user, module, action, resource?)`. O `user` pode ser o **CheckPermissionContext** (userId, tenantId, role). O `resource` pode vir de `ctx.resource` (ownerId, assigneeId). Se retorno **false** → negar (engine chama logPermissionDenied e retorna false). Se **null** ou **true** → prosseguir para own_only.

3. **Documentar**
   - Em comentário ou doc: "permissionRulesEngine preparado para regras ABAC (ex.: usuário só vê projetos da mesma equipe, só edita clientes atribuídos a ele, só vê tickets do departamento). Inicialmente retorna sempre null; não altera controllers nem banco."

**Critério de conclusão:** permissionRulesEngine existe e é chamado pelo engine entre RBAC e own_only; retorna sempre null; comportamento atual inalterado (RBAC + own_only). Nenhuma alteração em controllers nem no banco.

---

### 2.2 assertModulePermission delegando para o engine

**Ações:**

1. **Implementação em `permissions/assertModulePermission.ts`**
   - Montar **CheckPermissionContext**: `userId`, `tenantId` de `req`; `role` de req se disponível ou null (evitar chamar getUserRoleInTenant aqui — o resolver já o faz; resolver pode retornar role e engine armazenar em req); `module` = moduleId (ModuleId); `action` (PermissionAction); `resource` = options (ownerId, assigneeId) quando options existir.
   - Chamar `permissionEngine.checkPermission(ctx, req?)` (passar `req` quando disponível para request cache).
   - Se retorno true: return (não lançar).
   - Se false: o engine já terá chamado `logPermissionDenied` antes de retornar; assert apenas lança `ModulePermissionError(403, mensagem)` importada de `./errors.js`. Manter mensagens atuais para o usuário. **Não** chamar logPermissionDenied no assert (responsabilidade única do engine).

2. **Manter assinatura pública e passar req**
   - `assertModulePermission(userId, moduleId, action, options?, req?)` com `action` tipado como **PermissionAction** e `options?: AssertModulePermissionOptions`. O parâmetro `req` deve ser passado em fluxo HTTP para que o request cache seja usado (evitar múltiplas resoluções por request).

3. **ModulePermissionError**
   - Importar de `./errors.js` (Fase 1).

**Critério de conclusão:** assertModulePermission monta ctx (incluindo tenantId/role de req quando disponível), delega a checkPermission(ctx, req); em negação apenas lança ModulePermissionError (o engine já terá chamado logPermissionDenied); assinatura de chamada mantida para compatibilidade.

---

### 2.3 requirePermission middleware

**Ações:**

1. **Usar parsePermissionDescriptor**
   - Em vez de duplicar split e validação, chamar **parsePermissionDescriptor(descriptor)** que retorna `{ module: ModuleId; action: PermissionAction }`. O parser valida formato "module.action" e que a action é do tipo **PermissionAction** (ex.: lista tipada ou validação contra o tipo); se inválido, lança erro (ex.: "Invalid permission descriptor. Expected 'module.action'" ou "Invalid action").
   - Motivo: evita erros silenciosos como `requirePermission('clientscreate')` e centraliza a lógica de parse em um único lugar.

2. **Implementação em `permissions/requirePermission.ts`**
   - Receber descriptor; chamar `parsePermissionDescriptor(descriptor)` para obter `{ module, action }` (tipados como ModuleId e PermissionAction).
   - No middleware: obter `userId`, `tenantId` (e role quando disponível) de req; se userId ausente, responder 401.
   - Montar **CheckPermissionContext**: `{ userId, tenantId, role, module, action }` (sem resource para create/view).
   - Chamar `permissionEngine.checkPermission(ctx, req)` para usar request cache e obter resultado.
   - Se false: o engine já terá chamado logPermissionDenied; responder 403; se true: `next()`. **Não** chamar logPermissionDenied no middleware (responsabilidade única do engine).

3. **Uso**
   - Middleware para ações que não dependem de recurso (ex.: create). Para edit/delete com own_only, o controller usa assertModulePermission com options.

4. **Documentar**
   - Comentário: "Descriptor deve ser 'module.action'; use parsePermissionDescriptor. Para create use requirePermission; para edit/delete com own_only use assertModulePermission no controller."

**Critério de conclusão:** requirePermission usa parsePermissionDescriptor; monta ctx e chama checkPermission(ctx, req); descriptor/action inválidos lançam erro; 401/403/next() conforme resultado; request cache no engine.

---

### 2.4 logPermissionDenied

**Ações:**

1. **Criar função `logPermissionDenied`** (em `permissionEngine.ts` ou em arquivo dedicado exportado pelo index)
   - Assinatura: `logPermissionDenied({ userId, tenantId, role, module, action, ownerId?, assigneeId?, reason })`. Incluir **role** (role do usuário no tenant, ex.: admin, member) para facilitar debugging em suporte.
   - **reason:** identifica exatamente por que a permissão foi negada. Exemplos:
     - `no_module_permission` — usuário não tem permissão no módulo para a ação (ex.: can_edit false).
     - `edit_own_only_not_owner` — tem can_edit mas edit_own_only e não é owner nem assignee.
     - `delete_own_only_not_assignee` — tem can_delete mas delete_own_only e não é owner nem assignee.
   - Objetivo: registrar em log estruturado (ex.: `logger.warn` ou `console.warn` em desenvolvimento) todos os campos, para suporte e debug; o log final deve permitir identificar de forma inequívoca o motivo da negação.
   - Chamada: **apenas dentro do Permission Engine**, ao decidir negar (antes de retornar false). Assert e requirePermission **não** chamam logPermissionDenied, para evitar duplicação e centralizar o motivo (reason) no engine.

2. **Documentar**
   - Em comentário ou doc: "logPermissionDenied é chamada com userId, tenantId, **role**, module, action, ownerId/assigneeId quando aplicável e **reason**, para facilitar análise em suporte e debugging."

**Critério de conclusão:** Toda negação de permissão (403) gera log estruturado com userId, tenantId, role, module, action, ownerId/assigneeId quando aplicável e reason.

---

## FASE 3 — Migração gradual dos controllers atuais

**Objetivo:** Fazer os controllers que já usam assertModulePermission passarem a importar de `permissions/` em vez de `modulePermissionsService`, sem alterar comportamento.

### 3.1 Ordem de migração

1. clients  
2. leads  
3. projects  
4. tasks (projectTasksController)

### 3.2 Passos por controller

Para cada um dos quatro controllers:

1. **Alterar imports**
   - De: `import { assertModulePermission, ModulePermissionError } from '../services/modulePermissionsService.js';`
   - Para: `import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';`

2. **Manter todas as chamadas e passar req quando disponível**
   - Não alterar a ordem dos parâmetros (userId, moduleId, action, options). Onde o controller tiver acesso a `req` (fluxo HTTP), passar `req` como quinto parâmetro para assertModulePermission para habilitar request cache e evitar múltiplas resoluções por request.
   - Manter tratamento de erro: `catch (error instanceof ModulePermissionError)` e `res.status(error.statusCode).json({ error: error.message })`.

3. **Testar**
   - Após cada controller: smoke test (create/edit/delete) com usuário com e sem permissão; verificar 403 quando esperado.

### 3.3 Opcional: requirePermission nas rotas de create

Após a migração de imports, pode-se adicionar o middleware nas rotas de criação (redundante com o assert no controller, mas documenta a intenção e permite 403 antes de entrar no controller):

- Ex.: `router.post('/', requirePermission('clients.create'), clientsController.createClient);`
- O controller continua com `assertModulePermission(userId, 'clients', 'create')` até que se decida remover a redundância.

**Critério de conclusão:** clients, leads, projects e projectTasks importam de `permissions/`; testes manuais ou automatizados confirmam que create/edit/delete respeitam permissões e own_only como antes.

---

## FASE 4 — Aplicar Permission Engine nos módulos que ainda não usam

**Objetivo:** Introduzir assertModulePermission (e, se fizer sentido, requirePermission) em tickets, contracts, proposals e products, com ownerId/assigneeId corretos conforme `REGRAS-OWN-ONLY-PERMISSOES.md`.

### 4.1 Decisão prévia: products e assigneeId

- **Decisão:** Definir se em products se usa `responsible_id` como assigneeId para edit_own_only/delete_own_only.
  - Se sim: atualizar `REGRAS-OWN-ONLY-PERMISSOES.md` incluindo products na tabela de assignee (assigneeId = responsible_id).
  - Se não: documentar que em products apenas user_id conta como "own".

*Decisão aplicada:* **Sim** — a tabela `products` possui `responsible_id` (FK para users); usa-se como **assigneeId** para edit_own_only/delete_own_only, em linha com contracts. `REGRAS-OWN-ONLY-PERMISSOES.md` atualizado (products em owner, assignee e tabelas de referência).

### 4.2 ticketsController

**Ações:**

1. Importar `assertModulePermission` e `ModulePermissionError` de `../permissions/index.js`.
2. **Create:** No handler de criação, após validar body e antes de inserir: `await assertModulePermission(userId, 'tickets', 'create')`.
3. **Update:** No handler de atualização:
   - Carregar o ticket (já existe query por id + tenant). Garantir que o SELECT inclua `user_id` e `assignee_id`.
   - Antes de fazer UPDATE: `await assertModulePermission(userId, 'tickets', 'edit', { ownerId: row.user_id, assigneeId: row.assignee_id })`.
4. **Delete:** No handler de exclusão:
   - Carregar o ticket (ou só user_id e assignee_id). `await assertModulePermission(userId, 'tickets', 'delete', { ownerId: row.user_id, assigneeId: row.assignee_id })`.
5. Tratar erro: `catch (error instanceof ModulePermissionError) { return res.status(error.statusCode).json({ error: error.message }); }`.

**Critério de conclusão:** Criar/editar/excluir ticket exige permissão do módulo tickets; edit/delete respeitam own_only (owner ou assignee).

---

### 4.3 contractsController

**Ações:**

1. Importar `assertModulePermission` e `ModulePermissionError` de `../permissions/index.js`.
2. **Create:** Antes de inserir: `await assertModulePermission(userId, 'contracts', 'create')`.
3. **Update:** Na atualização, após carregar o contrato (com `user_id` e `responsible_id`): `await assertModulePermission(userId, 'contracts', 'edit', { ownerId: row.user_id, assigneeId: row.responsible_id })`.
4. **Delete:** Após carregar o contrato: `await assertModulePermission(userId, 'contracts', 'delete', { ownerId: row.user_id, assigneeId: row.responsible_id })`.
5. Tratar ModulePermissionError com 403.

**Critério de conclusão:** Create/edit/delete de contrato exigem permissão; edit/delete respeitam own_only (owner ou responsible como assignee).

---

### 4.4 proposalsController

**Ações:**

1. Importar `assertModulePermission` e `ModulePermissionError` de `../permissions/index.js`.
2. **Create:** Antes de inserir: `await assertModulePermission(userId, 'proposals', 'create')`.
3. **Update:** Após carregar a proposta (com `user_id`): `await assertModulePermission(userId, 'proposals', 'edit', { ownerId: row.user_id })`. Sem assigneeId.
4. **Delete:** Após carregar: `await assertModulePermission(userId, 'proposals', 'delete', { ownerId: row.user_id })`.
5. Tratar ModulePermissionError com 403.

**Critério de conclusão:** Propostas exigem permissão no módulo proposals; edit/delete só para owner (user_id).

---

### 4.5 productsController

**Ações:**

1. Importar `assertModulePermission` e `ModulePermissionError` de `../permissions/index.js`.
2. **Create:** Antes de inserir: `await assertModulePermission(userId, 'products', 'create')`.
3. **Update:** Após carregar o produto (com `user_id` e, se decidido, `responsible_id`):  
   - Se products usar assignee: `assertModulePermission(userId, 'products', 'edit', { ownerId: row.user_id, assigneeId: row.responsible_id })`.  
   - Se não: `assertModulePermission(userId, 'products', 'edit', { ownerId: row.user_id })`.
4. **Delete:** Idem, com action 'delete' e mesmas options.
5. Tratar ModulePermissionError com 403.
6. Atualizar `REGRAS-OWN-ONLY-PERMISSOES.md` conforme decisão sobre responsible_id.

**Critério de conclusão:** Products exige permissão no módulo; edit/delete seguem regra own_only definida (só owner ou owner+assignee se adotado).

---

## FASE 5 — Validação final

**Objetivo:** Garantir que permissões, own_only e isolamento multi-tenant funcionam conforme arquitetura e revisão técnica.

### 5.1 Testes de permissão

**Ações:**

1. **Cenários por módulo (create / edit / delete)**
   - Usuário com role que tem permissão (ex.: can_create no módulo): sucesso (201/200/204).
   - Usuário com role sem permissão (ex.: viewer só can_view): 403 com mensagem esperada.
   - Usuário sem role no tenant (ou sem profile): 403 ou comportamento documentado.

2. **Módulos a cobrir**
   - clients, leads, projects, tasks (project_tasks), tickets, contracts, proposals, products.

3. **Formato**
   - Testes automatizados (ex.: Vitest/supertest) para pelo menos um módulo (ex.: clients) como referência; ou checklist de testes manuais documentado para todos.

**Critério de conclusão:** Documentação ou suite de testes que validem 403 quando o usuário não tem permissão no módulo para a ação.

---

### 5.2 Validação de own_only

**Ações:**

1. **Cenários**
   - Role com can_edit mas edit_own_only = true: usuário A (owner) edita recurso próprio: sucesso; usuário B (não owner, não assignee) edita recurso de A: 403.
   - Role com can_edit e edit_own_only, recurso com assignee: usuário C (assignee) edita: sucesso.
   - Idem para delete_own_only.

2. **Módulos com assignee**
   - tasks (project_tasks): owner e assignee podem editar/excluir quando edit_own_only/delete_own_only.
   - tickets: owner e assignee.
   - contracts: owner e responsible (assigneeId).

3. **Registro**
   - Resultados em documento de teste ou casos de teste automatizados.

**Critério de conclusão:** Comportamento de own_only está de acordo com REGRAS-OWN-ONLY-PERMISSOES.md em todos os módulos que suportam edit_own/delete_own.

**Validação 5.2:** Testes automatizados em `permissionEngine.test.ts` cobrem edit_own_only e delete_own_only (owner, assignee, terceiro). Documento `TESTES-PERMISSOES-FASE5.md` expandido com checklist manual por módulo (tasks, tickets, contracts, products com owner+assignee; clients, leads, projects, proposals só owner).

---

### 5.3 Validação de isolamento multi-tenant

**Ações:**

1. **Regra**
   - userId em todas as chamadas ao engine deve ser o do usuário autenticado (req.userId). Nunca usar userId vindo de body, query ou params para verificação de permissão.

2. **Revisão de código**
   - Garantir que em todos os controllers que chamam assertModulePermission ou que usam requirePermission, o userId usado é req.userId (ou equivalente do AuthRequest).

3. **Cenário (opcional)**
   - Dois tenants; usuário do tenant A não pode obter permissões ou acessar recursos do tenant B. RLS e filtros por tenant já existem; o engine não deve receber userId de outro tenant (o JWT já garante o usuário do request).

**Critério de conclusão:** Nenhum controller passa userId de fonte não confiável para o engine; documentação ou checklist confirma a regra.

**Validação 5.3:** Revisão de código confirmou que todos os controllers que chamam assertModulePermission (clients, leads, projects, projectTasks, tickets, contracts, proposals, products) usam userId de req.userId ou ensureUserIdForInsert(req). requirePermission usa authReq.userId. Checklist e regra documentados em TESTES-PERMISSOES-FASE5.md § 5.3.

---

## Resumo das entregas por fase

| Fase | Entregas |
|------|----------|
| 1 | ModulePermissionError única em errors.ts; cache global no resolver com **versionamento** (cacheKey = permissions:userId:version); permissionVersionService (getPermissionVersion, incrementPermissionVersion) e tabela user_permission_versions; cache por request (req.permissionMap); chamadas a incrementPermissionVersion nos pontos de alteração de permissões (1.4); estrutura final da pasta permissions |
| 2 | permissionTypes (PermissionAction, ModuleId, CheckPermissionContext); parsePermissionDescriptor; permissionEngine.checkPermission(ctx, req?) com fluxo RBAC → ABAC → own_only; permissionRulesEngine (retorna null); assert (monta ctx, chama checkPermission); requirePermission (usa parsePermissionDescriptor, monta ctx); logPermissionDenied |
| 3 | clients, leads, projects, projectTasks importando de permissions/; testes smoke |
| 4 | tickets, contracts, proposals, products com assertModulePermission e options corretos; decisão products/assignee; atualização REGRAS se necessário |
| 5 | Testes/checklist de permissão, own_only e multi-tenant; documentação final |

---

## Ordem de execução e dependências

- **Fase 1** deve ser concluída antes da Fase 2 (cache e erro são base do engine).
- **Fase 2** pode ser feita em paralelo à Fase 3 se os stubs do engine já existirem; na prática, concluir 2 antes de 3 para garantir que o assert do permissions/ está estável.
- **Fase 3** depende da Fase 2 (controllers passam a usar o assert do permissions/).
- **Fase 4** depende da Fase 2 (e opcionalmente 3); pode ser feita após 3 ou em paralelo a 3 (módulos diferentes).
- **Fase 5** após 3 e 4 (validação em todos os módulos).

Não implementar nada além do descrito neste plano; este documento é apenas o plano detalhado de implementação.

---

## Arquitetura atualizada e validade da Fase 1

### Arquitetura atualizada (resumo)

- **Tipagem global:** **PermissionAction** = 'create' | 'view' | 'edit' | 'delete'; **ModuleId** = union type com todos os módulos; **CheckPermissionContext** = { userId, tenantId, role, module, action, resource? }. Uso em todo o sistema de permissões.
- **Parser:** **parsePermissionDescriptor(descriptor)** → { module: ModuleId; action: PermissionAction }; usado em requirePermission; evita duplicação e erros de digitação.
- **Contexto do engine:** **checkPermission(ctx, req?)** recebe contexto completo; engine não busca tenantId/role no banco.
- **Request cache:** `req.permissionMap` é `Record<string, ModulePermissionsMap>` (por userId). Primeira chamada para um userId preenche `req.permissionMap[userId]`; chamadas seguintes reutilizam.
- **Cache global e versionamento:** Resolver obtém `version = getPermissionVersion(userId)` (permissionVersionService); chave de cache `permissions:${userId}:${version}`; permissionCache.get(cacheKey); em MISS, getEffectiveModulePermissions e set(cacheKey, map). Invalidação: **incrementPermissionVersion(userId)** nos pontos que alteram role/custom role ou definição de permissões (putMyTenantUserRole; setRoleModulePermissions para todos com esse role; setCustomRoleModulePermissions para todos com esse custom role; atribuição/remoção de custom role). Tabela `user_permission_versions` (user_id, version); serviço em `services/permissionVersionService.ts`. **Futuro:** snapshot (user_permission_snapshots).
- **Log de negação:** Antes de 403, chamar `logPermissionDenied({ userId, tenantId, role, module, action, ownerId?, assigneeId?, reason })`.
- **Validação em requirePermission:** Usar **parsePermissionDescriptor**; action tipada como **PermissionAction**.
- **Estrutura final:** `permissionTypes.ts`, `parsePermissionDescriptor.ts`, `permissionEngine.ts`, `permissionRulesEngine.ts`, `modulePermissionResolver.ts`, `assertModulePermission.ts`, `requirePermission.ts`, `permissionCache.ts`, `errors.ts`, `index.ts`.
- **Extensão RBAC + ABAC:** Fluxo: RBAC → evaluateRules(user, module, action, resource?) → own_only → allow/deny. evaluateRules **inicial: sempre null**. Preparado para snapshot no resolver (apenas documentação).

### Onde entram os novos componentes

| Componente | Onde entra |
|------------|------------|
| **req.permissionMap** | Tipo `Record<string, ModulePermissionsMap>`. **Engine** verifica e preenche `req.permissionMap[userId]` (não o resolver). Resolver só retorna mapa (cache global + getEffectiveModulePermissions). |
| **logPermissionDenied** | Chamada antes de 403 com `{ userId, tenantId, role, module, action, ownerId?, assigneeId?, reason }`. **role** para debugging; **reason** identifica o motivo. |
| **Validação em requirePermission** | (1) Descriptor deve conter `"."` (formato "module.action"); (2) action deve estar em `allowedActions = ["create", "view", "edit", "delete"]`. Senão lançar erro. |
| **errors.ts** | Única definição de ModulePermissionError. assertModulePermission e index importam/reexportam; modulePermissionsService importa e reexporta para compatibilidade. |

### Confirmação: Fase 1 permanece válida

A Fase 1 continua sendo a base necessária antes da implementação do engine:

1. **Unificar ModulePermissionError em errors.ts** — Segue válido; agora com destino explícito em `permissions/errors.ts`.
2. **Integrar permissionCache no modulePermissionResolver** — Segue válido; resolver usa cache global (get/set) com TTL e invalidação.
3. **Cache por request (req.permissionMap)** — Incluído na Fase 1 (item 1.3); verificação e preenchimento **no engine** (antes de chamar o resolver); resolver só retorna mapa (cache global + getEffectiveModulePermissions); engine preenche `req.permissionMap[userId]`.
4. **Invalidação via versionamento** — Item 1.4 e 1.6: usar **incrementPermissionVersion(userId)** em putMyTenantUserRole (targetUserId); em setRoleModulePermissions (todos os userId com esse role); em setCustomRoleModulePermissions (todos os userId com esse custom role); ao atribuir/remover custom role (userId afetado). Tabela user_permission_versions e permissionVersionService em services/.
5. **Estrutura final da pasta permissions** — Incluído na Fase 1 (item 1.5); pasta com permissionEngine, modulePermissionResolver, assertModulePermission, requirePermission, permissionCache, errors, index.

A Fase 2 passa a incluir: request cache **no engine** (verificação de req.permissionMap[userId] antes de chamar resolver; resolver sem req); logPermissionDenied com role; validação de action em requirePermission (allowedActions). Nenhuma implementação de código foi feita; apenas o plano e a arquitetura foram atualizados.

---

## Revisão final — consistência com arquitetura e riscos

**Consistência:** O plano está alinhado com `ARQUITETURA-PERMISSION-ENGINE.md` e `DIAGRAMA-ARQUITETURA-PERMISSION-ENGINE.md`: função central **checkPermission(ctx, req?)**, resolver com **cacheKey = permissions:userId:version**, **permissionVersionService** (getPermissionVersion, incrementPermissionVersion), **logPermissionDenied** apenas no engine, assert e requirePermission montam ctx e delegam.

**Responsabilidades (sem duplicação):** permissionEngine = request cache + RBAC + ABAC + own_only + logPermissionDenied ao negar; assertModulePermission = montar ctx, chamar checkPermission, lançar ModulePermissionError (não chama log); requirePermission = parsePermissionDescriptor, montar ctx, chamar checkPermission, 401/403/next (não chama log); modulePermissionResolver = getPermissionVersion → cacheKey → permissionCache + getEffectiveModulePermissions.

**Riscos mitigados:** (1) Múltiplas queries — request cache (req.permissionMap) e cache global com versionamento; assert/requirePermission devem passar req em fluxo HTTP. (2) Loops de dependência — engine nunca importa modulePermissionsService; apenas o resolver acessa o service; permissionVersionService em services/ é consumido pelo resolver e pelos pontos de alteração. (3) Quebra do sistema atual — ModulePermissionError reexportada pelo modulePermissionsService; Fase 3 altera apenas imports nos controllers; assinatura de assertModulePermission mantida (req opcional).

---

## Checklist de Implementação

Use os checkboxes abaixo para acompanhar o progresso. Cada fase deve ter implementação concluída e testes realizados antes de seguir para a próxima.

### Fase 1 — Preparação da arquitetura

- [x] **1.1** Unificar ModulePermissionError em errors.ts
- [x] **1.6** Tabela user_permission_versions e permissionVersionService (getPermissionVersion, incrementPermissionVersion)
- [x] **1.2** Integrar permissionCache no modulePermissionResolver (com versionamento)
- [x] **1.3** Cache por request (req.permissionMap) e tipagem
- [x] **1.4** Chamadas a incrementPermissionVersion nos pontos de alteração de permissões
- [x] **1.5** Estrutura final da pasta permissions e tipos globais (permissionTypes, parsePermissionDescriptor)

**Fase 1 — Controle**

- [x] Implementação concluída
- [x] Testes realizados (erro unificado, cache com versão, request cache, incrementVersion nos pontos corretos)

*Validação Fase 1:* Build do backend ok. Pontos de `incrementPermissionVersion`: (1) `putMyTenantUserRole` — custom role e role de sistema; (2) `setRoleModulePermissions` — todos os `user_id` com esse role; (3) `setCustomRoleModulePermissions` — todos os `user_id` com esse custom role. Request cache em `permissionEngine.check(..., req)` e em `requirePermission`/`assertModulePermission`. `ModulePermissionError` unificado em `permissions/errors.ts`. Resolver usa `permissions:userId:version` e TTL.

---

### Fase 2 — Implementação do Permission Engine

- [x] **2.1** permissionEngine.checkPermission(ctx, req?)
- [x] **2.5** permissionRulesEngine (evaluateRules → null)
- [x] **2.2** assertModulePermission delegando para checkPermission
- [x] **2.3** requirePermission middleware (parsePermissionDescriptor, checkPermission)
- [x] **2.4** logPermissionDenied (apenas no engine)

**Fase 2 — Controle**

- [x] Implementação concluída
- [x] Testes realizados (checkPermission, assert, requirePermission, log de negação)

*Validação Fase 2:* Build ok. checkPermission(ctx, req?) com fluxo request cache → RBAC → ABAC (evaluateRules) → own_only. assertModulePermission monta ctx (tenantId/role de req), chama checkPermission(ctx, req). requirePermission usa parsePermissionDescriptor, monta ctx e chama checkPermission(ctx, req). logPermissionDenied chamada apenas no engine em cada ponto de negação (no_module_permission, edit_own_only_not_owner, delete_own_only_not_assignee, abac_denied); assert e requirePermission não chamam log.

---

### Fase 3 — Migração gradual dos controllers atuais

- [x] **3.1–3.2** clients, leads, projects, projectTasks: import de permissions/; passar req onde disponível
- [x] **3.3** (Opcional) requirePermission nas rotas de create

**Fase 3 — Controle**

- [x] Implementação concluída
- [x] Testes realizados (smoke: create/edit/delete com e sem permissão; 403 quando esperado)

*Validação Fase 3:* clientsController, leadsController, projectsController e projectTasksController passaram a importar `assertModulePermission` e `ModulePermissionError` de `../permissions/index.js`. Todas as chamadas a `assertModulePermission` passam `req` como 5º parâmetro (request cache e tenantId/role no contexto). Em projectsController e projectTasksController (handlers com `Request`) foi usado `req as AuthRequest` ao passar para assert. Tratamento de erro `ModulePermissionError` mantido. Build ok.

---

### Fase 4 — Permission Engine nos módulos restantes

- [x] **4.1** Decisão products/assigneeId
- [x] **4.2** ticketsController
- [x] **4.3** contractsController
- [x] **4.4** proposalsController
- [x] **4.5** productsController

**Fase 4 — Controle**

- [x] Implementação concluída
- [x] Testes realizados (create/edit/delete em tickets, contracts, proposals, products; own_only respeitado)

*Validação Fase 4:* 4.1 — Decisão products: assigneeId = responsible_id; REGRAS atualizado. 4.2 tickets: assert create/edit/delete com ownerId + assigneeId (user_id, assignee_id). 4.3 contracts: assert create/edit/delete com ownerId + assigneeId (user_id, responsible_id). 4.4 proposals: assert create/edit/delete só ownerId (user_id). 4.5 products: assert create/edit/delete com ownerId + assigneeId (user_id, responsible_id). Todos com ModulePermissionError tratado (403). Build ok.

---

### Fase 5 — Validação final

- [x] **5.1** Testes de permissão (por módulo)
- [x] **5.2** Validação de own_only
- [x] **5.3** Validação de isolamento multi-tenant

**Fase 5 — Controle**

- [x] Implementação concluída
- [x] Testes realizados (checklist ou suite automatizada documentada)

*Validação Fase 5:* 5.1 — Testes automatizados em `permissionEngine.test.ts` (15 testes Vitest) cobrindo RBAC (can_create/view/edit/delete), edit_own_only (owner, assignee, terceiro) e delete_own_only (owner, assignee, terceiro); checklist manual em `TESTES-PERMISSOES-FASE5.md` para todos os módulos. 5.2 — Cenários own_only documentados e checklist por módulo (com/sem assignee); engine testado. 5.3 — Revisão de código confirmou que todos os controllers usam `req.userId` (ou equivalente) para assertModulePermission; requirePermission usa `authReq.userId`; regra e checklist em TESTES-PERMISSOES-FASE5.md § 5.3. Suite do engine: 15 testes passando.

---

## Status do Plano

**Revisão:** O plano foi revisado para consistência com a arquitetura e o diagrama. Ajustes feitos: uso consistente de **checkPermission(ctx, req?)** (não `check`); responsabilidade única de **logPermissionDenied** no engine; ordem sugerida de implementação na Fase 1 (1.1 → 1.6 → 1.2 → 1.3 → 1.4 → 1.5); orientação para passar **req** em assertModulePermission em fluxo HTTP.

**Status:** **Implementação concluída (Fases 1 a 5).** Todas as fases do plano foram executadas: Fase 1 (preparação, cache, versionamento), Fase 2 (engine, assert, requirePermission, logPermissionDenied), Fase 3 (clients, leads, projects, tasks), Fase 4 (tickets, contracts, proposals, products), Fase 5 (testes de permissão, validação own_only, validação isolamento multi-tenant). Para manutenção futura: usar `assertModulePermission(userId, module, action, options?, req)` nos controllers; usar `requirePermission('module.action')` nas rotas de create; garantir sempre `userId = req.userId` (nunca body/query/params).
