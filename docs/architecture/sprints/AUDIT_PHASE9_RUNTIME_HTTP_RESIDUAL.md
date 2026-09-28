# AUDIT_PHASE9_RUNTIME_HTTP_RESIDUAL

| Campo | Valor |
|---|---|
| **Tipo** | Investigation Only |
| **Prioridade** | CRITICAL |
| **Data** | 2026-07-14 |
| **Código / Store / RQ / Socket / Flags / SQL** | **Não alterados** |
| **Pré-requisito** | Phase 9 CLOSED (closeout existente) |

---

## Veredito executivo

| Pergunta | Resposta |
|---|---|
| 1. Existe polling restante **no Chat** (timer → GET periódico)? | **Não** — pollers Chat P9 removidos |
| 2. Existe refetch automático RQ (focus/reconnect/interval)? | **Não** no path Chat (defaults off; sem `refetchInterval`) |
| 3. Existe invalidate em cascata automática? | **Não** por focus; **Sim condicional** Floating Store OFF / patch fail / delete legado |
| 4. Componentes fora do Chat geram HTTP periódico? | **Sim** — tickets menu 60s; notifications 45s |
| 5. Runtime 100% conforme Phase 9 (aceite amplo event-driven)? | **Parcial** — zero poll OK; GET-on-socket / attendance-on-list / caches incompletos |
| 6. Arquivos a corrigir na **próxima** sprint? | Ver § Prioridade de correção |

**Leitura correta do closeout Phase 9:** cumpriu **zero polling contínuo Chat**.  
**Esta auditoria** encontra residuais de **HTTP event-driven não-Socket-pure** e **poll shell não-Chat**.

---

## Documentos satélite

| Doc | Conteúdo |
|---|---|
| `AUDIT_HTTP_CALL_GRAPH.md` | AUD-001/002 árvore + cadeias |
| `AUDIT_REACT_QUERY_RUNTIME.md` | AUD-003 |
| `AUDIT_SOCKET_HTTP_DEPENDENCIES.md` | AUD-005/006 (+ timers socket) |
| `AUDIT_RUNTIME_DIVERGENCES.md` | AUD-007/009 + proposta AUD-008 |
| `AUDIT_PHASE9_CLOSEOUT.md` | Gate desta auditoria |

Timers Chat: ver inventário resumido abaixo (AUD-004).

---

## AUD-004 — Timers / focus / online (Chat-related)

| Local | Mecanismo | HTTP? | Classe |
|---|---|---|---|
| `FloatingChatProvider` 500ms | `setInterval` pulse map | Não | KEEP UI |
| `useKanbanAttendanceSocketRefresh` | debounce 200ms pós-WS | **Sim** listCards | RESIDUAL |
| `scheduleChatAttendanceReconcile` | debounce 2s | Se chamado | Morto (0 callers) |
| `startChatUnreadPeriodicReconcile` | interval | Não (no-op) | REMOVED |
| `useChatNavUnreadCount` | debounce 900ms; sem interval | Bootstrap | OK |
| Chat `visibilitychange` / `online` reconcile | — | Removidos P9 | OK |
| storeBootstrap `online` | Store status | Não | OK |
| `useTicketMenuCount` | **60s** | Sim | FORA Chat |
| `useInAppNotificationBadges` | **45s** | Sim | FORA Chat |
| Idle prefetch shell | `requestIdleCallback` | Sim one-shot | Bootstrap estendido |

---

## Residuais classificados

### P0 — contradiz “Socket atualiza Store/UI sem GET”

| Item | Arquivo | Endpoint |
|---|---|---|
| Kanban WS → refresh cards | `useKanbanAttendanceSocketRefresh.ts` + `ChatKanbanPage.tsx` | GET kanban cards |
| Floating Store OFF patch fail | `FloatingChatProvider.tsx`, overlays | GET via RQ invalidate |

### P1 — contradiz política attendance P9

| Item | Arquivo | Endpoint |
|---|---|---|
| Attendance GET acoplado a cada `loadConversations` | `Chat.tsx` ~828–835 | attendance-counts |
| Prefetch unread idle | `chatPrefetch.ts` | attendance-counts |

### P2 — boot Chat ainda “chatty” (não poll)

| Item | Endpoint |
|---|---|
| runtime-config RQ mount | GET runtime-config |
| ticket-categories mount | GET ticket-categories |
| kanban tags mount (+ float) | GET kanban/tags |
| ops dashboard 1× | GET operations-dashboard |

### P3 — fora escopo Chat (shell)

| Item | Freq |
|---|---|
| `useTicketMenuCount` | 60s |
| `useInAppNotificationBadges` | 45s |

### P4 — pontuais aceitáveis / legados raros

| Item | Nota |
|---|---|
| `crm.note.created` → list notes | só perfil aberto |
| `conversation.deleted` invalidate | store/legacy fail |
| login + instance-removed reconcile | permitido P9 |
| open conversation / pagination / manual sync | permitido P9 |

---

## Prioridade de correção (próxima sprint — **não feita aqui**)

1. Eliminar HTTP em `useKanbanAttendanceSocketRefresh` (patch local / Store).  
2. Desacoplar `fetchChatAttendanceCounts` de `loadConversations`.  
3. Hardening Floating: Store ON / patch complete → zero invalidate em WS.  
4. Session cache MB-043 residual (tags, categories, runtime-config).  
5. Decisão produto: pollers shell tickets/notifications (KEEP vs SOCKET).  
6. Instrumentação AUD-008 (logs/métricas trigger) antes/depois das correções.

---

## Respostas finais (evidências)

1. **Polling restante Chat?** Não contínuo.  
2. **Refetch automático RQ Chat?** Não (defaults + sem interval).  
3. **Invalidate cascata?** Não global; sim residual Floating legado / delete.  
4. **Fora do Chat?** Sim — menu tickets + notification badges.  
5. **Conforme Phase 9?** **Parcial** — gate “zero poll” sim; gate “zero HTTP automático / Socket-pure” não.  
6. **Arquivos a corrigir:** listados P0–P2 acima.
