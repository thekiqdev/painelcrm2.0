# SPRINT_PHASE6_REACT_UX_STRUCTURE_PLAN

| Campo | Valor |
|---|---|
| **Documento** | SPRINT_PHASE6_REACT_UX_STRUCTURE_PLAN |
| **Phase** | 6 — React / UX Structure |
| **Base** | MASTER_IMPLEMENTATION_PLAN |
| **Status** | Done |
| **Data** | 2026-07-14 |
| **Gate anterior** | Phase 5 CLOSED |
| **Gate resultado** | Phase 6 CLOSED |

---

## Escopo autorizado

| MB | Entrega | Rollback |
|---|---|---|
| MB-021 | Helpers + `ChatHeaderKanbanThreadExtras` + `useChatPageAccess` fora de `Chat.tsx` | restaurar monolito / imports |
| MB-022 | `React.memo` MainColumn + MobileNav; SidebarNavLinkItem memo; create-menu `useMemo` | rememorize revert |
| MB-023 | Lazy `ProposalCreateForm` / `ContractCreateForm` / `CustomerInvoiceNew` / agenda + schedule dialogs no Chat | sync imports |

**Sem** mudança Store / Commands / Repository / Public API / Feature Flags / rotas / SQL / Backend.

## Baseline pré-sprint (números reais)

| Métrica | Valor |
|---|---|
| `Chat.tsx` LOC | **7829** (antes da extração) |
| Rotas domínio | já `lazyWithReload` em `App.tsx` |
| Shell Header/Sidebar/Actions | já `React.memo` (lacuna: MainColumn, MobileNav, NavLink local) |

## Closeout

Ver `PHASE6_CLOSEOUT.md`, `PHASE6_BENCHMARKS.md`, `PHASE6_COMPONENT_INVENTORY.md`, `PHASE6_QA_REPORT.md`.
