# AUDIT_RUNTIME_CONVERSATION_FLOW

| Campo | Valor |
|---|---|
| **Auditoria** | Phase 10C |
| **Data** | 2026-07-14 |

## Pipeline Conversation (Store ON)

```
loadInboxCommand / WS conversation.* / CRM patch / Attendance
  → normalizeConversation (+ mappers)
  → Domain Store conversations upsert|replace|archive|…
  → selectConversationsForUi / selectConversationByIdForUi
  → Chat lista / Float lista / Chat header (parte)
```

## Bifurcações pós-Store

```
Conversation Store (canônico lista)
        │
        ├─► Chat selectedConversation + CRM local state
        ├─► Float lista (selector)
        ├─► Float header via RQ conversation-meta  ← paralelo
        ├─► Preview fields on row → lista/UI preview
        └─► (não alimenta) Messages Store
```

## Selection

| Superfície | Estado | Dados da conversa |
|---|---|---|
| Chat | `selectedConversationId` local | Store (ON) via view |
| Float | `panels[].conversationId` Context | Store lista; meta RQ |

Selection **não** é Domain Store; é UI owner.

## Write paths que tocam Conversation

| Write | Store ON |
|---|---|
| Inbox HTTP replace/upsert | Sim |
| Socket conversation.* | Sim (Bridge) |
| CRM / archive / transfer | applyStoreConversation* |
| Attendance engine | partial/upsert |
| Unread engine | unreadCount patches |
| Chat setConversations | bridge UI→Store (10B) |

## Residual paralelo

1. Float `conversation-meta` RQ — header/CRM meta.  
2. Kanban `conv_*` — board, não lista Chat.  
3. Flag OFF — local/RQ legado.
