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
| **F5 Domain Store** | **Entregue (F5.7)** | `CHAT_CORE_STORE` (default OFF) |

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

Ver sub-sprints F5.1–F5.10 em `docs/architecture/chat/`.
