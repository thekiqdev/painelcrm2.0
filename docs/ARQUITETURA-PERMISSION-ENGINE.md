# Arquitetura do Permission Engine

**Objetivo:** Definir a arquitetura final do sistema de permissões (Permission Engine), integrada ao que já existe, sem quebrar o funcionamento atual.

---

## Parte 1 — Análise do código atual

### 1.1 getEffectiveModulePermissions

**Local:** `packages/backend/src/services/modulePermissionsService.ts`

**Fluxo:**
1. Busca o `profile_id` do tenant do usuário (user_profiles via owner → users.tenant_id).
2. Se não houver profile, retorna `{}`.
3. Verifica se o usuário tem **perfil customizado:** `getUserCustomRoleInProfile(userId, profileId)`.
4. Se tiver custom role → retorna `getCustomRoleModulePermissions(customRoleId, profileId)` (tabela `custom_role_module_permissions`).
5. Senão → obtém o role do sistema com `getUserRoleInTenant(userId)` (tabela `user_roles` + user_profiles) e retorna `getRoleModulePermissions(role)` (tabela `role_module_permissions`).
6. Se não houver role, retorna `{}`.

**Retorno:** `ModulePermissionsMap` — mapa `[moduleId]: { can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only }`.

**Dependências:** `customRolesService` (getUserCustomRoleInProfile, getCustomRoleModulePermissions), `rolePermissionsService` (implícito via getRoleModulePermissions que lê role_module_permissions), `pool` (DB).

### 1.2 Onde module_permissions (role_module_permissions / custom_role_module_permissions) é utilizado

| Local | Uso |
|-------|-----|
| **modulePermissionsService** | getRoleModulePermissions(role) lê `role_module_permissions`. getEffectiveModulePermissions usa role ou custom role e retorna o mapa. setRoleModulePermissions escreve em role_module_permissions. |
| **customRolesService** | getCustomRoleModulePermissions, setCustomRoleModulePermissions leem/escrevem `custom_role_module_permissions`. createCustomRole insere em custom_role_module_permissions. |
| **assertModulePermission** | Chama getEffectiveModulePermissions(userId) e usa o mapa para decidir create/edit/delete e edit_own_only/delete_own_only. |
| **myTenantPlanController** | getEffectiveModulePermissions(userId) para GET my-permissions; getRoleModulePermissions para roles/:role/permissions; MODULE_IDS para iteração. |

### 1.3 Como os controllers verificam permissões hoje

- **Padrão:** Antes da operação sensível (create/update/delete), o controller chama `assertModulePermission(userId, moduleId, action, options?)`.
- **create:** `assertModulePermission(userId, MODULE_X, 'create')` — sem options.
- **edit:** Carrega o registro (ou só user_id/assignee_id), depois `assertModulePermission(userId, MODULE_X, 'edit', { ownerId: row.user_id, assigneeId?: row.assignee_id })`.
- **delete:** Idem com `'delete'` e options.
- **Tratamento de erro:** `catch (ModulePermissionError)` → `res.status(error.statusCode).json({ error: error.message })`.

**Controllers que usam hoje:** clientsController, leadsController, projectsController, projectTasksController. Os demais (tickets, contracts, proposals, products, etc.) ainda não chamam assertModulePermission.

**Rotas:** Não existe middleware de permissão por rota; a verificação é apenas dentro do controller.

---

## Parte 2 — Arquitetura final (estrutura)

### 2.1 Visão geral

```
┌─────────────────────────────────────────────────────────────────┐
│                        Controllers / Routes                       │
├─────────────────────────────────────────────────────────────────┤
│  requirePermission('clients.create')  │  assertModulePermission()  │
│  (middleware em rota)                 │  (dentro do controller)   │
└──────────────────────┬───────────────┴──────────────┬───────────┘
                       │                               │
                       ▼                               ▼
┌──────────────────────────────────────────────────────────────────┐
│              permissionEngine.checkPermission(ctx, req?)           │
│  ctx: { userId, tenantId, role, module, action, resource? }        │
│  Fluxo: RBAC → ABAC (permissionRulesEngine) → own_only → allow/deny │
│  → req.permissionMap[userId] ou resolver(userId)                   │
│  → logPermissionDenied({ ..., role, reason }) antes de 403         │
└──────────────────────────────────┬───────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┬─────────────────────┐
         ▼                          │                          ▼                     ▼
┌─────────────────┐                 │                ┌─────────────────────┐  ┌─────────────────────┐
│ req.permissionMap│                 │                │ modulePermission    │  │ permissionRules     │
│ (gerido pelo     │                 │                │ Resolver            │  │ Engine (ABAC)       │
│  engine)         │                 │                │ resolve(userId)     │  │ evaluateRules()     │
└─────────────────┘                 │                └──────────┬──────────┘  └─────────────────────┘
         ▲                          │                           │                     (null = não aplica)
         │ (engine lê/grava)        │  cache global             ▼                     ↑
         │                          ▼                ┌─────────────────┐    └── chamado pelo engine
         │                ┌─────────────────┐    ┌─────────────────────┐
         └────────────────│ permissionCache │    │ getEffectiveModule  │
                          │ (memory/redis)  │    │ Permissions (atual) │
                          └─────────────────┘    └─────────────────────┘
```

### 2.2 Cache de permissões por request (req.permissionMap)

**Motivação:** Em um único request o sistema pode chamar o engine várias vezes (requirePermission + assertModulePermission + outras validações). Mesmo com cache global, ainda haveria múltiplas leituras do cache. Com cache por request, há **apenas 1 resolução de permissões por usuário por request**. Usar um mapa **por userId** evita conflito em cenários futuros como impersonation, sub-requests ou troca de usuário no contexto.

**Tipo:**

- `req.permissionMap?: Record<string, ModulePermissionsMap>` — chave é o `userId`; valor é o mapa de permissões daquele usuário.

**Fluxo (request cache no Engine):**

A verificação de `req.permissionMap` ocorre **dentro do permissionEngine.checkPermission**, antes de chamar o resolver. O resolver **não** recebe `req` e **não** gerencia request cache; ele cuida apenas de cache global e getEffectiveModulePermissions.

1. **permissionEngine.checkPermission(ctx, req?)** — onde `ctx: CheckPermissionContext` contém `userId`, `tenantId`, `role`, `module`, `action`, `resource?`:
   - Se `req?.permissionMap?.[ctx.userId]` existir: usar esse mapa para aplicar as regras (sem chamar o resolver).
   - Senão: chamar `resolver(ctx.userId)` (sem passar req). O resolver retorna o mapa (consultando permissionCache e getEffectiveModulePermissions). Em seguida, no engine: se `req` existir, fazer `req.permissionMap ??= {}` e `req.permissionMap[ctx.userId] = map`. Usar o mapa para aplicar as regras.
2. Chamadas seguintes no mesmo request para o **mesmo userId** reutilizam `req.permissionMap[userId]`.

**Motivo do contexto:** o caller (middleware/controller) já tem `tenantId` e `role` no request ou pode obtê-los; passar em `ctx` evita que o engine precise buscar essas informações no banco e padroniza os dados disponíveis para `logPermissionDenied` e para o `permissionRulesEngine.evaluateRules`.

**Responsabilidade do resolver:** obter versão (permissionVersionService.getPermissionVersion), montar chave de cache `permissions:${userId}:${version}`, consultar permissionCache(cacheKey) e getEffectiveModulePermissions(userId) em caso de MISS. Assinatura: `resolve(userId): Promise<ModulePermissionsMap>` (sem parâmetro req). Ver também **2.2.1 Permission Cache Invalidation (versionamento)**.

**Exemplo de fluxo no engine:**

```ts
// Dentro de permissionEngine.checkPermission(ctx, req):
const { userId, module, action, resource } = ctx;
let map: ModulePermissionsMap;
if (req?.permissionMap?.[userId]) {
  map = req.permissionMap[userId];
} else {
  map = await resolve(userId);  // resolver não recebe req
  if (req) {
    req.permissionMap ??= {};
    req.permissionMap[userId] = map;
  }
}
// aplicar regras com map (RBAC → ABAC → own_only)...
```

**Benefício:** Uma única resolução por userId por request; responsabilidades claras: engine = request cache + regras; resolver = cache global + getEffectiveModulePermissions.

### 2.2.1 Permission Cache Invalidation (versionamento de permissões)

**Objetivo:** Evitar que permissões antigas permaneçam no cache após alterações de role ou custom role. Em vez de invalidar entradas explícitas no cache (ex.: `invalidate(userId)`), usa-se **versionamento**: a chave do cache inclui a versão; ao incrementar a versão do usuário, as chaves antigas deixam de ser consultadas e o cache efetivamente “expira” para aquele usuário.

#### Serviço: permissionVersionService

**Local:** `packages/backend/src/services/permissionVersionService.ts` (acesso a tabela `user_permission_versions`; pode ser consumido pelo resolver em `permissions/` e pelos pontos que alteram permissões).

**Funções:**

- **getPermissionVersion(userId): Promise<number>** — Retorna a versão atual das permissões do usuário (para uso na chave do cache). Se não existir registro, retorna 0 (ou insere 0 e retorna).
- **incrementPermissionVersion(userId): Promise<void>** — Incrementa a versão do usuário (INSERT ou UPDATE na tabela). Deve ser chamado sempre que as permissões efetivas daquele usuário mudarem.

#### Tabela: user_permission_versions

| Campo    | Tipo     | Descrição                    |
|----------|----------|------------------------------|
| user_id  | UUID     | PK; usuário                  |
| version  | integer  | Versão atual (incrementada a cada mudança) |

- **Inicialização:** Ao primeiro acesso, pode-se usar versão 0 ou inserir (user_id, 0). Ao incrementar, fazer `UPDATE ... SET version = version + 1` (ou equivalente).

#### Fluxo do resolver com versionamento

O **modulePermissionResolver** passa a usar a versão na chave do cache global:

```
resolver(userId)
  ↓
version = getPermissionVersion(userId)
  ↓
cacheKey = "permissions:" + userId + ":" + version
  ↓
permissionCache.get(cacheKey)
  ↓
  Se HIT → retornar mapa do cache
  Se MISS →
    map = getEffectiveModulePermissions(userId)
    permissionCache.set(cacheKey, map, ttlSeconds)
    retornar map
```

- **Efeito:** Quando `incrementPermissionVersion(userId)` é chamado, a próxima chamada a `getPermissionVersion(userId)` retorna um número maior; a nova `cacheKey` será diferente e o cache retornará MISS, forçando novo cálculo com `getEffectiveModulePermissions(userId)`. As entradas antigas (chave com versão anterior) podem permanecer no cache até o TTL; não serão mais lidas, portanto não há risco de servir permissões desatualizadas.

#### Onde chamar incrementPermissionVersion(userId)

Sempre que as **permissões efetivas** de um usuário mudarem, deve-se chamar **incrementPermissionVersion(userId)** para esse(s) usuário(s). Pontos indicados:

| # | Local / evento | Ação | Quem chama incrementPermissionVersion |
|---|----------------|------|--------------------------------------|
| 1 | **Alteração de role ou custom role do usuário** (ex.: PUT em endpoint que altera role/custom role de um membro) | Role ou custom role do usuário alvo mudou | `incrementPermissionVersion(targetUserId)` — ex.: em `myTenantPlanController.putMyTenantUserRole` após atualizar com sucesso o `targetUserId`. |
| 2 | **Alteração de permissões de um role de sistema** (ex.: `setRoleModulePermissions(role, permissions)`) | Todos os usuários que têm esse role no tenant passam a ter outro mapa | Para cada `userId` que possui esse role no tenant: `incrementPermissionVersion(userId)`. Ou: buscar todos os user_id com esse role e incrementar a versão de cada um. |
| 3 | **Alteração de permissões de um custom role** (ex.: `setCustomRoleModulePermissions(customRoleId, profileId, permissions)`) | Todos os usuários que têm esse custom role (nesse profile) passam a ter outro mapa | Para cada `userId` em `user_custom_roles` com esse `custom_role_id` (e profile_id): `incrementPermissionVersion(userId)`. |
| 4 | **Atribuição/remoção de custom role a um usuário** (ex.: atribuir ou remover custom role de um membro) | As permissões efetivas daquele usuário mudam | `incrementPermissionVersion(userId)` para o usuário afetado. |

- **Resumo:** (1) ao alterar role/custom role de **um** usuário → incrementar versão **desse** usuário; (2) ao alterar a definição de um **role de sistema** → incrementar versão de **todos** os usuários com esse role; (3) ao alterar a definição de um **custom role** → incrementar versão de **todos** os usuários com esse custom role; (4) ao atribuir/remover custom role de um usuário → incrementar versão **desse** usuário.

- **Não implementar ainda:** Apenas atualizar arquitetura e plano; definir onde `incrementPermissionVersion` será chamado. A implementação do serviço, da tabela e das chamadas fica para a fase de implementação.

### 2.2.2 Fluxo de decisão no engine (RBAC + ABAC + own_only)

Ordem de avaliação dentro de `permissionEngine.checkPermission(ctx, req?)`:

1. **RBAC** — Obter mapa de permissões (req.permissionMap ou resolver). Verificar can_create / can_edit / can_delete / can_view conforme action. Se não permitido no módulo → negar.
2. **ABAC (permissionRulesEngine)** — Chamar `evaluateRules(user, module, action, resource?)` (user pode ser o contexto: userId, tenantId, role). Retorno:
   - **true** — regra ABAC permite; continuar para own_only.
   - **false** — regra ABAC nega; negar (logPermissionDenied + 403).
   - **null** — nenhuma regra ABAC se aplica; continuar para own_only.
3. **own_only** — Se can_edit/can_delete com edit_own_only/delete_own_only, exigir userId === ownerId ou userId === assigneeId (ownerId/assigneeId vêm de `ctx.resource` ou de options). Senão → negar.
4. **allow/deny** — Permitir ou negar conforme o resultado das etapas acima.

**Extensão futura:** O `permissionRulesEngine` fica preparado na arquitetura para regras baseadas em atributos (ex.: usuário só vê projetos da mesma equipe, só edita clientes atribuídos a ele, só vê tickets do seu departamento). Na implementação inicial, `evaluateRules()` retorna **sempre null**, de modo que não há impacto no comportamento atual (RBAC + own_only permanecem iguais).

### 2.3 Log de permissões negadas (logPermissionDenied)

**Objetivo:** Facilitar suporte e debug quando clientes relatarem problemas de acesso. O log deve permitir identificar **exatamente** por que a permissão foi negada (não apenas 403).

**Função (com informações para debugging):**

```ts
logPermissionDenied({
  userId,
  tenantId,   // identificar tenant em suporte
  role,       // role do usuário no tenant (ex.: admin, member) — ajuda no debug
  module,
  action,
  ownerId?,   // opcional (recurso específico)
  assigneeId?, // opcional (recurso específico)
  reason      // motivo estruturado da negação (ver abaixo)
})
```

**Campo `reason` (exemplos):**

| reason | Significado |
|--------|-------------|
| `no_module_permission` | Usuário não tem permissão no módulo para a ação (ex.: can_edit false). |
| `edit_own_only_not_owner` | Tem can_edit mas edit_own_only e não é owner nem assignee. |
| `delete_own_only_not_assignee` | Tem can_delete mas delete_own_only e não é owner nem assignee. |

Outros valores podem ser definidos na implementação (ex.: `no_view_permission`, `module_not_found`). O importante é que o log final permita identificar de forma inequívoca o motivo da negação.

**Comportamento:**

- Chamada **dentro do Permission Engine** (ou no assert) quando a permissão é negada, **antes** de lançar `ModulePermissionError`.
- Registro em log estruturado com todos os campos (userId, tenantId, role, module, action, ownerId, assigneeId, reason) para análise em suporte e debugging.

**Local:** Implementada em `permissions/` e invocada **apenas pelo engine** ao decidir negar (antes de retornar false), passando o `reason` adequado. Assert e requirePermission **não** chamam logPermissionDenied, para evitar duplicação e centralizar o motivo da negação no engine.

### 2.4 Responsabilidades por componente

| Componente | Responsabilidade | Integra com atual |
|------------|------------------|-------------------|
| **permissionEngine** | Função central **checkPermission(ctx, req?)**. Recebe `CheckPermissionContext` (userId, tenantId, role, module, action, resource?). Fluxo: (1) Request cache + RBAC (mapa de permissões); (2) **ABAC** — chama `evaluateRules(user, module, action, resource?)`; se false → negar; se null ou true → continuar; (3) own_only; (4) allow/deny. Antes de negar, chama `logPermissionDenied`. Retorna boolean. | Fonte de verdade: getEffectiveModulePermissions via resolver. |
| **permissionRulesEngine** | Avalia regras baseadas em **atributos** (ABAC). Exporta `evaluateRules(user, module, action, resource?)` → `true \| false \| null`. **null** = nenhuma regra se aplica. **Implementação inicial:** retorna sempre **null**. Futuro: regras como "só ver projetos da mesma equipe", "só editar clientes atribuídos a ele". | Não altera controllers nem banco; preparado para extensão. |
| **modulePermissionResolver** | Obtém versão via **permissionVersionService.getPermissionVersion(userId)**; chave de cache `permissions:${userId}:${version}`; permissionCache.get(cacheKey) e getEffectiveModulePermissions em MISS. **Futuro:** snapshot (ex.: user_permission_snapshots). **Não** recebe req; **não** gerencia req.permissionMap. | Usa permissionVersionService (services/) e getEffectiveModulePermissions. |
| **permissionVersionService** | **getPermissionVersion(userId): Promise<number>** e **incrementPermissionVersion(userId): Promise<void>**. Tabela `user_permission_versions` (user_id, version). Chamado pelo resolver (para chave de cache) e pelos pontos que alteram role/custom role ou definição de permissões. | Em `services/permissionVersionService.ts`; tabela em migrations/init. |
| **assertModulePermission** | Valida ações em registros específicos (edit/delete com ownerId/assigneeId). Monta `CheckPermissionContext` a partir de userId, req (tenantId, role), module, action, resource; chama **checkPermission(ctx, req)**. Se negado (engine já terá chamado logPermissionDenied), lança ModulePermissionError(403). | Mantém assinatura atual (userId, moduleId, action, options?); internamente delega para checkPermission. **Não** chama logPermissionDenied (responsabilidade do engine). |
| **requirePermission** | Middleware Express para rotas (ex.: "clients.create"). Usa **parsePermissionDescriptor(descriptor)** para obter `{ module, action }`; valida que action é do tipo **PermissionAction** (ex.: lista tipada `ALLOWED_ACTIONS: PermissionAction[]`). Monta contexto (userId, tenantId, role do req), chama **checkPermission(ctx, req)**. Responde 401/403 ou next(). | req.userId, req.tenantId do tenantAuth; role pode vir do mapa ou de req. |
| **permissionCache** | Cache global de permissões. Usado pelo resolver com chave **permissions:{userId}:{version}** (version de permissionVersionService). Get/set por cacheKey; não é mais necessário invalidate(userId) — o versionamento garante que a próxima leitura use nova chave. | Entre resolver e getEffectiveModulePermissions; version vem de permissionVersionService. |
| **errors** | Erros padronizados de permissão (ex.: ModulePermissionError). Única definição para todo o módulo permissions. | modulePermissionsService reexporta para não quebrar imports atuais. |

### 2.5 Regras de own_only (já existentes)

- **ownerId** → normalmente `user_id` do registro.
- **assigneeId** → `assignee_id` ou `responsible_id` conforme o módulo.
- **Regra:** permitir se `userId === ownerId` OU `userId === assigneeId` (quando informado). Documentado em `docs/REGRAS-OWN-ONLY-PERMISSOES.md`.

---

## Parte 3 — Estrutura final da pasta permissions

Toda a lógica de permissão fica centralizada em `packages/backend/src/permissions/`:

```
packages/backend/src/
  permissions/
    permissionTypes.ts          # Tipos: PermissionAction, ModuleId, CheckPermissionContext, PermissionDescriptor, etc.
    parsePermissionDescriptor.ts # parsePermissionDescriptor(descriptor) → { module: ModuleId; action: PermissionAction }
    permissionEngine.ts         # checkPermission(ctx, req?): RBAC → ABAC → own_only → allow/deny
    permissionRulesEngine.ts    # Regras ABAC: evaluateRules(user, module, action, resource?) → true|false|null (inicial: sempre null)
    modulePermissionResolver.ts # Resolve: getPermissionVersion → cacheKey permissions:userId:version → permissionCache + getEffectiveModulePermissions (futuro: snapshot)
    assertModulePermission.ts   # Valida ações em registros; monta ctx e chama checkPermission
    requirePermission.ts        # Middleware: parsePermissionDescriptor + checkPermission
    permissionCache.ts          # Cache global de permissões (memória ou Redis)
    errors.ts                   # Erros padronizados (ModulePermissionError)
    index.ts                    # Exportações centralizadas
```

**Responsabilidade por arquivo:**

| Arquivo | Responsabilidade |
|---------|------------------|
| **permissionTypes.ts** | Tipos globais: **PermissionAction**, **ModuleId**, **CheckPermissionContext**, **PermissionDescriptor**, AssertModulePermissionOptions, ModulePermissionsMap, etc. |
| **parsePermissionDescriptor.ts** | **parsePermissionDescriptor(descriptor: PermissionDescriptor): { module: ModuleId; action: PermissionAction }**. Valida formato e action; evita duplicação em requirePermission. |
| **permissionEngine.ts** | **checkPermission(ctx, req?)**. Request cache + RBAC; chama **permissionRulesEngine.evaluateRules()** (ABAC); aplica own_only. Chama logPermissionDenied antes de negar. |
| **permissionRulesEngine.ts** | Avalia regras baseadas em atributos (ABAC). `evaluateRules(user, module, action, resource?)` retorna **true** (permite), **false** (nega) ou **null** (nenhuma regra se aplica). **Implementação inicial:** retornar sempre **null** — sem alterar comportamento atual. Futuro: regras como "só projetos da mesma equipe", "só clientes atribuídos ao usuário", "só tickets do departamento". |
| **modulePermissionResolver.ts** | Resolve permissões: getPermissionVersion(userId) → cacheKey = permissions:userId:version; permissionCache.get(cacheKey); em MISS, getEffectiveModulePermissions(userId) e permissionCache.set(cacheKey, map). Assinatura resolve(userId) — não recebe req. |
| **assertModulePermission.ts** | Valida permissão em controllers; chama engine; em negação chama logPermissionDenied e lança ModulePermissionError (importada de errors.ts). |
| **requirePermission.ts** | Middleware Express; parseia "module.action"; chama engine (com req para uso de req.permissionMap); 401/403 ou next(). |
| **permissionCache.ts** | Cache global (get/set/invalidate por userId). Interface e implementação em memória ou Redis. |
| **errors.ts** | Classe ModulePermissionError e demais erros de permissão. Ponto único de definição. |
| **index.ts** | Exporta engine, assert, requirePermission, resolver, permissionRulesEngine, cache, errors, e tipos necessários. |

**RBAC + ABAC híbrido (extensão futura):** O sistema atual é RBAC (roles + module permissions) + own_only. O `permissionRulesEngine` prepara suporte a **regras baseadas em atributos (ABAC)** sem alterar o funcionamento atual: na implementação inicial, `evaluateRules()` retorna sempre **null**, portanto o fluxo efetivo continua RBAC → own_only → allow/deny. No futuro, regras ABAC podem ser adicionadas (ex.: usuário só vê projetos da mesma equipe, só edita clientes atribuídos a ele, só vê tickets do seu departamento) sem mudar controllers nem banco.

O serviço atual `modulePermissionsService.ts` permanece em `services/` com getEffectiveModulePermissions, getRoleModulePermissions, MODULE_IDS, etc. O pacote `permissions/` **consome** esse serviço **apenas via modulePermissionResolver**; o engine e os demais módulos em `permissions/` **nunca** importam `modulePermissionsService` diretamente, para evitar ciclos de dependência e manter uma única via de acesso ao mapa de permissões.

---

## Parte 4 — Interfaces e tipos

### 4.1 Tipagem global de ações (PermissionAction)

Em todo o sistema de permissões deve ser usado um **tipo global** para ações, evitando erros de digitação ("edti", "deleete") que viram erro de compilação:

```ts
type PermissionAction = 'create' | 'view' | 'edit' | 'delete';
```

- **Uso:** em `checkPermission`, `assertModulePermission`, `requirePermission`, `evaluateRules`, validação de descriptor (action parseada deve ser do tipo `PermissionAction`). A lista `allowedActions` em requirePermission pode ser definida como `const ALLOWED_ACTIONS: PermissionAction[] = ['create', 'view', 'edit', 'delete']` ou equivalente tipado.

### 4.2 Tipagem global de módulos (ModuleId)

**ModuleId** deve ser union type (não `string` genérico), alinhado aos módulos do sistema:

```ts
type ModuleId =
  | 'dashboard'
  | 'clients'
  | 'leads'
  | 'funnels'
  | 'products'
  | 'projects'
  | 'tasks'
  | 'project_templates'
  | 'chat'
  | 'tickets'
  | 'proposals'
  | 'contracts'
  | 'billing'
  | 'finance'
  | 'settings'
  | 'meu_plano';
```

- **Uso:** em assinaturas do engine, resolver, assert, requirePermission, parsePermissionDescriptor. Erros de digitação em moduleId viram erro de compilação.

### 4.3 Parser de PermissionDescriptor

Função utilitária para evitar duplicação de lógica em requirePermission (e onde mais for preciso parsear "module.action"):

```ts
function parsePermissionDescriptor(descriptor: PermissionDescriptor): { module: ModuleId; action: PermissionAction }
```

- **Entrada:** string no formato `"module.action"` (ex.: `"clients.create"`, `"tasks.edit"`), tipada como `PermissionDescriptor` (ex.: `` `${string}.${PermissionAction}` ``).
- **Saída:** objeto `{ module, action }` com tipos `ModuleId` e `PermissionAction`. Validação (contém ".", action em PermissionAction) pode ficar dentro do parser ou em função de validação chamada antes; se inválido, lança erro.
- **Uso:** requirePermission chama `parsePermissionDescriptor(descriptor)` em vez de duplicar split e validação.

### 4.4 Contexto do Permission Engine (checkPermission)

O engine deve receber um **objeto de contexto** em vez de apenas `userId`, para que logs e decisões futuras (ABAC, etc.) não precisem buscar `tenantId` e `role` no banco:

```ts
interface CheckPermissionContext {
  userId: string;
  tenantId: string | null;   // já disponível no request (ex.: req.tenantId)
  role: string | null;       // ex.: 'admin' | 'manager' | 'member' | 'viewer' ou custom
  module: ModuleId;
  action: PermissionAction;
  resource?: Record<string, unknown>;  // opcional: atributos do recurso (ownerId, assigneeId, etc.)
}

function checkPermission(ctx: CheckPermissionContext, req?: Request): Promise<boolean>;
```

- **Motivo:** o caller (middleware/controller) já tem ou pode obter `tenantId` e `role` do request ou do mapa de permissões; passar no contexto evita consultas adicionais no engine e padroniza dados disponíveis para logPermissionDenied e para o permissionRulesEngine.
- **Obtenção de role:** Para evitar query duplicada (getUserRoleInTenant já é chamada dentro de getEffectiveModulePermissions), o **resolver** pode retornar `{ map, role }` e o engine armazenar o role em `req` (ex.: `req.permissionRole?.[userId]`) na primeira resolução; assim o engine dispõe de role para o log sem que o caller precise chamar getUserRoleInTenant. Alternativa: `ctx.role` opcional (pode ser null); quando null, o log ainda é emitido com role null.
- **req em fluxo HTTP:** Assert e requirePermission **devem passar req** quando usados em contexto HTTP, para que o request cache (`req.permissionMap`) seja usado e não haja múltiplas resoluções por request.
- **Compatibilidade:** `assertModulePermission` mantém assinatura atual `(userId, moduleId, action, options?, req?)` e, internamente, monta `CheckPermissionContext` (tenantId e role a partir de req quando disponível) e chama `checkPermission(ctx, req)`. `requirePermission` usa `parsePermissionDescriptor(descriptor)` e monta o contexto a partir do req antes de chamar `checkPermission(ctx, req)`.

### 4.5 Demais tipos

- **ModulePermissions / ModulePermissionRow:** can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only (igual ao atual).
- **AssertModulePermissionOptions:** `{ ownerId?: string | null; assigneeId?: string | null }`. Ao montar `CheckPermissionContext`, esses valores devem ir em `ctx.resource` (ex.: `ctx.resource = { ownerId: options?.ownerId, assigneeId: options?.assigneeId }`) para o engine aplicar regras own_only.
- **PermissionDescriptor:** tipo string no formato `"module.action"` (ex.: `` `${string}.${PermissionAction}` `` ou equivalente).
- **ModulePermissionError:** classe de erro (statusCode 403, message); definida em `permissions/errors.ts`; modulePermissionsService reexporta para compatibilidade.
- **ABAC (permissionRulesEngine):** `evaluateRules(user, module, action, resource?)` → `true | false | null`. O parâmetro `user` pode ser o mesmo contexto (userId, tenantId, role) ou um subconjunto. **null** = nenhuma regra ABAC se aplica. Implementação inicial: sempre **null**.

### 4.6 Preparação para Permission Snapshot (futuro)

A arquitetura deve estar preparada para uma otimização futura: **snapshot de permissões por usuário**, evitando recalcular o mapa completo a cada request.

- **Tabela futura (exemplo):** `user_permission_snapshots`
  - Chave: por usuário (ex.: `user_id`, ou `user_id` + `tenant_id`).
  - Conteúdo: JSON com o mapa de permissões por módulo (espelho do retorno de `getEffectiveModulePermissions`).
  - Exemplo de estrutura: `{ "clients": { "can_view": true, "can_create": true, "can_edit": true, "can_delete": false, "edit_own_only": false, "delete_own_only": false }, "projects": { ... }, ... }`

- **Fluxo futuro no resolver:** (1) tentar `SELECT snapshot FROM user_permission_snapshots WHERE user_id = $1` (e, se aplicável, `tenant_id = $2`); (2) se snapshot existir e estiver válido (ex.: não expirado), usar como `ModulePermissionsMap`; (3) caso contrário, chamar `getEffectiveModulePermissions(userId)`, persistir/atualizar o snapshot e retornar.

- **Invalidação:** ao alterar roles, custom roles ou permissões do usuário (ou do tenant que afetem o usuário), invalidar ou recalcular o snapshot desse usuário.

- **Não implementar agora:** apenas documentar na arquitetura que o `modulePermissionResolver` está preparado para, no futuro, consultar primeiro um snapshot (tabela ou cache) e só então recalcular quando necessário.

---

## Parte 5 — Exemplos de uso em controllers

### clientsController

```ts
// Create: só ação, sem options
await assertModulePermission(userId, 'clients', 'create');

// Edit/Delete: com ownerId (user_id do cliente)
const existing = await pool.query('SELECT user_id FROM clients WHERE id = $1 ...', [id]);
await assertModulePermission(userId, 'clients', 'edit', { ownerId: existing.rows[0].user_id });
await assertModulePermission(userId, 'clients', 'delete', { ownerId: existing.rows[0].user_id });
```

### projectsController

```ts
await assertModulePermission(userId, 'projects', 'create');
const existing = await pool.query('SELECT user_id FROM projects WHERE id = $1 ...', [id]);
await assertModulePermission(userId, 'projects', 'edit', { ownerId: existing.rows[0].user_id });
await assertModulePermission(userId, 'projects', 'delete', { ownerId: existing.rows[0].user_id });
```

### projectTasksController (tasks)

```ts
await assertModulePermission(userId, 'tasks', 'create');
const taskRow = await pool.query('SELECT user_id, assignee_id FROM project_tasks WHERE id = $1 ...', [taskId]);
await assertModulePermission(userId, 'tasks', 'edit', {
  ownerId: taskRow.rows[0].user_id,
  assigneeId: taskRow.rows[0].assignee_id,
});
await assertModulePermission(userId, 'tasks', 'delete', {
  ownerId: row.user_id,
  assigneeId: row.assignee_id,
});
```

### ticketsController (exemplo futuro)

```ts
await assertModulePermission(userId, 'tickets', 'create');
const ticket = await pool.query('SELECT user_id, assignee_id FROM tickets WHERE id = $1 ...', [id]);
await assertModulePermission(userId, 'tickets', 'edit', {
  ownerId: ticket.rows[0].user_id,
  assigneeId: ticket.rows[0].assignee_id,
});
await assertModulePermission(userId, 'tickets', 'delete', { ... });
```

### Uso do middleware requirePermission em rotas

```ts
// clientsRoutes.ts
import { requirePermission } from '../permissions/requirePermission.js';

router.post('/', requirePermission('clients.create'), clientsController.createClient);
router.patch('/:id', clientsController.updateClient);  // assert dentro do controller (precisa de ownerId)
router.delete('/:id', clientsController.deleteClient);
```

O middleware **valida:** (1) descriptor no formato `"module.action"` (deve conter `"."`); (2) a **action** extraída deve estar na lista permitida: `allowedActions = ["create", "view", "edit", "delete"]`. Se a action não estiver na lista, lançar erro. Isso evita erros silenciosos como `requirePermission('clientscreate')` ou actions inválidas.

O middleware pode ser usado onde a permissão não depende do recurso (ex.: create). Onde depende (edit/delete com own_only), a verificação continua no controller com assertModulePermission e options.

---

## Parte 6 — Integração sem quebrar o atual

1. **Manter** `modulePermissionsService.getEffectiveModulePermissions` e `assertModulePermission` funcionando como hoje (ou mover assertModulePermission para `permissions/assertModulePermission.ts` como thin wrapper que chama permissionEngine.checkPermission e lança ModulePermissionError).
2. **Introduzir** `permissionEngine.checkPermission(ctx, req?)` como função central; `assertModulePermission` passa a ser implementada montando o contexto e chamando `permissionEngine.checkPermission(ctx, req)`, lançando em caso de falha.
3. **Adicionar** `requirePermission` como novo middleware; rotas que queiram checagem na rota podem usar; controllers que já usam assertModulePermission continuam iguais.
4. **Cache:** opcional; se implementado, fica entre permissionEngine e modulePermissionResolver; invalidação ao alterar role/custom role do usuário.
5. **Controllers existentes:** não precisam mudar a assinatura de assertModulePermission; apenas o módulo de onde importam pode mudar (de services/modulePermissionsService para permissions/).

Esta arquitetura integra o que já existe e define o desenho para o Permission Engine sem quebrar o funcionamento atual.

---

## Parte 7 — Estrutura alvo e melhorias

**Estrutura final desejada:** `permissionEngine.ts`, `permissionRulesEngine.ts`, `modulePermissionResolver.ts`, `assertModulePermission.ts`, `requirePermission.ts`, `permissionCache.ts`, `errors.ts`, `index.ts` (Parte 3).

**Melhorias arquiteturais incorporadas:**

1. **Tipagem global:** **PermissionAction** = `'create' | 'view' | 'edit' | 'delete'` usado em todo o sistema; **ModuleId** = union type com todos os módulos (dashboard, clients, leads, …). Evita erros de digitação (ex.: "edti", "deleete") em tempo de compilação.
2. **Parser de descriptor:** Função **parsePermissionDescriptor(descriptor)** retorna `{ module: ModuleId; action: PermissionAction }`; usada em requirePermission e onde for preciso parsear "module.action", evitando duplicação de lógica.
3. **Contexto do engine:** **checkPermission(ctx, req?)** recebe `CheckPermissionContext`: `userId`, `tenantId`, `role`, `module`, `action`, `resource?`. O engine não busca tenantId/role no banco; o caller fornece do request.
4. **Fluxo RBAC + ABAC + own_only:** Ordem no engine: RBAC → ABAC (`permissionRulesEngine.evaluateRules()`) → own_only → allow/deny. **permissionRulesEngine** retorna `true | false | null`; implementação inicial: **sempre null**.
5. **Cache por request (`req.permissionMap`):** Tipo `Record<string, ModulePermissionsMap>` (por userId). Uma resolução por userId por request.
6. **Log de permissões negadas:** `logPermissionDenied({ userId, tenantId, role, module, action, ownerId?, assigneeId?, reason })`; chamada antes de ModulePermissionError.
7. **Validação em requirePermission:** Usa **parsePermissionDescriptor**; action deve ser do tipo **PermissionAction** (lista tipada, ex.: `ALLOWED_ACTIONS: PermissionAction[]`).
8. **Erros em errors.ts:** ModulePermissionError e demais erros em um único arquivo.
9. **Preparação para Permission Snapshot (futuro):** Arquitetura prevê que o resolver possa, no futuro, consultar primeiro uma tabela/cache de snapshot (ex.: `user_permission_snapshots` com JSON do mapa) e só recalcular quando necessário; não implementar agora.
10. **Permission Cache Invalidation (versionamento):** Serviço **permissionVersionService** (getPermissionVersion, incrementPermissionVersion) e tabela **user_permission_versions** (user_id, version). Resolver usa cacheKey `permissions:${userId}:${version}`; ao incrementar a versão do usuário, o cache antigo deixa de ser usado. Chamar **incrementPermissionVersion(userId)** ao alterar role/custom role do usuário, ao alterar permissões de um role de sistema (para todos os usuários com esse role), ao alterar permissões de um custom role (para todos os usuários com esse custom role) e ao atribuir/remover custom role de um usuário. Não implementar ainda; apenas arquitetura e plano.

Os controllers atuais (clients, leads, projects, projectTasks) continuam podendo importar de `services/modulePermissionsService.js` (que reexporta a classe de errors); quando desejarem, passam a importar de `permissions/index.js` (mesma assinatura de assertModulePermission e ModulePermissionError).
