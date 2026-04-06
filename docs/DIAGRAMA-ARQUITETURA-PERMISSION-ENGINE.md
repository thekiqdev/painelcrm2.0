# Diagrama da arquitetura final do Permission Engine

Documento de referência visual: fluxo de requisição, caches e integração com controllers.

---

## 1. Fluxo geral de uma requisição

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                      HTTP REQUEST                             │
                    │              (ex: POST /api/clients ou PATCH /api/clients/:id)│
                    └──────────────────────────────────┬────────────────────────────┘
                                                       │
                                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│  CAMADA EXPRESS                                                                                │
│  ┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────────────────────────┐   │
│  │ authenticateToken│───▶│ setCurrentTenant   │───▶│ requirePermission('clients.create')  │   │
│  │ (req.userId)     │    │ (req.tenantId)     │    │ ou rota sem middleware de permissão   │   │
│  └─────────────────┘    └─────────────────────┘    └──────────────────┬──────────────────┘   │
│                                                                         │                     │
│                                                                         │ 401 se !userId      │
│                                                                         │ 403 se sem permissão│
│                                                                         ▼                     │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │                         CONTROLLER (ex: clientsController)                           │    │
│  │  • Carrega recurso se edit/delete (para ownerId/assigneeId)                          │    │
│  │  • await assertModulePermission(userId, 'clients', 'edit', { ownerId })              │    │
│  │  • Executa operação (UPDATE/DELETE)                                                   │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                                                       │
                                                       ▼
                    ┌─────────────────────────────────────────────────────────────┐
                    │                      HTTP RESPONSE                             │
                    │              (200/201/204 ou 401/403/404/500)                  │
                    └─────────────────────────────────────────────────────────────┘
```

---

## 2. Fluxo detalhado: primeira verificação de permissão no request

(Quando **não** existe ainda `req.permissionMap?.[userId]` para o userId em questão.)

```
  requirePermission('clients.create')     ou     assertModulePermission(userId, 'clients', 'edit', { ownerId })
  [requirePermission: parsePermissionDescriptor(descriptor) → { module, action }; action tipada PermissionAction]
  [assert: monta CheckPermissionContext (userId, tenantId, role, module, action, resource?) e chama checkPermission]
                    │                                                              │
                    └──────────────────────────────┬───────────────────────────────┘
                                                   │
                                                   ▼
                              ┌────────────────────────────────────────┐
                              │  permissionEngine.checkPermission(     │
                              │    ctx: { userId, tenantId, role,      │
                              │           module, action, resource? },  │
                              │    req?                                 │
                              │  )                                      │
                              └────────────────────┬───────────────────┘
                                                   │
              [DENTRO DO ENGINE: req?.permissionMap?.[userId] existe?]
                                                   │
                         ┌─────────────────────────┼─────────────────────────┐
                         │ NÃO                     │ SIM                      │
                         ▼                         ▼                         │
              ┌──────────────────────┐   ┌──────────────────────┐             │
              │ Chamar resolver(userId)│   │ Usar req.permissionMap│             │
              │ (resolver NÃO recebe   │   │ [userId]              │             │
              │  req)                  │   │ (sem chamar resolver) │             │
              └──────────┬───────────┘   └──────────┬───────────┘             │
                         │                          │                         │
                         ▼                          │                         │
              ┌──────────────────────┐              │                         │
              │ modulePermission     │              │                         │
              │ Resolver             │              │                         │
              │ resolve(userId):     │              │                         │
              │ version=getPermission│              │                         │
              │ Version(userId);     │              │                         │
              │ cacheKey=userId:ver  │              │                         │
              │ cache.get(cacheKey)+ │              │                         │
              │ getEffectiveModule.. │              │                         │
              └──────────┬───────────┘              │                         │
                         │                          │                         │
                         │ retorna map → engine faz req.permissionMap[userId]=map
                         ▼                          │                         │
              ┌──────────────────────┐              │                         │
              │ permissionCache      │              │                         │
              │ .get(cacheKey)       │              │                         │
              │ cacheKey=perm:uid:ver│              │                         │
              └──────────┬───────────┘              │                         │
                         │                          │                         │
              ┌──────────┼──────────┐               │                         │
              │ HIT      │ MISS     │               │                         │
              ▼          ▼          │               │                         │
    ┌─────────────┐ ┌─────────────────────────┐    │                         │
    │ Retornar    │ │ getEffectiveModule       │    │                         │
    │ mapa do     │ │ Permissions(userId)      │    │                         │
    │ cache       │ │ (services)              │    │                         │
    └──────┬──────┘ └───────────┬──────────────┘    │                         │
           │                    │                    │                         │
           │                    │ cache.set(userId, map, TTL)  (resolver)       │
           │                    │ → engine recebe map e faz req.permissionMap[userId] = map (se req) │
           │                    ▼                    │                         │
           │                    retornar mapa        │                         │
           └────────────────────┬───────────────────┴─────────────────────────┘
                                 │
                                 ▼
              ┌────────────────────────────────────────┐
              │ permissionEngine: 1) RBAC (can_*)      │
              │ 2) ABAC evaluateRules(user,module,     │
              │    action, resource?) → false? deny    │
              │    → null/true: 3) own_only            │
              │    (edit_own_only / delete_own_only    │
              │     com ownerId / assigneeId)          │
              └────────────────────┬───────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │ true         │ false        │
                    ▼              ▼              │
             next() / return   logPermissionDenied({ userId, tenantId, role, module, action, ownerId?, assigneeId?, reason })
                               ModulePermissionError(403)
                               ou res.status(403)
```

---

## 3. Fluxo quando já existe req.permissionMap[userId] (mesmo request)

(Segunda ou terceira chamada ao engine no **mesmo** request para o **mesmo userId**.)

```
  assertModulePermission(userId, 'clients', 'delete', { ownerId })
                    │
                    ▼
     permissionEngine.checkPermission(ctx, req)  [ctx com userId, tenantId, role, module, action, resource]
                    │
                    ▼
     req.permissionMap?.[userId] existe? ─── SIM ──▶ Usar req.permissionMap[userId]
                    │                              (sem resolver, sem cache global, sem DB)
                    │                              Aplicar regra (can_delete, delete_own_only)
                    │                              Retornar true/false
                    │
                    NÃO (req não passado ou primeira vez deste userId no request)
                    │
                    └──────────────────▶ Ver “Fluxo detalhado” (diagrama 2)
```

**Resultado:** Apenas **uma** resolução de permissões **por userId** por request; as demais leem `req.permissionMap[userId]`. Suporta múltiplos userIds no mesmo request (ex.: impersonation futura).

---

## 3.1 Ordem de decisão: RBAC → ABAC → own_only

Dentro de `permissionEngine.checkPermission(ctx, req?)`, a decisão segue esta ordem:

```
  1) RBAC (mapa de permissões)
     → can_create / can_edit / can_delete / can_view conforme action
     → se não permitido no módulo → NEGAR
     ↓
  2) ABAC (permissionRulesEngine.evaluateRules(user, module, action, resource?))
     → true  → continuar
     → false → NEGAR (logPermissionDenied + 403)
     → null  → continuar (nenhuma regra se aplica; implementação inicial sempre null)
     ↓
  3) own_only (edit_own_only / delete_own_only)
     → se aplicável, exige userId === ownerId ou userId === assigneeId
     → senão → NEGAR
     ↓
  4) ALLOW
```

O **permissionRulesEngine** fica preparado para regras futuras (ex.: mesma equipe, clientes atribuídos, departamento). Na implementação inicial retorna **sempre null**, sem alterar o comportamento atual.

---

## 4. Uso de caches (resumo)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│               REQUEST CACHE (req.permissionMap: Record<string, ModulePermissionsMap>)│
│  • Escopo: um único request HTTP                                                 │
│  • Chave: userId (permite cachear por usuário dentro do request)                  │
│  • Preenchido na primeira chamada ao engine para cada userId: req.permissionMap[userId]│
│  • Reutilizado por requirePermission + assertModulePermission para o mesmo userId│
│  • Evita conflito com impersonation, sub-requests ou troca de usuário no contexto│
│  • Benefício: 0 leituras adicionais de cache/DB por userId após a primeira        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │  Só na primeira necessidade do request
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    permissionVersionService (user_permission_versions)           │
│  • getPermissionVersion(userId) → version                                        │
│  • incrementPermissionVersion(userId) → chamado ao alterar role/custom role     │
│    ou definição de permissões (putMyTenantUserRole; setRole*; setCustomRole*;     │
│    atribuição/remoção de custom role)                                            │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │ version
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CACHE GLOBAL (permissionCache)                          │
│  • Escopo: processo (memória) ou Redis                                           │
│  • Chave: permissions:{userId}:{version}  (version de permissionVersionService) │
│  • TTL: configurável (ex.: 120 s)                                                │
│  • Invalidação: incrementPermissionVersion(userId) → nova chave → cache MISS     │
│  • Benefício: evita queries repetidas; alterações de permissão não servem cache antigo │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │  Cache miss
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    getEffectiveModulePermissions(userId)                          │
│  • services/modulePermissionsService                                             │
│  • Queries: profile → custom role ou role → role_module_permissions /             │
│             custom_role_module_permissions                                       │
│  • Futuro: resolver pode tentar primeiro snapshot (ex.: user_permission_         │
│    snapshots com JSON do mapa); só recalcular quando necessário. Não implementar │
│    agora; apenas arquitetura preparada.                                           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Integração com controllers

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ROTAS (ex: clientsRoutes.ts)                                                      │
│                                                                                   │
│  router.use(...tenantAuth)                                                         │
│  router.get('/', clientsController.getClients)                                    │
│  router.get('/:id', clientsController.getClientById)                              │
│  router.post('/', requirePermission('clients.create'), clientsController.createClient)  │
│  router.patch('/:id', clientsController.updateClient)        ◀── sem middleware   │
│  router.delete('/:id', clientsController.deleteClient)       ◀── assert no controller│
└──────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  CONTROLLER (ex: clientsController.ts)                                            │
│                                                                                   │
│  createClient(req, res)                                                           │
│    • userId = req.userId                                                          │
│    • requirePermission já rodou → 403 se não pode create                          │
│    • assertModulePermission(userId, 'clients', 'create')  ← opcional (redundante) │
│    • INSERT ...                                                                   │
│                                                                                   │
│  updateClient(req, res)                                                            │
│    • userId = req.userId                                                          │
│    • SELECT user_id FROM clients WHERE id = $1 ...  ← carrega recurso              │
│    • assertModulePermission(userId, 'clients', 'edit', { ownerId: row.user_id })  │
│    • UPDATE ...                                                                   │
│    • catch (ModulePermissionError) → res.status(403)                               │
│                                                                                   │
│  deleteClient(req, res)                                                            │
│    • userId = req.userId                                                          │
│    • SELECT user_id FROM clients WHERE id = $1 ...                                │
│    • assertModulePermission(userId, 'clients', 'delete', { ownerId: row.user_id })│
│    • DELETE ...                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Componentes e responsabilidades (visão do diagrama)

| Componente | Entrada | Saída / Efeito |
|------------|---------|----------------|
| **permissionTypes** | — | Tipos globais: **PermissionAction** ('create'\|'view'\|'edit'\|'delete'), **ModuleId** (union), **CheckPermissionContext** ({ userId, tenantId, role, module, action, resource? }), PermissionDescriptor, etc. |
| **parsePermissionDescriptor(descriptor)** | descriptor (string "module.action") | { module: ModuleId; action: PermissionAction }. Valida formato e action; usado em requirePermission para evitar duplicação. |
| **requirePermission(descriptor)** | req (userId, tenantId), descriptor | Chama **parsePermissionDescriptor(descriptor)**; monta **ctx** (userId, tenantId, role, module, action); chama **checkPermission(ctx, req)**. 401, 403 ou next(). |
| **permissionEngine.checkPermission(ctx, req?)** | ctx: CheckPermissionContext, req opcional | true/false. ctx traz userId, tenantId, role, module, action, resource? (engine não busca tenantId/role no banco). Fluxo: request cache → RBAC → **ABAC** evaluateRules() → own_only. |
| **permissionRulesEngine.evaluateRules(user, module, action, resource?)** | user (ex.: contexto), module, action, resource opcional | **true** (permite), **false** (nega), **null** (não aplica). **Inicial: sempre null**. Futuro: regras por atributos. |
| **assertModulePermission(...)** | userId, moduleId, action, options?, req? | Monta **CheckPermissionContext** (tenantId/role de req); chama **checkPermission(ctx, req)**. Se false (engine já terá chamado logPermissionDenied) → throw ModulePermissionError. Não chama logPermissionDenied. |
| **modulePermissionResolver.resolve(userId)** | userId apenas | Obtém version = getPermissionVersion(userId); cacheKey = permissions:userId:version; cache.get(cacheKey); miss → getEffectiveModulePermissions → set(cacheKey, map). **Futuro:** snapshot (user_permission_snapshots). |
| **permissionVersionService** | userId | getPermissionVersion(userId); incrementPermissionVersion(userId). Tabela user_permission_versions. Resolver usa version na cacheKey; pontos que alteram permissões chamam increment. |
| **permissionCache** | cacheKey (= permissions:userId:version) | get(cacheKey)/set(cacheKey, map). Cache global (memória ou Redis). Invalidação implícita ao incrementar version (nova chave). |
| **req.permissionMap** | — | Record<string, ModulePermissionsMap>. Gerido apenas pelo engine. Chave = userId. |
| **logPermissionDenied** | userId, tenantId, role, module, action, ownerId?, assigneeId?, reason | Log estruturado. role e reason para debugging. |

---

## 7. Diagrama de sequência (uma requisição com requirePermission + assert)

Cenário: `POST /api/clients` com body, rota com `requirePermission('clients.create')` e controller que também chama `assertModulePermission(userId, 'clients', 'create')`.

```
  Cliente    Express     tenantAuth   requirePermission   permissionEngine   Resolver   req.permissionMap   Cache global   getEffective...   Controller   assertModulePermission
     │          │             │              │                    │              │              │                  │                  │                │                    │
     │  POST    │             │              │                    │              │              │                  │                  │                │                    │
     │─────────▶│             │              │                    │              │              │                  │                  │                │                    │
     │          │  auth       │              │                    │              │              │                  │                  │                │                    │
     │          │────────────▶│              │                    │              │              │                  │                  │                │                    │
     │          │  req.userId │              │                    │              │              │                  │                  │                │                    │
     │          │◀────────────│              │                    │              │              │                  │                  │                │                    │
     │          │  check      │              │                    │              │              │                  │                  │                │                    │
     │          │────────────▶│              │                    │              │              │                  │                  │                │                    │
     │          │             │ checkPermission(ctx, req)        │              │              │                  │                  │                │                    │
     │          │             │─────────────▶│                    │              │              │                  │                  │                │                    │
     │          │             │              │  resolve(userId)    │              │              │                  │                  │                │                    │
     │          │             │              │───────────────────────────────────▶│              │                  │                  │                │                    │
     │          │             │              │                    │  req.map?    │              │                  │                  │                │                    │
     │          │             │              │                    │─────────────▶│ (vazio)      │                  │                  │                │                    │
     │          │             │              │                    │  get(userId) │              │                  │                  │                │                    │
     │          │             │              │                    │──────────────────────────────────────────────▶│                  │                │                    │
     │          │             │              │                    │              │              │     miss         │                  │                │                    │
     │          │             │              │                    │              │              │─────────────────────────────────────────────────▶│                │                    │
     │          │             │              │                    │              │              │                  │     map          │                │                    │
     │          │             │              │                    │              │              │◀──────────────────────────────────────────────────│                │                    │
     │          │             │              │                    │              │  set(userId,map)  req.permissionMap = map           │                │                    │
     │          │             │              │                    │              │──────────────────▶                  │                │                    │
     │          │             │              │                    │  return map  │              │                  │                  │                │                    │
     │          │             │              │                    │◀─────────────│              │                  │                  │                │                    │
     │          │             │              │  true (can_create) │              │              │                  │                  │                │                    │
     │          │             │              │◀───────────────────│              │              │                  │                  │                │                    │
     │          │             │  next()      │                    │              │              │                  │                  │                │                    │
     │          │             │─────────────────────────────────▶│              │              │                  │                  │                │                    │
     │          │             │              │                    │              │              │                  │  createClient    │                    │
     │          │             │              │                    │              │              │                  │─────────────────▶│                    │
     │          │             │              │                    │              │              │                  │                │  assert(userId,'clients','create')
     │          │             │              │                    │              │              │                  │                │───────────────────▶│
     │          │             │              │                    │  checkPermission(ctx, req)│                  │                  │                    │
     │          │             │              │                    │◀───────────────────────────────────────────────────────────────────────────────────│
     │          │             │              │                    │  req.permissionMap existe → usa direto (sem resolver/cache/DB)                      │
     │          │             │              │                    │  return true                                                                                                                                   │
     │          │             │              │                    │───────────────────────────────────────────────────────────────────────────────────▶│
     │          │             │              │                    │              │              │                  │                │  return (ok)     │
     │          │             │              │                    │              │              │                  │                │  INSERT ...     │
     │          │             │              │                    │              │              │                  │  201            │                    │
     │          │◀────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────│
     │  201     │             │              │                    │              │              │                  │                │                    │
     │◀─────────│             │              │                    │              │              │                  │                │                    │
```

Na segunda chamada (assert no controller), o engine apenas lê `req.permissionMap`; não há nova chamada ao resolver, ao cache global nem ao banco.

---

## 8. Legenda

| Símbolo / termo | Significado |
|-----------------|-------------|
| **req.permissionMap** | Cache por request: `Record<string, ModulePermissionsMap>`. Chave = userId; uma vez preenchido `req.permissionMap[userId]`, as verificações seguintes para o mesmo userId reutilizam. Suporta múltiplos usuários no mesmo request. |
| **Cache global** | permissionCache (memória ou Redis); chave = permissions:userId:version (version de permissionVersionService); invalidação ao incrementar version (incrementPermissionVersion). |
| **Resolver** | modulePermissionResolver.resolve(userId); único ponto que chama getEffectiveModulePermissions; futuramente pode tentar snapshot. |
| **Engine** | permissionEngine.checkPermission(ctx, req?); recebe CheckPermissionContext; aplica RBAC → ABAC → own_only; retorna boolean. |
| **logPermissionDenied** | Chamado **apenas pelo engine** ao negar (antes de retornar false). Registra userId, tenantId, role, module, action, ownerId?, assigneeId?, reason. Assert/requirePermission não chamam. |
| **parsePermissionDescriptor** | Função utilitária que parseia "module.action" e retorna { module: ModuleId; action: PermissionAction }; validação centralizada; usado em requirePermission. |
| **ABAC (permissionRulesEngine)** | Avaliado **entre** RBAC e own_only. evaluateRules retorna true | false | null. **null** = não aplica (neutro). Implementação inicial: **sempre null** — extensão futura sem alterar comportamento atual. |

Este diagrama descreve a arquitetura final do Permission Engine (RBAC + ABAC híbrido preparado) antes do início da implementação.
