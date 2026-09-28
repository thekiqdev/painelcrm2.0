# AUDIT — F5 Domain Store Hydration Timeline

| Campo | Valor |
|---|---|
| **Audit** | `AUDIT_F5_STORE_HYDRATION_TIMELINE` |
| **Versão** | 1.0 |
| **Data** | 2026-07-09 |
| **Tipo** | Investigação read-only + instrumentação DEV |
| **Ambiente** | `localhost:3002` / Postgres Docker / flags ON em `superadmin_settings` |

---

## Resumo

Instrumentação DEV adicionada (`f5HydrationAudit.ts`, ativa com `VITE_F5_HYDRATION_AUDIT=1`).

Simulação programática da abertura `/chat` executada em `store.f5.hydration-audit.test.ts` (4 cenários).

**Singleton confirmado:** uma única instância por sessão (`session.ts` → `sessionId` incremental, mesma referência `getChatDomainStoreSession()`).

---

## Etapa 1 — Instrumentação (DEV only)

| Ponto | Arquivo | Log |
|---|---|---|
| `applyStoreConversationList` | `consolidation.ts` | `[F5-HYDRATION] applyStoreConversationList()` call#, count, first, last, stack |
| `dispatch(conversations/set)` | `createStore.ts` | orderedIds antes/depois, actionCount |
| Store snapshot | `session.ts`, `createStore.ts` | orderedIds, byId após dispatch |
| `selectChatConversationsForUi` | `chatSelectors.ts` | count (amostragem) |
| `useChatConversationList` | `useChatConversationList.ts` | count, render#, source |

Ativar: `VITE_F5_HYDRATION_AUDIT=1` + `import.meta.env.DEV`.

---

## Etapa 2 — Timeline happy path (simulação `/chat`)

```
T0  flags=ON (CHAT_CORE_STORE=true no DB)
    store=0  selector=0

T1  bootstrapChatF3Session → applyChatStoreBootstrap
    store=0  (só instâncias; hydrateInbox=false)

T2  getChatDomainStoreSession() — sessionId=1 (singleton)
    store=0

T3  Repository/HTTP — 50 conversas
    store=0  (ainda não escrito)

T4  applyStoreConversationList(50)  ← call #1
    dispatch(conversations/set) orderedIds: 0→50
    store=50  selector=50

T5  Hook/selector read
    store=50  selector=50  → UI=50
```

**Contadores (1 abertura simulada):**

| Função | Chamadas |
|---|---|
| `applyStoreConversationList` | **1** |
| `dispatch(conversations/set)` | **1** |
| `selectChatConversationsForUi` | **6** (inclui reads durante bootstrap) |
| `useChatConversationList` | **0** (teste não monta React) |

---

## Etapa 3 — Cenários de falha reproduzidos

### Cenário SKIP (guard `enabledInstanceIds`)

```
bootstrap only — loadConversations NÃO roda
applyStoreConversationList: 0 chamadas
store=0 permanente
```

### Cenário CLEAR (Case B)

```
applyStoreConversationList(2)  → store=2
applyStoreConversationList([]) → store=0  (call #2)
selector=0
```

### Cenário OVERWRITE (Case C parcial)

```
Chat applyStoreConversationList(50)     → store=50
Floating syncStoreFromCommandResult(3)  → store=3 (orderedIds substituídos)
```

Não zera completamente, mas **reduz** a lista visível no Chat Principal.

---

## Etapa 4 — Quem pode limpar/sobrescrever o Store

| Arquivo | Função / action | Condição | Durante abertura `/chat`? |
|---|---|---|---|
| `consolidation.ts` | `applyStoreConversationList([])` | `loadConversations` com `uniqueConversations=[]` | **SIM** |
| `consolidation.ts` | `applyStoreConversationList(N)` | `loadConversations` sucesso | **SIM** |
| `repositorySync.ts` | `conversations/set` via `syncStoreFrom*` | `listConversations` array | **SIM** (Floating `loadInboxCommand`, commands) |
| `actions.ts` | `conversations/set` | qualquer dispatch | **SIM** |
| `actions.ts` | `store/reset` | `store.reset()` / `applyChatStoreReset` | **NÃO** (só logout/reset explícito) |
| `integration.ts` | `applyChatStoreBootstrap` | bootstrap F3 | **SIM** — só `instances/set`, **não** conversas |
| `integration.ts` | `applyChatStoreReset` | reset explícito | **NÃO** na abertura normal |
| `integration.ts` | `applyChatStoreReconnect` | evento `online` | **NÃO** na abertura (só connection/set) |
| `session.ts` | `resetChatDomainStoreSession` | testes / reset | **NÃO** na abertura normal |
| `commands.ts` | `loadInboxCommand` → `syncStoreFromCommandResult` | Floating lista aberta + flag ON | **SIM** se `listOpen=true` |
| `Chat.tsx` | `setConversations([])` | guards instâncias | **NÃO afeta store** (no-op F5.6) |

**Nenhum `store.reset()` automático na abertura do Chat.**

---

## Etapa 5 — Stores compartilhados

| Superfície | Escreve no mesmo Store? | Mecanismo |
|---|---|---|
| Chat Principal | **SIM** | `applyStoreConversationList` |
| Floating Chat | **SIM** | `loadInboxCommand` → `syncStoreFromCommandResult('listConversations')` |
| Sidebar / prefetch RQ | **NÃO** (flag ON) | React Query desabilitado; prefetch não toca store |
| CRM Lead (`EmbeddedLeadConversationPanel`) | **NÃO** | React Query + `chatService` |
| CRM Cliente (`ClientProfile`) | **NÃO** | `getClientMessages` / `resolveConversationForClient` |
| Bootstrap | **SIM** (instâncias only) | `instances/set` |
| Realtime WS | **SIM** | `syncStoreFromSocketEvent` → upsert/set parcial |

**Risco comprovado:** Floating pode **sobrescrever** `orderedIds` do Chat com subset menor (50→3 no teste).

---

## Etapa 6 — Singleton

```
session.ts: let sessionStore: ChatDomainStore | null
getChatDomainStoreSession() → lazy create, sessionId++

Teste happy path:
  sessionRefA === sessionRefB  ✅
  sessionId = 1 (por abertura)
```

`createChatDomainStore()` direto: **somente em testes unitários**, não em produção.

**Case D descartado:** não há segundo Store em runtime de produção.

---

## Etapa 7 — Timeline final (ambiente com bug reportado)

Com `CHAT_CORE_STORE=true` (confirmado DB) e API retornando conversas (50+ comprovado backend):

```
T0  Página /chat monta
    UI lê store via useChatConversationList
    store=0  selector=0  ← UI VAZIA desde o primeiro render

T1  bootstrap (instâncias)
    store=0  (sem conversas)

T2  [GUARD ou FALHA HTTP] loadConversations não grava
    OU
    loadConversations grava uniqueConversations=[]

T3  applyStoreConversationList NÃO executa com N>0
    OU executa com count=0

T4  store=0 permanece
    selector=0
    UI vazia persistente
```

**Primeiro momento em que os dados “desaparecem”:** na verdade **nunca chegam** ao Store — o primeiro estágio vazio é **Store (write)**, entre HTTP response e `applyStoreConversationList(N>0)`.

Quando `applyStoreConversationList(50)` **é** chamado (teste comprovado), selector e UI recebem 50 imediatamente.

---

## Contagens esperadas numa abertura saudável

| Função | Esperado |
|---|---|
| `applyStoreConversationList` | **1** (por load bem-sucedido) |
| `dispatch(conversations/set)` | **1+** (1 do Chat + possíveis do Floating/WS) |
| `selectChatConversationsForUi` | **dezenas** (cada render/subscribe) |
| `useChatConversationList` | **dezenas** (cada render React) |

---

## Conclusão

```
CAUSA COMPROVADA

applyStoreConversationList nunca é chamado com N>0 durante a abertura do /chat
(enquanto CHAT_CORE_STORE=ON faz a UI ler o Domain Store vazio desde T0).

Evidência:
- bootstrap não hidrata conversas (store=0 após T1)
- guard enabledInstanceIds=0 impede loadConversations (applyCallCount=0)
- quando load falha antes da linha 1213, apply não executa
- quando uniqueConversations=[], applyStoreConversationList([]) mantém store=0 (subcaso B)
- pipeline HTTP→apply(50)→store=50 funciona quando a escrita ocorre (teste happy path)
- Case D (multi-store) descartado
```

**Subcaso B** (apply com `[]` por filtro `mine`/API vazia) permanece possível se `loadConversations` completar com zero itens — comprovado em teste `AUDIT_TIMELINE_CLEAR`.

**Subcaso C** (sobrescrita parcial Floating) comprovado mas não explica lista **totalmente** vazia exceto se Floating gravar `[]`.

---

## Artefatos

- `src/features/chat-core/store/f5HydrationAudit.ts`
- `src/features/chat-core/store/store.f5.hydration-audit.test.ts`
- Executar: `VITE_F5_HYDRATION_AUDIT=1 npm run dev` e abrir `/chat` para captura console em produção DEV

---

*Instrumentação é read-only (logs). Remover após conclusão da correção F5.8.*
