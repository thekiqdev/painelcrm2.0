# SPRINT_PHASE2_HTTP_DEDUP_PLAN

| Campo | Valor |
|---|---|
| **Documento** | SPRINT_PHASE2_HTTP_DEDUP_PLAN |
| **Phase** | 2 — HTTP Dedup |
| **Base** | MASTER_IMPLEMENTATION_PLAN |
| **Status** | Completed |
| **Data** | 2026-07-14 |
| **Gate anterior** | Phase 1 CLOSED |
| **Closeout** | `PHASE2_CLOSEOUT.md` — Gate Phase 2 **CLOSED** |

---

## Objetivo

Eliminar HTTP duplicado no Frontend (`instances`, clients/leads no mount Chat, company Brand∥Settings) sem alterar contratos, Chat Core, Store, SQL ou backend.

## Inventário callers `/api/chat/instances`

| Caller | Via |
|---|---|
| Chat page | `ensureChatInstances` → `chatService.listInstances` (legado se F3 OFF) |
| FloatingChatProvider / windows | idem |
| Unread (`useChatNavUnreadCount`) | idem |
| Registry F3 (ON) | já tem inFlight+TTL; **não** alterado (ADR-010 / freeze) |
| InstancesList / Settings WA | `chatService.listInstances` direto |

**Estratégia MB-008:** single-flight + TTL no HTTP service `chatService.listInstances` (caminho comum), invalidação em mutations. Não modifica `chat-core/*`.

## Escopo MB

| MB | Plano |
|---|---|
| MB-008 | `listInstances` single-flight + cache TTL + invalidate em patch/create/delete/connect |
| MB-009 | Remover `loadClients`/`loadLeads` do mount Chat; carregar ao abrir dialog Vincular |
| MB-010 | Confirmado necessário — single-flight+cache em `getMyTenantCompany` |

## Fora de escopo

chat-core, Store, SQL, Workers, Feature Flags catalog, Phase 3+.
