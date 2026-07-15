# PHASE11_LEGACY_RETIREMENT — Checklist (MB-028 gate)

| Campo | Valor |
|---|---|
| **Phase** | 11 / Sprint 6 |
| **Data** | 2026-07-15 |
| **ADR** | ADR-013 |
| **Delete físico** | **NÃO nesta sprint** — MB-028 |

---

## Runtime Core (já oficial)

Com `CHAT_CORE_STORE=ON`: Domain Store = Runtime Core (ADR-013).

## O que Sprint 6 NÃO faz

- Não remove código Store OFF
- Não altera default do catálogo de flags
- Não unifica Kanban (Sprint 5 A)

## Pré-requisitos para MB-028 (remoção física)

| # | Critério | Owner |
|---|---|---|
| 1 | `CHAT_CORE_STORE=ON` estável em DEP/prod (canário acordado) | Ops / Arch |
| 2 | Sem regressão Chat/Float (Preview, Header, Instance, CRM link) | QA |
| 3 | Tracker: itens ROLLBACK → REMOVE_READY | Arch |
| 4 | PR dedicado só-remoção + testes | Eng |
| 5 | Plano de rollback documentado (religar flag OFF) | Ops |

## Inventário Store OFF (rollback — manter)

| Superfície | Path OFF | Path ON |
|---|---|---|
| Chat lista | `useState(conversations)` | Domain Store selectors |
| Chat messages | `useState(messages)` + IDB warm | `loadMessagesCommand` + Store |
| Float lista | RQ `floating-chat/conversations` | `useFloatingConversationListData` Store |
| Float messages | RQ messages | `useFloatingConversationMessages` Store |
| Float meta | RQ `conversation-meta` + findById | `useFloatingConversationMeta` Store |
| WS Float | `tryApplyChatWsPatch` + invalidate | Bridge → Store |

## Status pós-Sprint 6

| Item | Classificação |
|---|---|
| Dual-path Store OFF | **ROLLBACK** (até MB-028) |
| Runtime Core declarado | **DONE** (ADR-013) |
| Removido do repo | **0** |
