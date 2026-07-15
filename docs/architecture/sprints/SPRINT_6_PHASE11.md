# SPRINT_6 — Phase 11 · Legacy Retirement (Declaration + Prep)

| Campo | Valor |
|---|---|
| **Sprint** | 6 |
| **Phase** | 11 |
| **Status** | IN PROGRESS → ver closeout |
| **Data** | 2026-07-15 |
| **Comando** | `ok sprint 6` |
| **Plano** | `PLAN_RUNTIME_OWNERSHIP_CLOSURE.md` |

## Objetivo

Declarar Domain Store como **Runtime Core** do Chat/Floating e preparar inventário de retirement — **sem** remoção física do dual-path Store OFF (ADR-010 / MB-028).

## Escopo

1. ADR-013 — Domain Store = Runtime Core (`CHAT_CORE_STORE=ON`)
2. Checklist `PHASE11_LEGACY_RETIREMENT.md` (gate MB-028)
3. Extender `cachePrecedence.ts` (aliases Phase 11 + docs constants)
4. Atualizar status / tracker / plan index
5. Hook alias `shouldReactQueryOwnConversationMeta` no Float meta

## Fora de escopo (explícito)

- Delete físico de Store OFF / RQ thread / useState Chat
- Flip default de `CHAT_CORE_STORE` no catálogo
- Unificação Kanban (Sprint 5 Opção A)
- Backend / SQL / Redis / Socket / Workers
