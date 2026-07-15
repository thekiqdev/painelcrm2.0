# DEPENDENCY_GRAPH — Chat Enterprise (F6.8 Freeze)

| Campo | Valor |
|---|---|
| **Documento** | DEPENDENCY_GRAPH |
| **Data** | 2026-07-13 |
| **Sprint** | F6.8 |

---

## 1. HTTP / Commands / Store / UI

```text
Chat.tsx / Floating UI
        │
        ▼
chatCoreCommands / chatCommandBridge
        │
        ├──────────────► Repository / chatService ──► Backend HTTP
        │
        ▼
   Domain Store  (write)
        │
        ▼
    Selectors
        │
        ▼
     Hooks (useChat* / useFloating* / useStableSelector)
        │
        ▼
   Components (virt rows, composer, sidebar)
```

---

## 2. Realtime

```text
Socket.IO
     │
     ▼
ChatRealtimeBridge.subscribe
     │
     ▼
syncStoreFromSocketEvent
     │
     ▼
dispatchBatch / reduceChatDomainState
     │
     ▼
Domain Store
     │
     ▼
useStableSelector / hooks
     │
     ▼
UI
```

Fallback F1 OFF (ROLLBACK):

```text
window CustomEvent / sockets dedicados → sync / RQ patch
```

---

## 3. Cursor / Window / Virt / Prefetch

```text
loadMessagesCommand (latest page)
        │
        ▼
messages/set + setCursor
        │
        ▼
Window Cache (register/trim/evict)
        │
        ├── useConversationWindow / useWindowMemory
        │
loadMessagesCursorCommand
        │
        ▼
messages/prependPage + scroll preserve
        │
        ▼
Message Virtual Engine (Chat + STORE ON)
Conversation Virtual Engine (sidebar STORE ON)
        │
useConversationWarmup (idle) ──► loadMessagesCommand (cold only)
```

---

## 4. Camadas congeladas (boundary)

```text
┌─────────────────────────────────────────────────────┐
│  F6 FREEZE BOUNDARY                                  │
│  Commands · Repository · Store · Bridge · Cursor ·   │
│  Window · Virt · Prefetch · Metrics · Public Hooks   │
└─────────────────────────────────────────────────────┘
          ▲                              │
          │                              ▼
   Feature Flags                  F7 Redis / multi-node
   (outside mutate schemas)       (infra ON TOP)
```

---

## 5. Módulos → dependências permitidas

| From \ To | Cmd | Repo | Store | Bridge | UI |
|---|---|---|---|---|---|
| UI | ✅ | ❌ direto | via hooks | ❌ | — |
| Commands | — | ✅ | ✅ | ❌ | ❌ |
| Bridge | ❌ | ❌ | ✅ sync | — | ❌ |
| Hooks | ❌ | ❌ | read/sub | ❌ | ❌ |
| Prefetch | ✅ loadMessages | ❌ | read | ❌ | ❌ |

**Regra:** UI **não** importa `session`, `actions`, `integration` — só `store/public`.

---

## Aceite

| Critério | Status |
|---|---|
| Diagramas oficiais publicados | ✅ |
| Bypass STORE ON documentado como residual muted | ✅ |
| Freeze boundary explícita | ✅ |
