# AUDIT_HTTP_CALL_GRAPH — AUD-001 / AUD-002

| Campo | Valor |
|---|---|
| **Tipo** | Investigation only |
| **Data** | 2026-07-14 |
| **Código alterado** | Nenhum |

---

## AUD-001 — Árvore HTTP Chat (resumo)

```
App (Auth)
├── loadPostMeBootstrap → GET /api/chat/migration-flags
├── AppShell
│   ├── ChatNavUnreadScope (idle) → useChatNavUnreadCount
│   │     → ensureChatInstances → GET /api/chat/instances (cache)
│   │     → fetchChatAttendanceCounts → GET …/attendance-counts
│   ├── useTicketMenuCount → GET /api/tickets/menu-count ⏱ 60s
│   ├── useInAppNotificationBadges → GET …/unread-count ⏱ 45s
│   └── idle prefetchChatWarm → instances + conversations + unread
├── /chat (Chat.tsx)
│   ├── RQ getChatRuntimeConfig → GET /api/chat/runtime-config
│   ├── loadInstances → GET /api/chat/instances
│   ├── loadTicketCategories → GET /api/ticket-categories
│   ├── listTenantKanbanTags → GET /api/chat/kanban/tags
│   ├── getOperationsDashboard (1×/tenant) → GET …/operations-dashboard
│   ├── loadConversations (filtros / instances)
│   │     → loadInboxCommand → GET /api/chat/conversations
│   │     → fetchChatAttendanceCounts → GET …/attendance-counts  ⚠ residual
│   ├── select conversation → GET messages (+ silent se cache page)
│   ├── Socket handlers → local/Store (v. AUDIT_SOCKET_*)
│   └── Manual sync / archive / toggle → HTTP explícito
├── FloatingChatProvider
│   ├── mount instances + persist probe
│   ├── Store ON: Socket → Store (sem GET)
│   └── Store OFF / patch fail: invalidateQueries → GET RQ
└── ChatKanbanPage
      ├── mount boards/columns/cards
      └── useKanbanAttendanceSocketRefresh → debounce → GET listCards  ⚠
```

`conversationService`: **não existe** no frontend.

---

## AUD-002 — Cadeias por endpoint

### GET `/api/chat/conversations`

```
App → Route /chat → Chat
  → useEffect([loadingInstances, enabledInstanceIds, chatChannelOrigin, loadConversations, …])
  → loadConversations
  → loadInboxCommand({ surface: 'chat', … })
  → fetchInboxConversations → listChatConversations
  → getConversationsAggregated | getConversations
  → GET /api/chat/conversations
```

**Frequência:** a cada mudança de instances habilitadas / origem de canal / remount (deps); também sync/archive/handlers. **Não** é `setInterval`.

**Outros:** Floating list/prefetch, MinimizedChatDock, Kanban add-card dialog, CRM resolve.

---

### GET `/api/chat/conversations/attendance-counts`

```
A) Login F3
bootstrapChatF3Session → requestChatReconcile('all','login')
  → reconcileChatAttendanceCounts → GET

B) Nav unread (idle)
ChatNavUnreadScope → useChatNavUnreadCount → fetchChatAttendanceCounts({ reason: 'bootstrap' })

C) Chat lista (RESIDUAL vs doc P9)
loadConversations → fetchChatAttendanceCounts({ reason: 'bootstrap' })  // a cada reload lista

D) Prefetch idle
prefetchChatCore → prefetchChatUnread → fetchChatAttendanceCounts({ reason: 'prefetch' })

E) Manual archive
Chat archive handler → force:true, reason:'manual'
```

**Periódico contínuo:** não (poller removido).

---

### GET `/api/chat/operations-dashboard`

```
Chat mount (tenant + canView chat)
  → useEffect → chatService.getOperationsDashboard()  // 1× / sessão-tenant
```

`ChatOperationalPanel` (botão Atualizar) — **não montado** em `/chat` atualmente.  
Settings attendance section: mount one-shot.

---

### GET `/api/chat/runtime-config`

```
Chat → useQuery(['chat-runtime-config'])
  → getChatRuntimeConfig → GET
```

`staleTime: 60_000`; defaults RQ sem refetch focus/mount/reconnect.

---

### GET `/api/chat/migration-flags`

```
AuthContext loadPostMeBootstrap → loadChatMigrationFlags → GET
(+ Chat.loadConversations se !isChatMigrationFlagsLoaded — residual raro pós-login)
```

---

### GET `/api/chat/instances`

```
ensureChatInstances / listInstancesSingleFlight → GET (miss)
Callers: Chat.loadInstances, Floating refreshInstances, nav unread, reconcile login,
         idle prefetch, WhatsApp InstancesList
```

Cache HTTP TTL sessão 24h + registry.

---

### GET `/api/chat/kanban/tags`

```
Chat mount (tenant) → listTenantKanbanTags
FloatingConversationWindow / FloatingCompactProfile mount
ChatKanbanColumnSettingsSheet open
```

Sem poll. **Sem** cache sessão Phase 9 (MB-043 parcial).

---

### GET `/api/ticket-categories`

```
Chat mount → loadTicketCategories → ticketsService.getTicketCategories
```

One-shot mount Chat (+ páginas Tickets). Sem session cache P9.

---

### GET `/api/tickets/menu-count`

```
AppShellSidebar → TicketSidebarNavItem → useTicketMenuCount
  → mount + notification event + setInterval(60_000)
  → GET /api/tickets/menu-count
```

**FORA Chat core** — periódico residual global.

---

### GET `/api/notifications/unread-count`

```
AppShellHeaderActions → useInAppNotificationBadges
  → mount + events + setInterval(45_000)
  → GET unread-count (+ announcements)
```

**FORA Chat core** — periódico residual shell.

---

## Frequência — legenda

| Símbolo | Significado |
|---|---|
| 1× | Bootstrap / mount |
| event | Filtro, ação, remount |
| ⚠ WS→HTTP | Socket dispara GET |
| ⏱ | Timer periódico |
