# PHASE9_POLLING_INVENTORY — MB-041

| Campo | Valor |
|---|---|
| **Sprint** | Phase 9 — Zero Polling / Event Driven Chat |
| **Data** | 2026-07-14 |
| **Escopo** | Chat runtime (frontend) + dependents that drive Chat HTTP |

Classificação: **KEEP** | **REMOVE** | **SOCKET** | **MANUAL** | **CACHE**

---

## Inventário Chat (em escopo)

| Arquivo | Endpoint / efeito | Frequência (antes) | Responsável | Motivo histórico | Substituição | Classe | Ação Phase 9 |
|---|---|---|---|---|---|---|---|
| `chat-core/unread-engine/engine.ts` `startChatUnreadPeriodicReconcile` | GET attendance/unread reconcile | ~periódico (timer) | Unread engine | Drift recovery | Socket + login reconcile + inconsistência pontual | **REMOVE** | Timer no-op; `stop` no wire |
| `hooks/useChatNavUnreadCount.ts` | Engine / counts (antes poll HTTP indireto) | 120s `setInterval` | Nav badge | Refresh silencioso | Socket / unread engine / evento | **REMOVE** | Interval removido |
| `pages/Chat.tsx` ops dashboard tick | `getOperationsDashboard` | Debounce + tick sob Socket traffic | Chat page | SLA badges fresh | Socket → Store + 1× load sessão; botão Atualizar no painel (se montado) | **REMOVE** / **SOCKET** | `scheduleOperationsPanelRefresh` só métrica Socket; SLA 1×/tenant |
| `pages/Chat.tsx` `conversation_updated` → `loadMessages` silent | GET messages | Por evento WS | Chat page | Garantir histórico | `message_created` / Store patch | **SOCKET** | Silent GET pós-evento removido |
| `pages/Chat.tsx` attendance WS → `fetchChatAttendanceCounts` / `scheduleChatAttendanceReconcile` | GET attendance counts | Por evento | Chat page | Contadores | Payload WS + engine incremental | **SOCKET** | Sem GET no handler WS |
| `pages/ChatKanbanPage.tsx` | board detail reload | 20s `setInterval` | Kanban Chat | Auto refresh colunas | Socket / ação manual / F5 | **REMOVE** | Interval removido |
| `runtime/bootstrap.ts` `visibilitychange` / `online` → `requestChatReconcile` | GET instances + attendance | Focus / online | F3 bootstrap | Catch-up HTTP | Socket reconnect events | **REMOVE** | Listeners removidos |
| `services/chatInstancesHttpCache.ts` | GET `/api/chat/instances` | Soft TTL curto | Instances cache | Dedup | TTL sessão 24h + invalidate logout/patch | **CACHE** | TTL sessão + hit/miss metrics |
| `services/tenantCompanyHttpCache.ts` | GET `/api/me/tenant/company` | Soft TTL curto | Company cache | Dedup Brand/Settings | TTL sessão 24h | **CACHE** | Idem |
| `pages/Chat.tsx` sync conversas / sync conversa / toggle instância | sync + list | Ação usuário | Chat UI | Sync WhatsApp | Mantém HTTP | **MANUAL** | `recordManualRefresh` |
| `pages/Chat.tsx` abrir conversa | GET messages | Seleção | Chat UI | Bootstrap thread | Mantém | **KEEP** (não é polling) | — |
| `pages/Chat.tsx` paginação / archive pós-ação | GET list / counts | Ação usuário | Chat UI | Feedback imediato | Mantém (não periódico) | **MANUAL** / **KEEP** | — |
| `bootstrapChatF3Session` login | reconcile all | 1× login | F3 | Bootstrap | Mantém | **KEEP** / **MANUAL** | reason `login` |
| `bootstrap` instance removed | reconcile all | Evento one-shot | F3 | Inconsistência real | Mantém | **KEEP** | reason `inconsistency` |
| `FloatingChatProvider.tsx` pulse map | UI state só | 500ms | Floating | Expirar highlight visual | N/A (sem HTTP) | **KEEP** | Documentado; não é polling de dados |
| `lib/queryClient.ts` defaults | React Query | — | App | Evitar refetch | `refetchOnWindowFocus/Reconnect/Mount: false` | **KEEP** | MB-046 OK global |
| `components/chat/ChatOperationalPanel.tsx` | ops dashboard | `refreshTrigger` + botão | Ops UI | Métricas painel | Manual / mount; **não montado** em `/chat` atualmente | **MANUAL** | Sem timer; botão Atualizar |
| `scheduleChatAttendanceReconcile` | GET attendance | debounce one-shot | Engine | Recover | Só API pública; **0 call sites** no FE pós-P9 | **MANUAL** | Reservado; sem auto-uso |

---

## Fora de escopo Chat (não removidos nesta sprint)

| Arquivo | Nota | Classe inventário |
|---|---|---|
| `hooks/useTicketMenuCount.ts` | 60s ticket menu | KEEP (não-Chat) |
| `hooks/useInAppNotificationBadges.ts` | 45s badges | KEEP (não-Chat) |
| `components/whatsapp/QRCodePopup.tsx` / connection poll | Pairing QR | KEEP (onboarding) |
| `pages/PlanCheckout.tsx` / billing pay polls | Payment status | KEEP (billing) |
| `pages/agenda/...` clock tick | UI now | KEEP |
| `ClientDriveFileManager` `refetchInterval` | Drive jobs | KEEP (não-Chat) |

---

## Resumo contagem Chat

| Classe | Qtd relevante |
|---|---|
| REMOVE | 5 timers/paths periódicos HTTP |
| SOCKET | 3 paths (msgs / attendance / ops tick) |
| CACHE | 2 HTTP caches sessão |
| MANUAL | sync / patch / post-ação |
| KEEP | bootstrap open/paginate/F5 + UI pulse sem HTTP |

**Gate MB-041:** inventário completo **antes** das remoções — cumprido; remoções só após este mapa.
