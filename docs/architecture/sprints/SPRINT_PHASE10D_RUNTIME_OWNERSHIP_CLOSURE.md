# SPRINT_PHASE10D_RUNTIME_OWNERSHIP_CLOSURE

| Campo | Valor |
|---|---|
| **Sprint** | Phase 10D — Runtime Ownership Closure (Preview ↔ Messages) |
| **Status** | IMPLEMENTED |
| **Prioridade** | P0 |
| **Data** | 2026-07-15 |
| **Tipo** | Frontend Runtime Hardening |
| **Backend / SQL / Redis / Socket Protocol / Workers / Flags / ADR** | **Não alterados** |

## Objetivo

Preview da Conversation deixa de ter vida própria quando a Thread está hydrated: deriva exclusivamente da última Message do Domain Store.

## Fluxo oficial

```
Socket / HTTP
        │
        ▼
Message Store  (append / set / update / remove)
        │
        ▼
syncConversationPreviewFromMessages()
        │
        ▼
Conversation.lastMessagePreview / lastMessageAt
        │
        ▼
Selectors → Chat / Floating
```

## MB

| MB | Entregável / ação |
|---|---|
| 081 | `PHASE10D_PREVIEW_OWNERSHIP.md` |
| 082 | `PHASE10D_MESSAGE_PIPELINE.md` |
| 083 | `PHASE10D_PREVIEW_CONTRACT.md` |
| 084–088 | Reducer + hydrate generation metrics |
| 089 | `previewMessagesMetrics.ts` |
| 090 | `PHASE10D_QA_REPORT.md` + testes |

## Código

| Arquivo | Mudança |
|---|---|
| `store/previewFromMessages.ts` | derive + sync Preview ← Messages |
| `store/actions.ts` | sync em messages/* e conversations/upsert |
| `core/loadMessages.ts` | `hydrate_generation_mismatch` |
| `metrics/previewMessagesMetrics.ts` | MB-089 |
| `store.phase10d.preview-messages.test.ts` | cobertura |

## Residuais explícitos (fora 10D)

- Floating `conversation-meta` RQ (header) — Phase 10E.
- Instance dual path — Phase 10F.
- Inbox Preview **sem** thread hydrated ainda pode vir de HTTP/`conversation.updated` até abrir a conversa.
- Store OFF / Kanban — inalterados.
