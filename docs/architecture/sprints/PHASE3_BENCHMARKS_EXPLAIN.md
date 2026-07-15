# Phase 3 Benchmarks & EXPLAIN — MB-011 / MB-012 / MB-013

| Campo | Valor |
|---|---|
| **Ambiente** | Docker `painelcrm_postgres` local |
| **Data** | 2026-07-14 |
| **Dataset** | conversations=527 · messages=458 · comments=0 |

---

## MB-011 — Conversations (effective last message)

### Shape before (correlated MAX)

```sql
COALESCE(
  (SELECT MAX(COALESCE(m.sent_at, m.created_at))::timestamptz FROM chat_messages m WHERE m.conversation_id = c.id),
  c.last_message_at
)
... ORDER BY ... LIMIT 200
```

### EXPLAIN ANALYZE — Before

| Métrica | Valor |
|---|---|
| Planner cost (Limit) | **26339.78..26340.28** |
| Execution Time | **1.931 ms** |
| Shared buffers hit | **1838** |
| Pattern | Seq Scan + **SubPlan Aggregate × 527 loops** |
| Index | Bitmap Index `idx_chat_messages_conversation_provider` |

### Shape after (denormalized)

```sql
COALESCE(c.last_message_at, c.created_at)
... ORDER BY ... LIMIT 200
```

### EXPLAIN ANALYZE — After

| Métrica | Valor |
|---|---|
| Planner cost (Limit) | **662.89..663.39** |
| Execution Time | **0.704 ms** |
| Shared buffers hit | **650** |
| Pattern | Seq Scan + Sort (**sem SubPlan**) |

### Δ

| | |
|---|---|
| Cost | 26340 → 663 (**≈ −97.5%**) |
| Exec | 1.931 → 0.704 ms (**≈ −63.5%**) |
| Buffers | 1838 → 650 (**≈ −65%**) |

Rollback: `CHAT_LIST_LEGACY_MESSAGES_MAX=1`

---

## MB-012 — Messages comments

Conversation sample: `9936fbe5-…` (100 messages).

### Before — 2 SubPlans / message

| Métrica | Valor |
|---|---|
| Planner cost | **184.50..1821.50** |
| Execution Time | **1.118 ms** |
| Buffers | **252** |
| Pattern | SubPlan1 COUNT ×100 + SubPlan2 json_agg ×100 |

### After — 1 scoped GroupAggregate + JOIN

| Métrica | Valor |
|---|---|
| Planner cost | **212.17..212.42** |
| Execution Time | **0.222 ms** |
| Buffers | **49** |
| Pattern | Nested Loop Left Join + GroupAggregate **1×** |

### Δ

| | |
|---|---|
| Cost upper | 1821 → 212 (**≈ −88%**) |
| Exec | 1.118 → 0.222 ms (**≈ −80%**) |
| Buffers | 252 → 49 (**≈ −81%**) |

Rollback: `CHAT_MESSAGES_LEGACY_COMMENT_SUBQUERY=1`

---

## MB-013 — Aggregated path

| Item | Status |
|---|---|
| Dual-path | **Mantido** (`useAggregatedApi` / F4 flags) |
| Hot path aggregated (parityMode=false) | Já denormalizado `last_message_at` |
| Catalog Feature Flags | **Não alterado** (fora de escopo) |
| Promoção | **Ops**: ligar F4 no Super Admin / canário; legado SQL otimizado permanece |

Nenhum flip de flag neste código.
