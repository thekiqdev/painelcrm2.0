# AUDIT_RUNTIME_MULTIPLE_SOURCES — AUD-104 / AUD-105

| Campo | Valor |
|---|---|
| **Auditoria** | Phase 10C |
| **Data** | 2026-07-14 |

## Classificação

| Dado | Fontes | Classe |
|---|---|---|
| Instance list | HTTP cache, Registry, Chat useState, Float instanceIds, Store shadow | **DUPLICATE** + CACHE |
| Enabled IDs | Chat Set local; Float instanceIds; helpers Registry | **DUPLICATE** |
| Connected filter | Float RQ picker only; inbox uses **enabled** | PROJECTION vs filter |
| Conversation lista | Domain Store (ON) | **CANONICAL** (ON) |
| Conversation meta Float | RQ `conversation-meta` | **DUPLICATE** / CACHE |
| Conversation Chat OFF | useState | **LEGACY** |
| Preview | Conversation.lastMessage* | **CANONICAL** na row |
| Thread messages | Message Store (ON) / RQ Float OFF / Chat local OFF | **CANONICAL** Store ON |
| Header Chat | selectedConversation + CRM local | CANONICAL + local CRM |
| Header Float | RQ meta + identity RQ | **DUPLICATE** |
| Lead/Client detail | GET profile → local state | CACHE / ephemeral |
| Unread | Engine + conversation.unreadCount | CANONICAL engine + field |
| Attendance fields | Conversation Store | CANONICAL (ON) |
| Attendance counts | Engine / HTTP | CACHE + reconcile |
| Tags conversa | Conversation + local tag UI state | misto |
| Avatar | Conversation raw + identity helpers + CRM | **PROJECTION** multi |
| lastMessage / date | Conversation row **vs** messages[] last | **DUPLICATE semantic** |
| Kanban card | `conv_*` DTO | **PROJECTION** |

---

## Violations: HTTP → UI sem Store (AUD-105)

| Caso | Evidência |
|---|---|
| Float meta fetch `findChatConversationById` → RQ → header | `FloatingConversationWindow` conversation-meta |
| Kanban `listCards` → setState cards | `ChatKanbanPage` |
| Chat GET profile → setCurrentLead | `loadConversationProfile` |
| Instances HTTP → setInstances / setInstanceIds | Chat + FloatingProvider |
| Store OFF: GET messages → RQ/local | legado |
| Add-card Kanban GET conversations → local | picker efêmero |

## Estados React / RQ / Context com cópia

| Mecanismo | Entidade |
|---|---|
| `useState(conversations)` Chat | Conversation (OFF; SoT ON writes bridged) |
| `useState(messages)` Chat | Messages OFF |
| `useState(instances)` Chat | Instance |
| Float `instanceIds` | Instance |
| RQ conversation-meta / messages / lists | Conversation / Messages |
| `currentLead` / `currentClient` | CRM detail |
| Kanban `cards` / `columns` | Board DTO |
| Unread engine module state | Unread |
| Instance Registry module state | Instance |
| chatInstancesHttpCache module | Instance |
