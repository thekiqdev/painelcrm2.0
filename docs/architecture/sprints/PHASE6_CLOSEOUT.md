# PHASE6_CLOSEOUT — React / UX Structure

| Campo | Valor |
|---|---|
| **Phase** | 6 — React / UX Structure |
| **Sprint** | SPRINT_PHASE6_REACT_UX_STRUCTURE |
| **Data** | 2026-07-14 |
| **Gate status** | **CLOSED** |
| **Pré-requisito** | Phase 5 CLOSED |

---

## Resumo executivo

Estrutura React do Chat e shell melhorada sem mudança funcional: monólito `Chat.tsx` decomado (−329 LOC no ficheiro), shell com memoização adicional (MainColumn, MobileNav, NavLinks), e commerce/dialogs do Chat em lazy chunks (−~348 kB no download inicial estimado do Chat). Contratos ADR-010 / Store / Flags intactos.

## MB executados

| MB | Resultado |
|---|---|
| MB-021 | **Done** — helpers + `ChatHeaderKanbanThreadExtras` + `useChatPageAccess` |
| MB-022 | **Done** — memo MainColumn/MobileNav; SidebarNavLinkItem; create-menu memo |
| MB-023 | **Done** — lazy Proposal/Contract/Invoice/Agenda/Schedule no Chat |

## MB não executados

Nenhum Incomplete do escopo Phase 6.

## Arquivos alterados

| Arquivo | MB |
|---|---|
| `src/pages/Chat.tsx` | 021, 023 |
| `src/pages/chat/chatPageHelpers.ts` | 021 |
| `src/pages/chat/ChatHeaderKanbanThreadExtras.tsx` | 021 |
| `src/pages/chat/useChatPageAccess.ts` | 021 |
| `src/layouts/shell/AppShellMainColumn.tsx` | 022 |
| `src/layouts/shell/AppShellSidebar.tsx` | 022 |
| `src/layouts/shell/AppShellHeaderActions.tsx` | 022 |
| `src/components/navigation/MobileAppNavigation.tsx` | 022 |
| `docs/architecture/sprints/SPRINT_PHASE6_*`, `PHASE6_*` | — |
| `docs/architecture/MASTER_IMPLEMENTATION_PLAN.md` | Gate / backlog Done |

## Component Inventory

Ver `PHASE6_COMPONENT_INVENTORY.md`.

## Bundle Before/After

| | Before (est.) | After (medido `build:crm`) |
|---|---:|---:|
| Chat chunk | ~618.9 kB | **271.20 kB** (gzip 61.94) |
| Commerce chunks (sob demanda) | no Chat graph | Proposal 41.4 + Contract 170.5 + Invoice 117.6 + Appt 18.1 |

Detalhe: `PHASE6_BENCHMARKS.md`.

## LOC Before/After

| | Before | After |
|---|---:|---:|
| `Chat.tsx` | **7829** | **7500** |

## Benchmark

Ver `PHASE6_BENCHMARKS.md` (LOC, chunks, lazy counts). Renders/long tasks/mount: não medidos em lab Profiler nesta sessão.

## QA

Ver `PHASE6_QA_REPORT.md` — build OK; checklist smoke estrutural; Auth/Store/WS não tocados.

## Regressões

Nenhuma funcional/visual conhecida. QA browser canário recomendado.

## Rollback

| MB | Como |
|---|---|
| 021 | Reverter extracts; colar helpers/component/hook de volta em `Chat.tsx` |
| 022 | Remover `React.memo` MainColumn/MobileNav; restaurar NavLinkItem inline |
| 023 | Restaurar imports sync de Proposal/Contract/Invoice/Agenda/Schedule |

Rollback **não** executado (sem regressão bloqueante).

## Pendências

1. Smoke browser canário (Chat commerce views + schedule dialog + shell nav).  
2. Profiler lab opcional (renders Header/Sidebar) para fechar métricas N/A.  
3. Phase 7 — executada e **CLOSED** (`PHASE7_CLOSEOUT.md`).

## Gate Phase 6

**PHASE 6 → CLOSED**
