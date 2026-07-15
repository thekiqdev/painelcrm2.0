# SPRINT_1 — Phase 10F · Instance Visibility Unification

| Campo | Valor |
|---|---|
| **Sprint** | 1 |
| **Phase** | 10F |
| **Status** | IN PROGRESS → ver closeout |
| **Data** | 2026-07-15 |
| **Comando** | `ok sprint 1` |
| **Plano** | `PLAN_RUNTIME_OWNERSHIP_CLOSURE.md` |

## Objetivo

Um único reader path de **enabled instance IDs** para inbox Chat e Floating.

## Escopo

- Snapshot compartilhado `inboxVisibility`
- Critério inbox = `enabled_in_chat !== false` (não exige connected)
- Connected permanece no picker Float (`filterConnectedChatInstances`)
- Toggle enable no Chat força refresh (`force: true`) + sync Float via subscribe

## Fora de escopo

- Float header meta RQ (Sprint 2)
- Kanban / Store OFF / Preview
- ClientProfile e outras superfícies que ainda chamam `ensureChatInstances` direto
