# Phase 2 Metrics — MB-008 / MB-009 / MB-010

| Campo | Valor |
|---|---|
| **Sprint** | Phase 2 HTTP Dedup |
| **Data** | 2026-07-14 |
| **Método** | Contagem estrutural + unit tests com fetch mock (API browser offline) |

---

## Before / After — requests

| Endpoint / carga | Before | After | Evidência |
|---|---|---|---|
| `GET /api/chat/instances` (Unread+Float+Chat concurrent) | até **3** HTTP (F3 OFF) | **1** HTTP (inFlight join) | `chatInstancesHttpCache.test` 3→1 |
| `GET /api/chat/instances` (repeat within TTL) | N HTTP | **0** extra (soft cache) | cache test |
| Chat mount `GET` clients | **1** | **0** | Chat.tsx mount effect |
| Chat mount `GET /api/leads` | **1** | **0** | Chat.tsx mount effect |
| Clients/Leads | on mount | on `linkDialogOpen` | MB-009 |
| `GET /api/me/tenant/company` Brand∥Settings parallel | até **2** | **1** | `tenantCompanyHttpCache.test` |
| Company repeat within TTL | 2+ | cache hit | soft cache |

## Medições unitárias (reais)

### MB-008 — 3 callers paralelos

```
httpExecuted=1, inFlightJoins=2  → 2 requests eliminadas no ciclo frio
```

### MB-010 — 2 callers paralelos

```
httpExecuted=1, inFlightJoins=1  → 1 request eliminada
```

### MB-009 — mount Chat

```
clients + leads removidos do mount → 2 requests eliminadas por abertura de /chat
(recuperadas só ao abrir Vincular)
```

## Absolutos staging (HAR)

| Métrica | Before | After |
|---|---|---|
| Tempo abertura Chat | ⚠ | ⚠ |
| Waterfall browser | ⚠ | ⚠ |

Não estimados — preencher com Network quando API UP. Marks estruturais + testes são a evidência desta sprint.

## Requests eliminadas (por ciclo típico cold Chat + shell)

| Item | Δ requests |
|---|---|
| Instances (3→1) | −2 |
| Clients mount | −1 |
| Leads mount | −1 |
| Company Brand∥Settings (2→1) | −1 |
| **Total típico** | **−5** (condições: F3 OFF ou cold registry; Brand+Settings no mesmo ciclo) |
