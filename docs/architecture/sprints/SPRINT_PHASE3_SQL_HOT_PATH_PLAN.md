# SPRINT_PHASE3_SQL_HOT_PATH_PLAN

| Campo | Valor |
|---|---|
| **Documento** | SPRINT_PHASE3_SQL_HOT_PATH_PLAN |
| **Phase** | 3 — SQL Hot Path |
| **Base** | MASTER_IMPLEMENTATION_PLAN |
| **Status** | Completed |
| **Data** | 2026-07-14 |
| **Gate anterior** | Phase 2 CLOSED |
| **Closeout** | `PHASE3_CLOSEOUT.md` — Gate Phase 3 **CLOSED** |

---

## Objetivo

Reduzir latência SQL nos hot paths Chat (lista conversas + mensagens) sem alterar contratos HTTP, FE ou Chat Core.

## Escopo

| MB | Query | Estratégia | Rollback |
|---|---|---|---|
| MB-011 | Legacy `getConversations` | Remover `MAX(messages)` correlacionado; usar `c.last_message_at` (+ SLA) | `CHAT_LIST_LEGACY_MESSAGES_MAX=1` |
| MB-012 | `getConversationMessages` | Substituir COUNT+json_agg **por mensagem** por 1 agregação scoped à conversa | `CHAT_MESSAGES_LEGACY_COMMENT_SUBQUERY=1` |
| MB-013 | Aggregated path | Dual-path mantido; promover como **recomendado** (F4 ops). Sem flip de catalog flags (fora de escopo) | Flag F4 OFF / legacy |

## Dataset lab (local Docker)

- conversations ≈ 527
- messages ≈ 458
- comments ≈ 0

EXPLAIN/ANALYZE obrigatório before/after neste Postgres.
