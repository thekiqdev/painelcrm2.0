# SPRINT_TF8_E1_CLOSEOUT — F5 inbox skip + soft reconcile WS

| Campo | Valor |
|---|---|
| **Sprint** | TF8 · Etapa 1 |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Plano** | [`PLAN_TF8_SHELL_LOAD_SCALE.md`](./PLAN_TF8_SHELL_LOAD_SCALE.md) |
| **Preflight** | [`AUDIT_TF8_PREFLIGHT_RISKS.md`](./AUDIT_TF8_PREFLIGHT_RISKS.md) |
| **Data** | 2026-07-16 |
| **Comando** | `ok etapa 1` |

---

## Resumo

No F5, o seed do disk usa TTL **5 min** (mesmo com WS down). A lista pinta do cache **sem** GET no boot. Quando o realtime conecta, roda **1×** soft reconcile (`force` GET) — regra de ouro do preflight.

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `markInboxFreshFromClient` | Valida idade do disk com `INBOX_FRESH_TTL_MS`; grava `at: Date.now()` para skip no boot |
| `scheduleInboxSoftReconcileOnRealtimeConnected` | Agenda force se WS down; no-op se já connected |
| Bridge | `subscribeChatRealtimeBridgeStatus` + notify em connect/reconnect |
| Chat + Float | Após seed OK → schedule soft reconcile |
| Diag | `inbox_soft_reconcile`, reason em `inbox_fetch_skipped_fresh` |
| Testes | `store.tf8.e1-f5-soft-reconcile.test.ts` (4) + TF7 E2 atualizado |

---

## Comportamento esperado no F5

```
1. warm disk → Store
2. seed freshness (disk < 5 min) → skip GET boot
3. WS connect → 1× GET force (soft reconcile)
```

---

## Checklist manual

1. Abrir `/chat`, esperar lista OK.  
2. F5 em &lt; 5 min → lista aparece sem GET `limit=50` no boot.  
3. Após WS conectar → no máximo **1** GET `limit=50`.  
4. Menu filtro → “Atualizar lista” → GET imediato.  
5. Console DEV: `inbox_warm_hit` / `inbox_fetch_skipped_fresh` / `inbox_soft_reconcile`.

---

## Próximo

**`ok etapa 2`** — `operations-dashboard` single-flight + TTL.
