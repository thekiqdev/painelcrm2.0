# SPRINT_TF8_E2_CLOSEOUT — operations-dashboard single-flight + TTL

| Campo | Valor |
|---|---|
| **Sprint** | TF8 · Etapa 2 |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Plano** | [`PLAN_TF8_SHELL_LOAD_SCALE.md`](./PLAN_TF8_SHELL_LOAD_SCALE.md) |
| **Data** | 2026-07-16 |
| **Comando** | `ok etapa 2` |

---

## Resumo

`GET /api/chat/operations-dashboard` passa a usar **single-flight + TTL 60s**, keyed por `tenantId:userId`. Chat (SLA), OperationalPanel e Settings compartilham o mesmo voo — F5/remount não multiplica HTTP.

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `operationsDashboardHttpCache.ts` | Promise in-flight + soft TTL **60 s** por chave |
| `chatService.getOperationsDashboard({ force? })` | Wrappa single-flight; chave via `getActiveChatCacheSession()` |
| `ChatOperationalPanel` | Mount usa cache; `refreshTrigger > 0` → `force` |
| Logout | `resetOperationsDashboardHttpCache` em `clearAllCachedAppData` |
| Testes | `operationsDashboardHttpCache.test.ts` (4) |

---

## Comportamento esperado

```
1. 1º caller → HTTP
2. Callers paralelos (mesmo key) → join in-flight
3. Remount / 2º caller em < 60s → cache hit (0 HTTP)
4. force / invalidate → novo GET
```

---

## Checklist manual

1. Abrir `/chat` (e opcionalmente Settings → Atendimento).  
2. F5 → em ~5 s: **≤1** GET `operations-dashboard`.  
3. Remount / navegar Chat↔outra rota↔Chat em &lt; 60 s → sem novo GET.  
4. Após 60 s ou logout → próximo acesso faz GET.

---

## Próximo

**`ok etapa 3`** — cap warmup de mensagens.
