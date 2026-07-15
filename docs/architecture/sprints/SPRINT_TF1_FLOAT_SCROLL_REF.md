# SPRINT_TF1 — Float scroll ref + virtualizer paint

| Campo | Valor |
|---|---|
| **Sprint** | TF1 / 1 |
| **Plano** | `PLAN_CHAT_THREAD_SURFACE_FIXES.md` |
| **Status** | IN PROGRESS → ver closeout |
| **Data** | 2026-07-15 |
| **Comando** | `ok sprint 1` |

## Objetivo

Float pinta bolhas com virt ON: um único scroll container para TanStack Virtual + Load More.

## Escopo

- Remover dual `ref` em `FloatingConversationWindow`
- Load More usa o mesmo `scrollRef`
- Scroll to bottom no open com virt ON (sem brigar com prepend Load More)
