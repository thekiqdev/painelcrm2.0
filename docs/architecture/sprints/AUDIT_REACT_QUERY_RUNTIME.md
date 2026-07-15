# AUDIT_REACT_QUERY_RUNTIME — AUD-003

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |
| **Investigation only** | Sim |

---

## Defaults globais — `src/lib/queryClient.ts`

| Opção | Valor | Impacto Phase 9 |
|---|---|---|
| `staleTime` | 5 min | Reduz refetch |
| `gcTime` | 15 min | — |
| `refetchOnWindowFocus` | **false** | Sem focus poll |
| `refetchOnMount` | **false** | Sem remount auto |
| `refetchOnReconnect` | **false** | Sem reconnect poll |
| `retry` | 1 | Retry único |
| `retryDelay` | 1000 | — |

---

## `refetchInterval` em Chat path

| Arquivo | Presente? |
|---|---|
| `Chat.tsx` / `chat-core` / `floating-chat` / `ChatKanbanPage` | **Não** |
| Outros (ex. ClientDrive) | Sim — fora escopo Chat |

---

## Queries Chat relevantes

| Arquivo | Key | Overrides notáveis | Call / motivo |
|---|---|---|---|
| `Chat.tsx` | `['chat-runtime-config']` | `staleTime: 60_000` | Mount página; grupos UI |
| `Chat.tsx` | `['client-groups']` | — | CRM profile |
| `ChatScheduledMessagesStrip` | `['chat-scheduled-messages', id]` | `staleTime: 15_000` | Strip agendadas |
| `useFloatingConversationListData` | `floating-chat/conversations/...` | Store OFF only | Lista float |
| `useFloatingConversationMessages` | `['floating-chat','messages',id]` | RQ owns thread | Thread |
| `FloatingChatWidget` | `floating-chat/bubble-recent/...` | — | Bubble |
| `FloatingConversationWindow` / Mobile | meta + connected-instances | — | Janela |
| `MinimizedChatDock` | minimized-meta | — | Dock |
| `FloatingCompactProfile` | crm-profile / group | — | Perfil |
| `chatPrefetch.ts` | instances / unread / conversations / messages | `prefetchQuery` / `ensureQueryData` | Idle warm pós-login |

---

## `invalidateQueries` / refetch APIs

| API | Chat path? | Motivo típico |
|---|---|---|
| `invalidateQueries` | **Sim** | Floating Store OFF / patch fail; CRM link/unlink; delete conversa legado; pós mutação perfil |
| `refetchQueries` | Não relevante Chat | — |
| `prefetchQuery` | Sim | `chatPrefetch`, `floatingChatQueries` |
| `fetchQuery` / `ensureQueryData` | Sim | instances ensure / warm |
| Cascata focus/reconnect | **Não** (defaults off) | — |

### Call sites invalidate Socket-driven (residual)

| Arquivo | Trigger | Keys | GET indireto? |
|---|---|---|---|
| `FloatingChatProvider.tsx` | `messageCreated` / `conversationUpdated` se Store OFF + patch fail | messages, meta, conversations, aggregates | **Sim** se query ativa |
| `MobileConversationOverlay.tsx` | idem | messages, meta, conversations | **Sim** condicional |
| `Chat.tsx` | `conversation.deleted` se patch não applied | `['chat-conversations']` | **Sim** raro |
| `floatingChatQueries.ts` | helpers agregados | conversations / bubble / minimized | indireto |

Store **ON**: Floating não invalida em message/conversation window events (pulse + nav unread only).

---

## Cascata automática?

| Pergunta | Evidência |
|---|---|
| Invalidate em cascata por focus? | **Não** |
| Invalidate em cascata por reconnect RQ? | **Não** |
| Invalidate pós-Socket (legado Store OFF)? | **Sim — residual** |
| Prefetch idle pós-login? | **Sim — one-shot**, não loop |

---

## Veredito RQ

Phase 9 **MB-046 cumprido** para defaults e ausência de `refetchInterval` Chat.  
Residuais = invalidates condicionais (Store OFF / patch fail / delete legado), não polling RQ.
