# AUDIT_SOCKET_HTTP_DEPENDENCIES — AUD-005 / AUD-006

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |
| **Investigation only** | Sim |

---

## AUD-005 — Eventos Socket → ações / HTTP

### Página Chat (`Chat.tsx`)

| Evento | Handler | Ações | GET? | invalidate? | reconcile? |
|---|---|---|---|---|---|
| `conversation_updated` / `conversation.updated` | merge local / SoT early-return | UI list/profile | **Não** (P9) | Não | Não |
| `message.created` / `new_message` | patch mensagens + lista | Store/local | **Não** | Não | Não |
| `conversation_attendance_updated` | engine + merge attendance fields | counts locais | **Não** | Não | Não |
| `message_updated` | WS-patch + merge | — | Não | Não | Não |
| `conversation.deleted` | SoT OFF: patch; fail → invalidate | — | **Condicional** | **Sim** se patch fail | Não |
| `chat.message_comment.created` | merge local | — | Não | Não | Não |
| `crm.note.created` | se perfil aberto → `listCrmNotes*` | notes CRM | **Sim pontual** | Não | Não |
| `reconnect` / error / failed | logs | — | Não | Não | Não |
| (qualquer) via `scheduleOperationsPanelRefresh` | `recordSocketUpdate()` only | métrica | **Não** | Não | Não |

`loadMessages` **não** é chamado pelos handlers WS atuais (apenas seleção / sync / after-send / archive…).

---

### chat-core bootstrap / Bridge window events

| Evento (window) | Handler | GET? | reconcile? |
|---|---|---|---|
| `messageCreated` | unread incremental + metric | Não | Não |
| `conversationUpdated` | unread from payload + metric | Não | Não |
| `channelStatusChanged` | instance registry status | Não | Não |
| `whatsappInstanceRemoved` | registry invalidate + **`requestChatReconcile('all','inconsistency')`** | **Sim one-shot** | **Sim** |
| Store Bridge events | `syncStoreFromSocketEvent` | Não | Não |
| `online` (storeBootstrap) | status Store only | Não | Não |

---

### Floating

| Path | GET após evento? |
|---|---|
| Store **ON** | **Não** (pulse UI + `emitChatNavUnreadRefresh`) |
| Store **OFF** + WS-patch applied | **Não** |
| Store **OFF** + patch fail | **Sim** via `invalidateQueries` → RQ GET |
| `notificationCreated` (Store OFF) | invalidate aggregates → pode GET lista |

---

### Chat Kanban — **residual crítico**

| Evento | Hook | Ação | GET? |
|---|---|---|---|
| `conversation_attendance_updated` | `useKanbanAttendanceSocketRefresh` | debounce 200ms → `refreshCardsOnly` | **Sim** `GET …/kanban/.../cards` (`listCards`) |
| `new_message` | idem | idem | **Sim** |
| `conversation_updated` | idem | idem | **Sim** |

Arquivo: `src/hooks/useKanbanAttendanceSocketRefresh.ts` → `ChatKanbanPage.refreshCardsOnly`.

Intervalo 20s **removido** (P9); HTTP pós-Socket **permanece**.

---

## AUD-006 — Reconcile / refresh helpers

| Função | Automática? | Timer? | Debounce? | Retry? | invalidate? | Call sites HTTP |
|---|---|---|---|---|---|---|
| `requestChatReconcile` | Login + instance removed | Não | Via coordinator | — | Não | **Sim** instances/attendance se flags |
| `scheduleChatAttendanceReconcile` | **Não** (0 callers FE) | debounce 2s se chamado | Sim | — | Não | N/A produção |
| `startChatUnreadPeriodicReconcile` | No-op | Interval limpo | — | — | Não | Não |
| `scheduleOperationsPanelRefresh` | Chamada de WS/send | Não | Não | Não | Não | **Não** (só métrica) |
| `loadMessages` | Select conversa / manual / after-send | Não periódico | — | — | Não | Sim one-shot |
| `loadConversations` | Effect filtros/instances | Não | — | — | Não | **Sim** + attendance acoplado |
| `fetchChatAttendanceCounts` | login, lista, nav, prefetch, archive | Não poll | — | — | Não | Sim |
| `refreshCardsOnly` (Kanban) | Socket (hook) + DnD/UI | debounce 200ms WS | Sim | — | Não | **Sim** |

Reasons órfãos (`reconnect`, `tab_visible`, `network_online` em types): **sem callers** atuais — alinhado P9.

---

## Resposta direta AUD-005/006

1. **Existe Socket → GET no Chat page principal?** Quase não; residual `crm.note.created` e delete→invalidate legado.  
2. **Existe Socket → GET no Kanban?** **Sim** — `listCards`.  
3. **Existe Socket → GET no Floating?** Só Store OFF / patch fail / notification aggregates.  
4. **Reconcile automático contínuo?** **Não**. Só login + inconsistência.
