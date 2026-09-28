# Chat Core

Infraestrutura do módulo Chat (Master Plan F0–F7).

## Fases

| Fase | Status | Flag |
|---|---|---|
| F0 Foundation | Entregue | — |
| F1 Single Socket | Entregue (default OFF) | Painel Super Admin → Otimização do Chat |
| F2 WS Patch | Entregue (sub-flags OFF) | Idem (`CHAT_WS_PATCH_*`) |
| F3 Registry + Unread | Entregue (flags OFF) | Idem (`CHAT_INSTANCE_REGISTRY`, `CHAT_UNREAD_*`) |
| F4+ | Parcial (F4b) | Idem — ver `SPRINT_CHAT_FEATURE_FLAGS_PANEL_REPORT.md` |
| **F5 Domain Store** | **Entregue (F5.12)** | `CHAT_CORE_STORE` (default OFF) |
| **F6 Cursor / Virtualização** | **Freeze F6.8** | ADR-010; F7 sobre a arquitetura congelada |

**Ativação:** exclusivamente pelo painel **Super Admin → Avançado → Feature Flags → Otimização do Chat** (`/superadmin/avancado/feature-flags/chat-optimization`). Variáveis `.env` não são mais a fonte de verdade para estas flags.

## F1

Com `CHAT_SINGLE_SOCKET` ligado no painel Super Admin, `ChatRealtimeBridge` é a única conexão Socket.IO das superfícies Chat migradas. Com flag OFF, caminhos legados permanecem.

Ver [`SPRINT_F1_SINGLE_SOCKET_REPORT.md`](../../../docs/architecture/chat/SPRINT_F1_SINGLE_SOCKET_REPORT.md).

## F2

Sub-flags independentes (todas OFF por default):

| Sub-flag | Painel | Evento |
|---|---|---|
| `CHAT_WS_PATCH_MESSAGE` | Otimização do Chat | `message.created` / `new_message` |
| `CHAT_WS_PATCH_CONVERSATION` | Otimização do Chat | `conversation.updated` |
| `CHAT_WS_PATCH_MESSAGE_UPDATED` | Otimização do Chat | `message_updated` |
| `CHAT_WS_PATCH_DELETE` | Otimização do Chat | `conversation.deleted` |
| `CHAT_WS_PATCH_ATTENDANCE` | Otimização do Chat | `conversation_attendance_updated` |

`tryApplyChatWsPatch(queryClient, eventName, payload)` — retorna `applied: false` → fluxo legado (`invalidateQueries`).

Diagnóstico: `getChatWsPatchStatistics()` — patches aplicados, fallbacks, motivos e taxa de sucesso por evento.

Ver [`SPRINT_F2_WS_PATCH_REPORT.md`](../../../docs/architecture/chat/SPRINT_F2_WS_PATCH_REPORT.md).

## F3

| Flag | Painel | Função |
|---|---|---|
| `CHAT_INSTANCE_REGISTRY` | Otimização do Chat | Única origem de `listInstances` |
| `CHAT_UNREAD_ENGINE` | Otimização do Chat | Contadores incrementais via WS |
| `CHAT_ATTENDANCE_RECONCILE` | Otimização do Chat | HTTP `attendance-counts` só em reconcile |

API: `ensureChatInstances()`, `fetchChatAttendanceCounts()`, `getChatGlobalUnreadCount()`, `requestChatReconcile()`.

Diagnóstico: `getChatF3PerformanceStatistics()` — logs com flag `CHAT_CORE_METRICS` no painel Super Admin.

Ver [`SPRINT_F3_INSTANCE_REGISTRY_REPORT.md`](../../../docs/architecture/chat/SPRINT_F3_INSTANCE_REGISTRY_REPORT.md).

## F5 — Domain Store (F5.6 / F5.9 inbox / F5.10 messages)

Com `CHAT_CORE_STORE` **ON**, o Chat opera exclusivamente sobre o **Domain Store**:

```
Repository → chatCore.commands.loadInbox()    → Domain Store → hooks → UI (lista)
Repository → chatCore.commands.loadMessages() → Domain Store → hooks → UI (thread)
```

- **Escrita inbox:** apenas `loadInboxCommand` / `clearInboxCommand` (F5.9)
- **Escrita mensagens (hidratação):** apenas `loadMessagesCommand` (F5.10)
- **Escrita mensagens (outbound):** `applyStoreMessages` (UI outbound queue)
- **Leitura:** `useChatConversationList`, `useChatMessages`, `useChatSelection`, hooks Floating
- **Rollback:** `CHAT_CORE_STORE` OFF restaura `useState` + React Query legados

Removido em F5.6: shadow parity na UI, dual-write no Chat.tsx.

Removido em F5.9: `applyStoreConversationList` na UI, `syncStoreFromCommandResult(listConversations)`.

Removido em F5.10: pipelines `surface: 'core'|'float'` em mensagens; double-map em `repositorySync.listMessages`.

## F5.7 — Estabilização

- **`store/public.ts`** — barrel único para UI (hooks + escrita consolidada)
- Shadow logs gated por `CHAT_CORE_METRICS` (`shadowLog.ts`)
- Métrica duplicada de command latency removida do dispatcher
- `recordStoreSubscription` ligado nos hooks `useSyncExternalStore`

Ver [`SPRINT_F5.7_STABILIZATION_REPORT.md`](../../../docs/architecture/chat/SPRINT_F5.7_STABILIZATION_REPORT.md).

## F5.9 — Command Unification

Pipeline único de inbox:

```
Repository → loadInboxCommand → Domain Store → hooks → UI
```

- Chat, Floating, Bootstrap e refresh usam o mesmo command
- `applyStoreConversationList` removido da API pública da UI
- `syncStoreFromCommandResult('listConversations')` é no-op (DEV warn)

Ver [`SPRINT_F5.9_COMMAND_UNIFICATION_REPORT.md`](../../../docs/architecture/chat/SPRINT_F5.9_COMMAND_UNIFICATION_REPORT.md).

## F5.10 — Messages Command Unification

Pipeline único de mensagens:

```
Repository → loadMessagesCommand → Domain Store → hooks → UI
```

- Chat e Floating usam o mesmo command (sem `surface`)
- `repositorySync.listMessages` aceita legacy e domain via `toDomainMessage()`
- Corrige thread vazia em `/chat` (audit F5 messages pipeline)

Ver [`SPRINT_F5.10_MESSAGES_COMMAND_UNIFICATION_REPORT.md`](../../../docs/architecture/chat/SPRINT_F5.10_MESSAGES_COMMAND_UNIFICATION_REPORT.md).

## F5.11 — Realtime Unification

Com `CHAT_CORE_STORE` ON, eventos WS atualizam **apenas** o Domain Store:

```
Socket.IO → ChatRealtimeBridge → syncStoreFromSocketEvent → Store → hooks → UI
```

- Sem `setMessages` / `setConversations` / `invalidateQueries` em handlers realtime (store ON)
- Floating mantém apenas efeitos de UI (pulse, fechar painel)
- `storeBootstrap`: ingresso único via `bridge.subscribe` (F1 ON)

Ver [`SPRINT_F5.11_REALTIME_UNIFICATION_REPORT.md`](../../../docs/architecture/chat/SPRINT_F5.11_REALTIME_UNIFICATION_REPORT.md).

## F5.12 — Performance Baseline & Telemetry

Camada de observabilidade (DEV + `CHAT_CORE_METRICS`) para baseline pré-F6:

- Renders, reducers, selectors, subscriptions, HTTP, socket apply, memória
- Cenários: `chat_open`, `conversation_open`, `incoming_message`
- API: `getChatPerformanceReport()` / `logChatPerformanceReport()`
- **Sem otimização funcional** — só medição

Ver [`SPRINT_F5.12_PERFORMANCE_BASELINE_REPORT.md`](../../../docs/architecture/chat/SPRINT_F5.12_PERFORMANCE_BASELINE_REPORT.md).

## F6.0 — Cursor Engine (Pagination Foundation)

Fundação de paginação incremental **sem mudança de UX**:

```
getMessagesPage → loadMessagesCursorCommand → messages/prependPage → cursorSelectors
```

- Estado: `nextCursor` / `hasMore` / `loadingMore` / `loadedPages` por conversa
- Hooks: `useConversationCursor`, `useLoadMoreMessages` (prontos para F6.1)
- `loadMessagesCommand` continua sendo o pipeline de abertura (dump integral)
- Fallback legado quando a API ainda não pagina

Ver [`SPRINT_F6.0_CURSOR_ENGINE_REPORT.md`](../../../docs/architecture/chat/SPRINT_F6.0_CURSOR_ENGINE_REPORT.md).

## F6.1 — Incremental Load More

No Chat principal (`CHAT_CORE_STORE` ON):

1. Abertura carrega a **última página** (`loadMessagesCommand` + `latestPage`)
2. Botão **Carregar mensagens anteriores** no topo da thread
3. `useLoadMoreMessages` → `loadMessagesCursorCommand` → prepend + restore scroll

Floating mantém dump integral (`latestPage: false`) nesta sprint.

Ver [`SPRINT_F6.1_INCREMENTAL_LOAD_MORE_REPORT.md`](../../../docs/architecture/chat/SPRINT_F6.1_INCREMENTAL_LOAD_MORE_REPORT.md).

## F6.2 — Sliding Window Cache

Domain Store mantém apenas uma janela residente por conversa (~5 páginas / ~250 msgs):

```
messages/set | prependPage → registerPage → trim (LRU, pin newest) → evict
```

- Estado: `residentPages` / `cachedPages` / `evictedPages` / `memoryFootprint`
- Hooks: `useConversationWindow`, `useWindowMemory`
- Sem mudança de UX; prepara F6.3 (virtualização)

Ver [`SPRINT_F6.2_WINDOW_CACHE_REPORT.md`](../../../docs/architecture/chat/SPRINT_F6.2_WINDOW_CACHE_REPORT.md).

## F6.3 — Conversation Virtualization

Sidebar do Chat (`CHAT_CORE_STORE` ON) renderiza só viewport + overscan:

```
conversationsToShow → Virtual Engine → visibleItems (DOM) + totalHeight
```

- Hooks: `useConversationVirtualization`, `useConversationScroll`
- Store: `conversationVirtualization` (scroll/viewport/window)
- Floating inalterado; mensagens = escopo F6.4

Ver [`SPRINT_F6.3_CONVERSATION_VIRTUALIZATION_REPORT.md`](../../../docs/architecture/chat/SPRINT_F6.3_CONVERSATION_VIRTUALIZATION_REPORT.md).

## F6.4 — Message Virtualization

Thread do Chat (`CHAT_CORE_STORE` ON) usa Message Virtual Engine:

```
messagesView → useVirtualizedMessages (mode: core) → VirtualizedMessageList
```

- Hooks: `useMessageVirtualization`, `useMessageScroll`
- Store: `messageVirtualization`
- Floating / store OFF → TanStack legado (`mode: legacy`)

Ver [`SPRINT_F6.4_MESSAGE_VIRTUALIZATION_REPORT.md`](../../../docs/architecture/chat/SPRINT_F6.4_MESSAGE_VIRTUALIZATION_REPORT.md).

## F6.5 — Realtime Render Optimization

Reduz re-renders de realtime sem mudar UX:

```
Bridge coalesce → dispatchBatch → useStableSelector → React.memo rows
```

- `useStableSelector` / `selectorMemo` / `storeBatch`
- `ChatConversationRow` + `ChatMessageRow` (fingerprint)
- Telemetria: `renderOptimizationMetrics`

Ver [`SPRINT_F6.5_RENDER_OPTIMIZATION_REPORT.md`](../../../docs/architecture/chat/SPRINT_F6.5_RENDER_OPTIMIZATION_REPORT.md).

## F6.6 — Warm Window & Predictive Prefetch

Pré-aquece threads em idle sem mudar UX:

```
Heat Score → fila preditiva → requestIdleCallback → loadMessagesCommand → Window Cache
```

- Capacidade: 5 conversas (LRU)
- Skip se mensagens já residentes
- Cancel em interação (pointer/keydown/wheel)
- Hook: `useConversationWarmup` (Chat principal, store ON)

Ver [`SPRINT_F6.6_WARM_WINDOW_REPORT.md`](../../../docs/architecture/chat/SPRINT_F6.6_WARM_WINDOW_REPORT.md).

## F6.7 — Performance Certification

Auditoria only (sem alteração de código):

- [`AUDIT_F6_PERFORMANCE_CERTIFICATION.md`](../../../docs/architecture/chat/AUDIT_F6_PERFORMANCE_CERTIFICATION.md)
- [`PERFORMANCE_BASELINE_F6.md`](../../../docs/architecture/chat/PERFORMANCE_BASELINE_F6.md)
- [`LEGACY_REMOVAL_READINESS.md`](../../../docs/architecture/chat/LEGACY_REMOVAL_READINESS.md)
- [`F7_READINESS_REPORT.md`](../../../docs/architecture/chat/F7_READINESS_REPORT.md)

Veredito: **GO condicionado** para F7; baseline live Network ainda a preencher em staging.

## F6.8 — Architecture Freeze

Contratos e camadas F1–F6 **congelados** (sem mudança funcional):

| Doc |
|---|
| [`F6_ARCHITECTURE_FREEZE_REPORT.md`](../../../docs/architecture/chat/F6_ARCHITECTURE_FREEZE_REPORT.md) |
| [`ADR-010-CHAT-ARCHITECTURE-FREEZE.md`](../../../docs/architecture/chat/ADR-010-CHAT-ARCHITECTURE-FREEZE.md) |
| [`PUBLIC_API_FREEZE.md`](../../../docs/architecture/chat/PUBLIC_API_FREEZE.md) |
| [`DOMAIN_STORE_FREEZE.md`](../../../docs/architecture/chat/DOMAIN_STORE_FREEZE.md) |
| [`FEATURE_FLAGS_AUDIT.md`](../../../docs/architecture/chat/FEATURE_FLAGS_AUDIT.md) |
| [`DEPENDENCY_GRAPH.md`](../../../docs/architecture/chat/DEPENDENCY_GRAPH.md) |
| [`STATIC_DEPENDENCY_REPORT.md`](../../../docs/architecture/chat/STATIC_DEPENDENCY_REPORT.md) |

Ver sub-sprints F5.1–F5.12 e F6.0–F6.8 em `docs/architecture/chat/`.
Ver também [`AUDIT_F5_FINAL.md`](../../../docs/architecture/chat/AUDIT_F5_FINAL.md).

## Phase 11 — Runtime Core (Sprint 6)

Com `CHAT_CORE_STORE` **ON**, o **Domain Store é o Runtime Core** (ADR-013).  
Path Store OFF permanece para rollback até **MB-028** (remoção física pós-canário).

| Doc |
|---|
| [`ADR-013-DOMAIN-STORE-RUNTIME-CORE.md`](../../../docs/architecture/chat/ADR-013-DOMAIN-STORE-RUNTIME-CORE.md) |
| [`PHASE11_LEGACY_RETIREMENT.md`](../../../docs/architecture/sprints/PHASE11_LEGACY_RETIREMENT.md) |
| [`SPRINT_6_CLOSEOUT.md`](../../../docs/architecture/sprints/SPRINT_6_CLOSEOUT.md) |
| `runtime/cachePrecedence.ts` — camada primária + aliases Phase 11 |
