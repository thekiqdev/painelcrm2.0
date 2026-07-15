# AUDIT_RUNTIME_READ_GRAPH — AUD-102

| Campo | Valor |
|---|---|
| **Auditoria** | Phase 10C |
| **Data** | 2026-07-14 |
| **Investigation only** | Sim |

---

## Árvore esperada (declarada Phases 9–10B)

```
Instance Registry
        │
        ▼
Conversation Store
        │
        ▼
Message Store
        │
        ▼
Selectors
        │
 ┌──────┼────────┐
 ▼      ▼        ▼
Chat   Floating Kanban
```

---

## Árvores **reais** (Store ON)

### Chat page

```
ensureChatInstances → HTTP cache (± Registry)
        │
        ▼
Chat useState(instances) + enabledInstanceIds   ← READ OWNER UI
        │
        ▼
loadInboxCommand → Conversation Store
        │
        ▼
useChatConversationList / useChatSelection
        │
        ├─► Lista (preview = conversation.lastMessage*)
        ├─► selectedConversationId (useState local)
        └─► useChatMessages → Message Store → Thread
```

### Floating

```
ensureChatInstances → instanceIds (Provider state)
        │
        ├─► useFloatingConversationListData → Conversation Store (lista + preview)
        │
        └─► Open window
                ├─► RQ conversation-meta          ← READ PARALELO header/CRM
                ├─► useFloatingConversationMessages → Message Store
                └─► RQ connected-instances (picker)
```

### Kanban

```
kanban.listCards → local useState(cards) com conv_*
        │
        └─► ChatKanbanCard (não lê Conversation/Message Store)
```

### Store OFF (legado)

```
Instances: same HTTP/local
Conversations: Chat useState | Float RQ lists
Messages: Chat useState | Float RQ messages
```

---

## Todos os caminhos de leitura atuais

| # | Path | Entidade |
|---|---|---|
| R1 | Registry / HTTP cache → UI local instances | Instance |
| R2 | Store conversations → Chat/Float list | Conversation |
| R3 | RQ `conversation-meta` → Float header | Conversation (**paralelo**) |
| R4 | Store messages → Chat/Float thread | Messages |
| R5 | RQ messages → Float thread | Messages (só OFF) |
| R6 | Chat local conversations/messages | Legacy OFF |
| R7 | Kanban `conv_*` DTO | Projection |
| R8 | GET profile → currentLead/Client | CRM detail |
| R9 | Unread engine | Unread |
| R10 | Page/IDB cache warm | Auxiliar (nunca SoT) |
