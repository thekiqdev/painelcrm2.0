# SPRINT_TF8_E4_CLOSEOUT — Shell polls coalesce + bubble parity

| Campo | Valor |
|---|---|
| **Sprint** | TF8 · Etapa 4 |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Plano** | [`PLAN_TF8_SHELL_LOAD_SCALE.md`](./PLAN_TF8_SHELL_LOAD_SCALE.md) |
| **Data** | 2026-07-16 |
| **Comando** | `ok etapa 4` |

---

## Resumo

Polls do shell (`menu-count`, `unread-count`, `ticket-categories`, `kanban/tags`) passam a **single-flight + soft TTL**. Eventos realtime de badge são **debounce 400 ms**. O bubble prefere **Store / freshness / join do limit=50** antes de GET `limit=4`.

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `shellHttpSoftCache` + `shellPollHttpCaches` | TTL badge **20 s** / catálogo **60 s** |
| Services | `tickets` / `systemNotifications` / `chatKanban.listTenantKanbanTags` |
| Hooks | debounce em `useTicketMenuCount` + `useInAppNotificationBadges` |
| Bubble | `resolveBubbleRecentConversations` — Store → fresh → in-flight inbox → GET |
| Logout | `resetShellPollHttpCaches` |
| Testes | soft cache + bubble Store |

---

## Checklist manual

1. F5: `tickets/menu-count` e `notifications/unread-count` **≤1–2×** cada.  
2. F5: `ticket-categories` / `kanban/tags` **≤1–2×**.  
3. Bubble: sem GET `limit=4` se Store já tem lista; não dispara 2º `limit=50`.  
4. Abrir sininho / novo ticket → badge atualiza (force após debounce).

---

## Próximo

Closeout global TF8 — [`SPRINT_TF8_CLOSEOUT.md`](./SPRINT_TF8_CLOSEOUT.md).
