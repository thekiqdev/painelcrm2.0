# AUDIT_RUNTIME_DIAGRAM — AUD-114

| Campo | Valor |
|---|---|
| **Auditoria** | Phase 10C |
| **Data** | 2026-07-14 |

## Diagrama oficial esperado (alvo)

```
Instance Runtime
        │
        ▼
Conversation Runtime
        │
        ▼
Message Runtime
        │
        ▼
Selectors
        │
 ┌──────┼──────────┐
 ▼      ▼          ▼
Chat   Floating   Kanban
```

## Diagrama oficial real (implementado hoje)

```
                    ┌─────────────────────────┐
                    │ GET /api/chat/instances │
                    └───────────┬─────────────┘
                                ▼
                    ┌─────────────────────────┐
                    │ chatInstancesHttpCache  │
                    └───────────┬─────────────┘
                                ▼
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
     Instance Registry (±)              HTTP list raw
              │                                   │
              └───────────────┬───────────────────┘
                              ▼
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
  Chat useState         Float instanceIds     Store instances?
  + enabled Set         (+ connected RQ)      (shadow / optional)
         │                    │
         └──────────┬─────────┘
                    ▼
         loadInboxCommand(instanceIds)
                    ▼
         ┌──────────────────────┐
         │ Domain Conversation  │◀── WS conversation.* / CRM / attendance / unread
         │ Store (CANONICAL ON) │
         └──────────┬───────────┘
                    │
       ┌────────────┼────────────┬──────────────────┐
       ▼            ▼            ▼                  ▼
  Chat lista   Float lista   Preview fields    Float HEADER
  Chat header                on conversation   RQ conversation-meta ★
  (selecionado)              row               (HTTP paralelo)
       │            │
       │            │
       ▼            ▼
  selectedId    panels[].id
  (local)       (Context)
       │            │
       └──────┬─────┘
              ▼
    loadMessagesCommand
              ▼
    ┌─────────────────────┐
    │ Domain Message Store│◀── WS message.created (append only)
    │ (CANONICAL ON)      │    NÃO atualiza preview
    └──────────┬──────────┘
               ▼
          Thread UI
      Chat / Floating

┌─────────────────────────────────────────────────────────────┐
│ PARALLEL: Kanban                                            │
│ GET listCards → conv_* DTO → ChatKanbanPage local state     │
│ (± socket → GET residual Phase 9)                           │
└─────────────────────────────────────────────────────────────┘
```

**★** = violação Ownership (HTTP/RQ → UI sem Store).

## Read graph compacto (AUD-102)

```
Instances (multi) → Inbox filter → Conversation Store
                                      ├─ Selectors → Chat / Float lists / Preview
                                      ├─ RQ meta → Float header ★
                                      └─ Selection local → Messages Store → Threads
Kanban DTO ★
```

## Write graph compacto (AUD-103)

```
HTTP inbox/messages/CRM/attendance/unread
Socket conversation.* / message.* / presence*
Local UI actions (CRM, archive, transfer, tags)
        │
        ▼
 normalize / mapLegacy / domain mappers
        │
        ▼
 Domain Store (conversations | messages)   OR   RQ / useState (OFF / meta / Kanban)
        │
        ▼
 Selectors / RQ cache / local setState
        │
        ▼
 UI
```
