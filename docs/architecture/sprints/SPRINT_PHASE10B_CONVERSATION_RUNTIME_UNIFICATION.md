# SPRINT_PHASE10B_CONVERSATION_RUNTIME_UNIFICATION

| Campo | Valor |
|---|---|
| **Sprint** | Phase 10B — Conversation Runtime Unification |
| **Status** | **Done / CLOSED** |
| **Data** | 2026-07-14 |
| **Pré-requisitos** | Phase 9 · Phase 10A CLOSED |

## Objetivo

Uma Source of Truth (Domain Store) para Conversation nas superfícies Chat / Floating quando `CHAT_CORE_STORE` ON; eliminar writes no-op, dupla normalização WS e silos CRM Floating.

## Escopo de implementação

| Item | Resultado |
|---|---|
| Chat `setConversations` → Store | Done |
| Floating CRM → `applyStoreConversationPartialPatch` | Done |
| WS `pickConversationPatch` 1× normalize | Done |
| Métricas + divergence log | Done |
| Docs pipeline / SoT / QA | Done |
| Kanban board `conv_*` DTO | Residual documentado (API própria; fora ChatConversation) |
| Store OFF (flags) | Dual path legado mantido (flags não alteráveis) |

## Entregáveis

Ver `PHASE10B_*` neste diretório.
