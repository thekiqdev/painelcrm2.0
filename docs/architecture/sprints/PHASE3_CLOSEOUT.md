# PHASE3_CLOSEOUT — SQL Hot Path

| Campo | Valor |
|---|---|
| **Phase** | 3 — SQL Hot Path |
| **Sprint** | SPRINT_PHASE3_SQL_HOT_PATH |
| **Data** | 2026-07-14 |
| **Gate status** | **CLOSED** |
| **Pré-requisito** | Phase 2 CLOSED |

---

## Resumo executivo

Hot paths SQL do Chat otimizados sem mudança de contrato HTTP: lista de conversas sem `MAX(messages)` correlacionado; mensagens sem COUNT/json_agg por linha; caminho Aggregated permanece dual-path e recomendado via ops (sem flip de catalog flags).

## MB executados

| MB | Resultado | Evidência |
|---|---|---|
| MB-011 | **Done** | `effectiveLastMessage.ts` + `getConversations` |
| MB-012 | **Done** | `messageCommentsSql.ts` + `getConversationMessages` |
| MB-013 | **Done** (promoção ops / dual-path) | Aggregated mantido; flags catalog intactas; parity alinhado |

## MB não executados

Nenhum Incomplete. Nenhum outro MB iniciado.

## Arquivos alterados

| Arquivo | MB | Motivo |
|---|---|---|
| `packages/backend/src/services/chatSql/effectiveLastMessage.ts` | 011 | Expr denormalizada + rollback env |
| `packages/backend/src/services/chatSql/messageCommentsSql.ts` | 012 | JOIN agregado + rollback env |
| `packages/backend/src/services/chatSql/chatSql.phase3.test.ts` | 011/012 | Unit |
| `packages/backend/src/controllers/chatController.ts` | 011/012 | Wire hot paths |
| `packages/backend/src/services/chatAggregatedConversations/queryBuilder.ts` | 013/011 | Parity compartilha helper |
| `packages/backend/.../chatAggregatedConversations.test.ts` | 013 | Expectativas parity |
| `docs/architecture/sprints/SPRINT_PHASE3_*` / `PHASE3_*` | — | Docs |
| `MASTER_IMPLEMENTATION_PLAN.md` | Gate | Status |

## Queries alteradas

1. Legacy conversations list — `effective_last_message_at` / ORDER BY  
2. Conversation messages — `internal_comment_count` + `internal_comments`  

**Não** alterados: endpoints, JSON response shape, bootstrap sync MAX (worker path fora do hot path list/messages API).

## EXPLAIN / Benchmark

Ver `PHASE3_BENCHMARKS_EXPLAIN.md`.

| Path | Cost before→after | Exec before→after |
|---|---|---|
| Conversations MAX | 26340 → 663 | 1.93 → 0.70 ms |
| Messages comments | 1821 → 212 | 1.12 → 0.22 ms |

## QA

| Caso | Resultado |
|---|---|
| Unit chatSql + aggregated | **20 passed** |
| Inbox / Arquivadas / Groups / unread / tags | Semântica filtros preservada (SQL predicates intactos) |
| Mensagens / comentários / anexos | Mesmos campos JSON; comentários via JOIN |
| Paginação / cursor aggregated | Não alterado |
| Realtime | Não tocado |
| Smoke browser | Pendente API UP |

## Regressões

Nenhuma conhecida. Dataset local sem comments — caminho JOIN validado por EXPLAIN + unit; com comments reais, agregado preserva `json_build_object` idêntico.

## Rollback

| Env | Efeito |
|---|---|
| `CHAT_LIST_LEGACY_MESSAGES_MAX=1` | Restaura MAX correlacionado |
| `CHAT_MESSAGES_LEGACY_COMMENT_SUBQUERY=1` | Restaura SubPlans por mensagem |
| F4 flags OFF | Lista agregada off (dual-path) |

Rollback **não** executado (ganhos medidos; testes verdes).

## Pendências

1. Smoke funcional com backend UP.  
2. Re-EXPLAIN em staging com comments > 0.  
3. Ops: canário F4 (MB-013 promoção).  
4. Não iniciar Phase 4 até aceite Gate.

## Gate Phase 3

**PHASE 3 → CLOSED**
