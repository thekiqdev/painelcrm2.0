# DOMAIN_STORE_FREEZE — Inventário State / Actions / Selectors / Hooks

| Campo | Valor |
|---|---|
| **Documento** | DOMAIN_STORE_FREEZE |
| **Data** | 2026-07-13 |
| **Sprint** | F6.8 |
| **Flag SoT** | `CHAT_CORE_STORE` |
| **Código alterado** | Nenhum |

---

## 1. State slices (12)

| Slice | Conteúdo |
|---|---|
| `conversations` | `byId`, `orderedIds`, `inboxScope`, `instanceIds`, `lastHydratedAt` |
| `messages` | ids, versions, **cursor maps**, **window cache maps** |
| `selection` | selected conversation / instances |
| `compose` | drafts |
| `loading` | conversations / messages / instances / sending |
| `unread` | global, byId, attendance |
| `connection` | status |
| `instances` | byId / ordered / enabled |
| `ui` | filtros inbox |
| `commands` | optimistic pending/confirm/rollback |
| `conversationVirtualization` | F6.3 |
| `messageVirtualization` | F6.4 |

Fonte: `store/state.ts`, `store/types.ts`.

---

## 2. Actions — 34 types

| Group | Types |
|---|---|
| conversations | `set`, `upsert`, `remove` |
| messages | `set`, `append`, `update`, `remove`, `prepend`, `prependPage`, `setCursor`, `setHasMore`, `setLoadingMore`, `resetCursor`, `registerPage`, `evictPage`, `updateWindow`, `rehydratePage`, `trimWindow` |
| selection | `setConversation` |
| loading | `setConversations`, `setMessages` |
| unread / connection / instances | `unread/set`, `connection/set`, `instances/set` |
| ui | `ui/patch` |
| virt | `conversationVirtualization/setEnabled|setWindow`, `messageVirtualization/setEnabled|setWindow` |
| hydrate | `hydrate/partial`, `store/reset` |
| commands | `begin`, `confirm`, `rollback` |

### Auditoria de órfãos

| Action | Status | Nota |
|---|---|---|
| `ui/patch` | **reservado / sem creator** | Sem dispatch produção — debt catalogado |
| `messages/evictPage` | **interno** | Eviction via trim; creator sem callers externos |
| `messages/prepend` | **quase órfão** | Produção usa `prependPage`; testes F5.3 |
| Demais | **ativos** | Commands / integration / virt hooks |

**Freeze:** não adicionar slices/actions sem ADR. Órfãos: cleanup só pós-canário (PR dedicado).

---

## 3. Selectors (congelados)

**Cursor:** `selectConversationCursor`, `HasMore`, `LoadingMore`, `LoadedPages`, `CanLoadMore`  
**Window:** `selectResidentPages`, `WindowBounds`, `ConversationMemoryUsage`, `EvictedPages`, `PinnedPages`, `CachedPages`, `ConversationWindow`  
**Virt conversa:** `selectVisibleConversations`, `ConversationVirtualWindow`, `Overscan`, `RenderCount`, `ComputedConversationWindow`  
**Virt mensagem:** `selectVisibleMessages`, `MessageVirtualWindow`, …  
**Chat UI:** `selectChatConversationsForUi`, `selectChatMessagesForUi`, `selectCurrentConversation`, …  
**Memo:** `createMemoizedSelector`, fingerprints, `shallowEqual*`

---

## 4. Hooks (congelados)

Ver [`PUBLIC_API_FREEZE.md`](./PUBLIC_API_FREEZE.md) §6.

---

## 5. Reducers / notify

- `reduceChatDomainState` — único reducer tree  
- No-op identity (`Object.is`) → **sem notify** (hardening F6.5+)  
- `dispatchBatch` / socket queue — F6.5  

---

## 6. Checks freeze

| Check | Resultado |
|---|---|
| Sem reducers órfãos (group vazio) | ✅ |
| Actions mortas | ⚠️ 1–2 reservadas (documentadas) |
| Selectors públicos usados | ✅ (suite + UI) |
| Hooks antigos paralelos | Floating RQ só STORE OFF |
| Schema estável | ✅ |

---

## Aceite

| Critério | Status |
|---|---|
| Inventário completo | ✅ |
| Órfãos catalogados | ✅ |
| Sem alteração Store nesta sprint | ✅ |
| Mudança futura → ADR | ✅ |
