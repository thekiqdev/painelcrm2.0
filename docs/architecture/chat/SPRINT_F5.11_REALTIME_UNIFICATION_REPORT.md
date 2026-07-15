# Sprint F5.11 — Realtime Unification

| Campo | Valor |
|---|---|
| **Sprint** | F5.11 |
| **Nome** | Realtime Unification |
| **Data** | 2026-07-09 |
| **Objetivo** | Unificar pipeline realtime via ChatRealtimeBridge → Domain Store |
| **Feature Flag** | `CHAT_CORE_STORE` (+ `CHAT_SINGLE_SOCKET` recomendado) |
| **Rollback** | `CHAT_CORE_STORE=OFF` restaura setState + React Query + WS patch |

---

## Resumo executivo

Com `CHAT_CORE_STORE=ON`, eventos Socket.IO de inbox/thread **não atualizam mais** `setMessages`, `setConversations`, `tryApplyChatWsPatch` ou `invalidateQueries`. O fluxo oficial é:

```
Socket.IO → ChatRealtimeBridge.subscribe → syncStoreFromSocketEvent → Reducers → Hooks → UI
```

Floating Chat e Chat Principal leem o **mesmo Domain Store**; listeners window permanecem apenas para efeitos de UI (pulse, fechar painel, nav unread).

---

## Mudanças principais

| Área | Mudança |
|---|---|
| `runtime/storeBootstrap.ts` | Ingresso único via `bridge.subscribe`; window listeners só quando `CHAT_SINGLE_SOCKET` OFF |
| `realtime/policy.ts` | **Novo** — `isChatStoreRealtimeSourceOfTruth()` |
| `pages/Chat.tsx` | Handlers WS ignoram mutações legadas quando store ON; comentários internos via store |
| `FloatingChatProvider` | Sem WS patch / invalidate quando store ON; mantém pulse e nav |
| `FloatingConversationWindow` | Listeners WS patch desativados com store ON |
| `MobileConversationOverlay` | Idem |

---

## Eventos cobertos no Store

| Evento | Action |
|---|---|
| `message.created` | `messages/append` |
| `message.updated` / `read` / `delivered` / `failed` | `messages/update` |
| `message.deleted` | `messages/remove` |
| `conversation.updated` | `conversations/upsert` |
| `conversation.attendance_updated` | `conversations/upsert` |
| `conversation.deleted` | `conversations/remove` |

---

## Testes

`store.f5.11.realtime-unification.test.ts` — 8 casos (policy + todos os eventos acima).

Suite store: **110 testes** passando.

---

## Critérios de aceite

| Critério | Status |
|---|---|
| Eventos passam pelo Bridge → Store | ✅ |
| Sem setMessages/setConversations ativos (store ON) | ✅ |
| Sem invalidateQueries permanentes (store ON) | ✅ |
| Floating + Chat sincronizados via Store | ✅ |
| Rollback CHAT_CORE_STORE OFF | ✅ |
| UX inalterada | ✅ |

---

## Nota operacional

Recomendado **`CHAT_SINGLE_SOCKET=ON`** com **`CHAT_CORE_STORE=ON`**: Bridge encaminha todos os eventos de domínio. Com F1 OFF, store recebe eventos via window CustomEvents (socket legado).
