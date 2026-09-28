# Phase 0 Baselines (MB-002)

| Campo | Valor |
|---|---|
| **MB** | MB-002 |
| **Sprint** | Phase 0 |
| **Data** | 2026-07-14 |
| **Nota** | Sprint de estabilização — **sem otimização**. Valores live incompletos marcados. |

## Network (auth / shell) — estrutural

| Passo | Endpoint | Fonte |
|---|---|---|
| T1 | `GET /api/auth/me` | `AuthContext` (AUDIT_END_TO_END) |
| T2 | `GET /api/auth/me/features` | serial após me |
| T3 | `GET /api/chat/migration-flags` | serial após me |
| T4 | `GET /api/me/tenant/my-permissions` | Permissions |
| Shell | company / instances / attendance-counts / socket | AppShell |

**Live HAR nesta sprint:** ⚠ Não capturado em browser automation nesta sessão — preencher em staging com DevTools ao smoke canário (MB-005).

## React Profiler

| Área | Status |
|---|---|
| Chat list / thread | ⚠ Requer Profiler manual staging |
| Referência estática | Chat.tsx monólito; Store virt quando flags ON |

## SQL EXPLAIN

| Query | Status Phase 0 |
|---|---|
| Inbox + `wa_archived = false` | Isolamento **adicionado**; EXPLAIN formal → Phase 3 (fora de escopo) |
| Contagens attendance + wa_archived | SQL atualizado; EXPLAIN deferred |

Comando sugerido (staging, não executado como otimização):

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*) FROM chat_conversations c
WHERE COALESCE(c.wa_archived, false) = false
LIMIT 1;
```

## DB inventory (local Docker — evidência)

```text
wa_archived column: present
(idx_chat_conversations_wa_archived WHERE wa_archived = true)
```

Repair migration 292 clears polluted `true` rows on migrate.

## KPI Framework

**No KPI Changes** (esta sprint não visa perf). Baselines são **instrumentação/documentação**.

## Update PERFORMANCE_BASELINE_F6

Complementar células `?` apenas quando live capturing for feita; não inventar ms.
