# PHASE5_STORE_INVENTORY

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |
| **Phase** | 5 |

## Domain Store surfaces

| Surface | SoT quando `CHAT_CORE_STORE` ON | Legado OFF |
|---|---|---|
| Chat inbox/thread | Store + Commands | RQ / local state |
| Floating messages | Store latest-page + Load More | RQ dump |
| Floating lists | RQ aggregates (satellite) | RQ |
| Unread engine | F3 engine / Store | attendance poll |
| Realtime UI | Bridge → Store | Bridge → RQ patch |

## Cache ownership (MB-031)

| Camada | Papel |
|---|---|
| **Domain Store** | Primária (SoT) |
| **React Query** | Satélite / STORE OFF |
| **IndexedDB** | Warm/persist — **nunca SoT** |

Código: `src/features/chat-core/runtime/cachePrecedence.ts`

## Dual-path (não removido)

- `loadMessagesCommand({ latestPage: false })` — rollback dump
- `io()` dedicado — F1 OFF (Chat, ClientProfile, Kanban)
- RQ Floating messages — STORE OFF

## Tracker

Atualizar `LEGACY_REMOVAL_TRACKER` changelog Phase 5 — sem REMOVED físicos.
