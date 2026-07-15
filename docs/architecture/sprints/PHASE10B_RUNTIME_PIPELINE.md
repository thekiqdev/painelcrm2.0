# PHASE10B_RUNTIME_PIPELINE — MB-061

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |

## Pipeline canônico (Store ON)

```
HTTP inbox / link / messages sync
        │
Socket (Bridge → domain events)
        │
        ▼
normalizeConversation  (única entrada API → ChatConversation)
        │
        ▼
mapLegacyConversationToDomain  (uma chamada; sem adapt prévio)
        │
        ▼
Domain Store (conversations.byId / orderedIds)
        │
        ▼
domainConversationToUi → selectors
        │
   ┌────┼────┐
   ▼    ▼    ▼
 Chat Floating (list)  CRM panel (via selection)
```

## Entradas mapeadas

| Origem | Path pós-10B (Store ON) |
|---|---|
| GET conversations | `loadInboxCommand` → Store |
| POST link / archive / CRM | `applyStoreConversationUpsert` / PartialPatch |
| Chat bumps / attendance merge local | `setConversations` → `applyStoreConversationsUiUpdate` |
| Floating CRM | Store patch + meta RQ (header coexistence) |
| Socket | Bridge → `pickConversationPatch` (1× map) → Store |
| Kanban `listCards` | **Fora do pipeline** — DTO `conv_*` (residual) |

## Gaps residuais

1. Floating `conversation-meta` RQ (header/window) — lê paralelo; writes CRM já atualizam Store.  
2. Kanban board cards — projeção SQL/API kanban, não `ChatConversation`.  
3. Store OFF — Chat local `useState` + Floating RQ (coexistência obrigatória por flags).
