# PHASE1_CLOSEOUT — Runtime Shell & Bootstrap

| Campo | Valor |
|---|---|
| **Phase** | 1 — Runtime Shell & Bootstrap |
| **Sprint** | SPRINT_PHASE1_RUNTIME_SHELL_BOOTSTRAP |
| **Data** | 2026-07-14 |
| **Gate status** | **CLOSED** |
| **Pré-requisito** | Phase 0 CLOSED |

---

## Resumo executivo

Waterfall auth pós-`/me` passou de **features → flags (serial)** para **features ∥ flags**. Soft-lazy do shell adía Brand e Unread do critical path. Nenhum contrato HTTP, Chat Core, Store, SQL ou Workers foi alterado.

## MB executados

| MB | Resultado | Evidência |
|---|---|---|
| MB-006 | **Done** | `authBootstrap.ts` + `AuthContext.tsx`; testes paralelos |
| MB-007 | **Done** | `TenantBrandContext.tsx`, `ChatNavUnreadScope.tsx` |

## MB não executados

Nenhum autorizado ficou Incomplete. Nenhum outro MB iniciado.

## Arquivos alterados

| Arquivo | MB | Motivo | Impacto |
|---|---|---|---|
| `docs/architecture/sprints/SPRINT_PHASE1_RUNTIME_SHELL_BOOTSTRAP_PLAN.md` | — | Plano oficial | Docs |
| `docs/architecture/sprints/PHASE1_METRICS_MB006_MB007.md` | 006/007 | Métricas | Docs |
| `docs/architecture/sprints/PHASE1_CLOSEOUT.md` | — | Closeout | Docs |
| `docs/architecture/MASTER_IMPLEMENTATION_PLAN.md` | Gate | Status MB + Gate Closed | Docs |
| `src/contexts/authBootstrap.ts` | MB-006 | Helper `Promise.all` + marks | Auth bootstrap |
| `src/contexts/authBootstrap.test.ts` | MB-006 | Prova paralelização | Test |
| `src/contexts/AuthContext.tsx` | MB-006 | Usa parallel post-me; remove features duplicado no signIn | Auth restore / login |
| `src/contexts/TenantBrandContext.tsx` | MB-007 | Soft-lazy company fetch | Shell brand |
| `src/layouts/shell/ChatNavUnreadScope.tsx` | MB-007 | Soft-lazy unread enable | Shell nav badge |

## Evidências

- Vitest: `src/contexts/authBootstrap.test.ts` — **2 passed**
- Lab wall-clock parallel vs serial: ver `PHASE1_METRICS_MB006_MB007.md` (média 92→47 ms no estágio pós-/me simulado 40+40)
- Código: hops auth 3→2 documentados

## QA

| Caso | Resultado |
|---|---|
| Login / Logout / Refresh / Auth Restore | Lógica preservada; smoke browser **pendente** (API offline) |
| Multi-tenant / Permissions / Feature Flags | Contratos e fluxos inalterados; permissions provider não tocado |
| Navegação / Dashboard / Chat / CRM / Financeiro / Agenda / Settings | Sem mudanças de rotas; unread/badge adiado (não bloqueia nav) |
| Unit MB-006 | ✓ |

## Métricas / Comparativo Before–After

Ver `PHASE1_METRICS_MB006_MB007.md`.

Absolutos staging (HAR / TTI): ⚠ capturar no smoke com marks `[perf:auth]` — **não estimados**.

## Rollback

| Camada | Como |
|---|---|
| Código | Reverter arquivos da tabela acima |
| Flags / DB | N/A (sem alteração) |

Rollback **não** executado — entrega estável; testes unitários verdes; mudanças aditivas/comportamento funcional equivalente.

## Pendências

1. Smoke manual com backend UP (checklist completo do sprint plan).
2. Preencher células live ⚠ na tabela de métricas (console + Network).
3. Não iniciar Phase 2 até aceite explícito deste Gate.

## Problemas encontrados (fora de escopo — não implementados)

| Achado | Ação |
|---|---|
| Permissions ainda serial após Auth `loading=false` | Documentado; colapsar auth+permissions → Future / não Phase 1 obrigatório |
| API local offline | Live HAR adiado |

## Gate Phase 1

**PHASE 1 → CLOSED**

Phase 2 **não** autorizada até Sprint Plan Phase 2 aprovado sob MASTER gates.
