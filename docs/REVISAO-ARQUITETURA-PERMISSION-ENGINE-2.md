# Revisão da arquitetura do Permission Engine (consistência, responsabilidades, dependências, queries)

**Objetivo:** Verificar inconsistências, duplicação de responsabilidade, possíveis loops de dependência e pontos que podem gerar múltiplas queries na arquitetura do Permission Engine.

---

## 1. Inconsistências

### 1.1 Nome da função central: `check` vs `checkPermission`

- **Arquitetura/Plano/Diagrama:** Referem-se a **checkPermission(ctx, req?)** como função central.
- **Parte 6 (Integração sem quebrar o atual):** Ainda cita "permissionEngine.**check()**" e "assertModulePermission passa a ser implementada chamando permissionEngine.**check**".
- **Plano item 2.5:** "Integrar no permissionEngine.**check()**" (deveria ser checkPermission).
- **Código atual:** `permissionEngine.ts` exporta **check(userId, moduleId, action, options)** (sem ctx, sem req).

**Recomendação:** Unificar em **checkPermission(ctx, req?)** em toda a documentação. Atualizar Parte 6 e o item 2.5 do plano para usar checkPermission.

---

### 1.2 Quem chama `logPermissionDenied`

- **Arquitetura (Parte 2.3 e 2.4):** "Chamada **dentro do Permission Engine** (ou no assert)"; tabela 2.4 diz que o **permissionEngine** "Antes de negar, chama logPermissionDenied".
- **Arquitetura (Parte 2.4 tabela):** **assertModulePermission** "Se negado, logPermissionDenied e lança ModulePermissionError".
- **Plano (2.2 e 2.3):** assert e requirePermission "Se false: chamar logPermissionDenied(...); em seguida lançar/responder 403".

Isso gera ambiguidade: tanto o engine quanto o assert/requirePermission podem chamar o log, com risco de **log duplicado** (engine loga ao retornar false; assert loga de novo antes de lançar).

**Recomendação:** Definir **um único responsável**. Preferível: **apenas o engine** chama `logPermissionDenied` (no momento em que decide negar, antes de retornar false). Assert e requirePermission apenas tratam o retorno false (throw ou 403), sem chamar log de novo. Assim o `reason` fica centralizado no engine e não há duplicação.

---

### 1.3 Referência a `check()` em texto de log

- **Arquitetura Parte 2.3 (Local):** "invocada pelo engine ou por assertModulePermission ao detectar que **check()** retornou false".
- Deve ser **checkPermission(ctx, req?)** para alinhar com o resto do documento.

---

### 1.4 `ctx.resource` vs `options` (ownerId / assigneeId)

- **CheckPermissionContext** tem `resource?: Record<string, unknown>`.
- **assertModulePermission** recebe `options?: { ownerId?, assigneeId? }` e deve colocar em `ctx.resource`.
- A arquitetura está correta; na implementação é preciso garantir que o engine leia `ownerId`/`assigneeId` de `ctx.resource` (ou de um tipo que estenda com esses campos) para aplicar own_only. Documentar explicitamente que `ctx.resource` deve conter pelo menos `ownerId` e `assigneeId` quando aplicável.

---

## 2. Duplicação de responsabilidade

### 2.1 `logPermissionDenied` (já citado)

- **Problema:** Engine e assert (e possivelmente requirePermission) podem todos chamar logPermissionDenied.
- **Solução:** Atribuir a **uma única camada** — o engine. Ao negar, o engine chama `logPermissionDenied` com todos os dados (incl. reason) e retorna false; assert/requirePermission só reagem ao boolean.

### 2.2 Definição de `ModulePermissionError`

- **Situação atual:** Código tem a classe em `assertModulePermission.ts` e em `modulePermissionsService.ts`; plano prevê unificação em `permissions/errors.ts`.
- **Conclusão:** Sem duplicação na arquitetura alvo; a Fase 1 do plano já trata isso. Manter uma única definição em `errors.ts` e reexportar onde necessário.

### 2.3 Quem monta o `reason` da negação

- Se o assert chamar logPermissionDenied, ele precisa montar o `reason` (no_module_permission, edit_own_only_not_owner, etc.), duplicando a lógica que já existe no engine (que sabe por que negou).
- **Conclusão:** Reforça que o **engine** deve ser o único a chamar logPermissionDenied, pois só ele sabe o motivo exato da negação.

---

## 3. Possíveis loops de dependência

### 3.1 Grafo de dependências

- **permissions/permissionEngine** → modulePermissionResolver → **services/modulePermissionsService** (getEffectiveModulePermissions).
- **permissions/assertModulePermission** → permissionEngine, errors.
- **modulePermissionsService** (após Fase 1) → **permissions/errors** (ModulePermissionError).

Cadeia: `assertModulePermission` → `permissionEngine` → `resolver` → `modulePermissionsService` → `permissions/errors`. O arquivo `errors.ts` não importa engine nem resolver nem service; é folha. **Não há ciclo.**

### 3.2 Risco se o engine importar o service diretamente

- Se o engine (ou outro módulo em permissions/) importar algo de `modulePermissionsService` além do que já passa pelo resolver, pode surgir dependência circular (service já importa permissions/errors). **Recomendação:** O engine **nunca** deve importar `modulePermissionsService` diretamente; toda a resolução de permissões deve passar pelo **resolver**.

### 3.3 permissionRulesEngine

- **permissionEngine** → permissionRulesEngine (evaluateRules). permissionRulesEngine não importa o engine. **Sem ciclo.**

---

## 4. Pontos que podem gerar múltiplas queries

### 4.1 Fornecimento de `role` no contexto

- A arquitetura exige **CheckPermissionContext** com `tenantId` e `role` e diz que "o engine não busca tenantId/role no banco; o caller fornece".
- **Problema:** Hoje o request não carrega `role` por padrão. Se assert/requirePermission precisarem preencher `ctx.role` e fizerem uma chamada a `getUserRoleInTenant(userId)`, isso será uma **query extra**. Por outro lado, `getEffectiveModulePermissions(userId)` **já** chama internamente `getUserRoleInTenant(userId)` para obter o role e montar o mapa; porém esse role **não é retornado** pelo resolver.
- **Risco:** Caller chama `getUserRoleInTenant(userId)` para montar ctx → **duplicação de query** (uma no resolver, outra no caller).

**Recomendações:**

1. **Opção A (preferível):** O **resolver** passa a retornar `{ map: ModulePermissionsMap; role: string | null }` (o role já é obtido dentro de getEffectiveModulePermissions; o service pode expor uma variante ou o resolver pode chamar getUserRoleInTenant uma vez e reutilizar ao chamar getEffectiveModulePermissions, ou o service retornar role junto do mapa). O engine, ao preencher `req.permissionMap[userId]`, pode preencher também `req.permissionRole?.[userId] = role` (ou estrutura equivalente). Na primeira verificação do request, o engine usa o role retornado pelo resolver para logPermissionDenied; em chamadas subsequentes, usa `req.permissionRole?.[userId]` se existir. Assim **ctx.role** pode ser opcional: se o caller não passar, o engine usa o valor do request cache (preenchido na primeira resolução).
2. **Opção B:** Aceitar `role` opcional no contexto (pode ser null). Quando null, logPermissionDenied ainda é chamado, mas com role null (melhor que query duplicada).
3. **Opção C:** Middleware (ex.: após tenantAuth) que resolve permissões uma vez e seta `req.role` — mas isso antecipa resolução de permissões em toda requisição autenticada, o que pode ser desnecessário. Menos recomendado.

Documentar na arquitetura que o **resolver pode retornar role junto do mapa** (ou que o engine preenche role no request a partir da primeira resolução) para evitar query extra para role.

---

### 4.2 Request cache e `req` opcional

- Se **req** for opcional e o controller chamar `assertModulePermission(userId, moduleId, action, options)` **sem passar req**, o engine não terá `req.permissionMap` e **toda chamada** irá ao resolver (e possivelmente ao DB). Várias verificações no mesmo request (ex.: requirePermission + assert no controller) gerariam **N resoluções**.
- **Recomendação:** Exigir que **assertModulePermission** e **requirePermission** **sempre passem req** quando forem usados em contexto HTTP (sempre há req). Documentar que "req é obrigatório em fluxo HTTP; quando não passado, o engine não usa request cache e cada verificação pode disparar nova resolução". Opcionalmente, na implementação, fazer o assert ler `req` do AsyncLocalStorage ou do último middleware se a assinatura não receber req, para não depender de o controller passar req em toda chamada.

---

### 4.3 Múltiplas verificações no mesmo request

- Com request cache correto (req sempre passado e engine preenchendo `req.permissionMap[userId]`), há **apenas 1 resolução por userId por request**. Sem req, há N resoluções. A arquitetura está correta; o risco está na **não passagem de req** (ver 4.2).

---

### 4.4 getEffectiveModulePermissions interno

- **getEffectiveModulePermissions** faz: 1 query profile, 1 getUserCustomRoleInProfile (pode ser 1 query), 1 getUserRoleInTenant, 1 getRoleModulePermissions (ou getCustomRoleModulePermissions). Total típico: **2–4 queries** por resolução. Com cache global (permissionCache) e request cache, isso ocorre **uma vez por userId por request** (e depois uma vez por TTL no cache global). Nenhuma alteração adicional necessária na arquitetura; apenas garantir que ambos os caches estejam sempre utilizados quando req estiver disponível.

---

## 5. Resumo das ações recomendadas

| # | Tipo | Ação |
|---|------|------|
| 1 | Inconsistência | Substituir todas as referências a **check()** por **checkPermission(ctx, req?)** na Parte 6 e no item 2.5 do plano. |
| 2 | Duplicação | Definir que **apenas o engine** chama **logPermissionDenied** (ao negar, antes de retornar false). Assert e requirePermission não chamam log; apenas tratam o retorno. Atualizar arquitetura e plano. |
| 3 | Inconsistência | Corrigir texto em Parte 2.3: "check()" → "checkPermission(...)". |
| 4 | Múltiplas queries | Esclarecer na arquitetura como **role** é obtido: (A) resolver retorna role junto do mapa e engine guarda em req (ex.: req.permissionRole[userId]); (B) ctx.role opcional (pode ser null); ou (C) middleware seta req.role. Recomendar (A) ou (B) para evitar getUserRoleInTenant duplicado. |
| 5 | Múltiplas queries | Documentar que **req deve ser passado** em fluxo HTTP (assert e requirePermission) para garantir uso do request cache e evitar N resoluções por request. |
| 6 | Dependência | Reforçar na arquitetura que o engine **nunca** importa modulePermissionsService diretamente; apenas o resolver acessa o service. |
| 7 | Clarificação | Documentar que **ctx.resource** deve conter **ownerId** e **assigneeId** quando a verificação for edit/delete com own_only, para o engine aplicar as regras. |

---

## 6. Conclusão

- **Inconsistências:** Nome da função (check vs checkPermission) e responsável pelo log (engine vs assert) devem ser unificados na documentação e no desenho.
- **Duplicação:** Centralizar a chamada a logPermissionDenied no engine evita duplicação e mantém o reason consistente.
- **Dependências:** Não há ciclo hoje; manter o service acessado apenas pelo resolver e errors como folha.
- **Queries:** Evitar query extra para role (resolver retornar role ou aceitar role null no ctx) e garantir que req seja sempre passado em fluxo HTTP para que o request cache funcione e não haja múltiplas resoluções por request.

Aplicando as correções acima, a arquitetura fica consistente, com responsabilidades bem definidas e sem riscos desnecessários de loops ou de múltiplas queries.

---

## 7. Correções aplicadas (resumo)

As seguintes alterações foram feitas nos documentos após esta revisão:

- **ARQUITETURA-PERMISSION-ENGINE.md:** (1) Parte 6: check() → checkPermission(ctx, req?); (2) logPermissionDenied: apenas o engine chama; assert não chama; (3) Seção 4.4: adicionados "Obtenção de role" (resolver pode retornar role; engine pode guardar em req) e "req em fluxo HTTP" (assert/requirePermission devem passar req); (4) 4.5: ctx.resource deve conter ownerId/assigneeId; (5) Parte 3: engine nunca importa modulePermissionsService diretamente.
- **PLANO-IMPLEMENTACAO-PERMISSION-ENGINE.md:** (1) 2.5: permissionEngine.check() → checkPermission(ctx, req?); (2) assert e requirePermission não chamam logPermissionDenied; (3) req deve ser passado em fluxo HTTP; (4) Montar ctx: role de req ou null, evitar getUserRoleInTenant no assert; (5) logPermissionDenied: chamada apenas no engine.
- **DIAGRAMA-ARQUITETURA-PERMISSION-ENGINE.md:** assert não chama logPermissionDenied; logPermissionDenied chamado apenas pelo engine.
