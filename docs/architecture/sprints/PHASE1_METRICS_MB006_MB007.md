# Phase 1 Metrics — MB-006 / MB-007

| Campo | Valor |
|---|---|
| **Sprint** | Phase 1 Runtime Shell & Bootstrap |
| **Data** | 2026-07-14 |
| **Ambiente lab** | Node local (backend API **offline** nesta sessão — sem HAR browser) |
| **Instrumentação DEV** | `perf:auth-me`, `perf:auth-post-me-parallel`, `perf:auth-total`, `perf:shell` |

---

## Before / After — estrutura (medição de hops, código + Network esperado)

| Métrica | Before (Phase 0 baseline estrutural) | After (Phase 1) |
|---|---|---|
| Waterfall auth pós-token | `me` → `features` → `migration-flags` (3 hops serial) | `me` → (`features` ∥ `migration-flags`) (**2** hops serial) |
| Requests features no login | `fetchCurrentUser` + `fetchMeFeatures` extra em `signIn` | Só via `fetchCurrentUser` (1 ciclo features) |
| Brand `GET .../company` | Imediato no mount do AppShell | Idle / interaction (soft-lazy) |
| Unread instances + attendance-counts | Imediato quando chat+perm OK | Idle / interaction (soft-lazy) |
| Permissions `GET .../my-permissions` | Inalterado (após user) | Inalterado |
| Contratos HTTP / responses | — | **Sem alteração** |

## Lab wall-clock — paralelização pós-/me (medição real)

Simulação com delay **igual** por hop (40 ms), 5 amostras — representa o ganho do `Promise.all` vs serial, **não** substitui TTI de staging:

| Amostra | Serial (features+flags) ms | Parallel ms |
|---|---|---|
| 1 | 91 | 46 |
| 2 | 91 | 47 |
| 3 | 92 | 47 |
| 4 | 93 | 47 |
| 5 | 94 | 46 |
| **Média** | **92** | **47** |
| **Δ** | | **−45 ms** (~49% no estágio pós-/me) |

Teste unitário `authBootstrap.test.ts`: parallel wall < 55 ms para 2×30 ms; serial baseline 2×25 ms ≥ 45 ms e > parallel.

## Staging / browser (a capturar no smoke)

Com API + front UP, no DevTools Console após refresh autenticado:

```
[perf:auth] perf:auth-me = …
[perf:auth] perf:auth-post-me-parallel = …
[perf:auth] perf:auth-total = …
[perf:shell] AppShell ready @ …ms from bootstrap
```

Preencher tabela ao smoke:

| Métrica live | Before | After | Fonte |
|---|---|---|---|
| Tempo bootstrap (boot→auth ready) | ⚠ | ⚠ | Console marks |
| Tempo até AppShell | ⚠ | ⚠ | `perf:shell` |
| Tempo Auth total | ⚠ | ⚠ | `perf:auth-total` |
| Tempo Dashboard | ⚠ | ⚠ | `perf:dashboard` |
| Nº requests critical-path até shell | me+feat+flags+perms(+brand+unread) | me+feat∥flags+perms (brand/unread idle) | Network |
| Waterfall | 3 serial auth | 2 serial auth | Network |
| Hidratação | ⚠ | ⚠ | Profiler |

**Status:** valores absolutos de staging **não** inventados — backend offline nesta sessão.

## Contagem de requests (critical path até shell interativo)

| Fase | Before | After |
|---|---|---|
| Auth restore critical | 3 serial | 2 serial (1 paralelo composto) |
| Shell mount imediato | +company +unread bootstrap | +0 (adiados) |
| Pós-idle | — | +company +unread |
