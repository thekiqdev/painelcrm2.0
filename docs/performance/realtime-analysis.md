# P6 — Auditoria Realtime

## Arquitetura

```
Backend Socket.IO (/socket.io/)
  ↓
realtimeClient.ts (singleton) → window CustomEvents
  ↓
Hooks: useRealtimeEvents, useChatNavUnreadCount, FloatingChatProvider, Kanban...
```

**Problema:** páginas críticas abrem **conexões paralelas** além do singleton.

## Conexões Socket.IO

| # | Arquivo | Tipo |
|---|---------|------|
| 1 | `realtimeClient.ts` | Singleton (AppLayout) |
| 2 | `Chat.tsx` L1459 | `io()` dedicado `forceNew: true` |
| 3 | `ClientProfile.tsx` L1012 | `io()` por conversa |
| 4 | `useKanbanAttendanceSocketRefresh.ts` | `io()` no kanban |
| 5 | `useNotifications.ts` | **Morto** — zero imports |

**Pior caso:** 4 sockets simultâneos (layout + chat + kanban + perfil).

## Listeners duplicados

| Evento | Consumidores |
|--------|--------------|
| `messageCreated` | ChatNavUnread, FloatingChat, Kanban cards, EmbeddedLead |
| `notificationCreated` | Badges, tickets count, floating chat |
| `conversationUpdated` | Idem |

## Polling residual

| Fonte | Intervalo | Overlap realtime? |
|-------|-----------|-------------------|
| ChatNavUnread | 120s | Sim — eventos já disparam refresh |
| InAppNotificationBadges | 45s | Sim |
| TicketMenuCount | 60s | Parcial |
| ChatKanbanPage | 20s | **Sim** — socket + window events já atualizam |

## Memory leaks / cleanup

| Arquivo | Issue |
|---------|-------|
| `Chat.tsx` | `disconnect()` sem `socket.off()`; early-return skip rebind |
| `ClientProfile.tsx` | Mesmo pattern |
| `WhatsAppConnection.tsx` | Interval sem cleanup on unmount |
| `useNotifications.ts` | Dead code com listeners |

## Correções S0 aplicadas

- **ChatNavUnreadProvider** — uma instância do hook (elimina 2× poll + 2× `listInstances` no mount)

## Quick wins pendentes

1. Chat/Kanban/ClientProfile → consumir só `REALTIME_WINDOW_EVENTS`
2. Remover `useNotifications.ts` ou integrar ao singleton
3. Remover poll 20s em `ChatKanbanPage` se socket ativo
4. `socket.off()` antes de `disconnect()` em Chat/ClientProfile
