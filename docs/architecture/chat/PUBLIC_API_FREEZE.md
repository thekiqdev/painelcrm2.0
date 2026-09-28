# PUBLIC_API_FREEZE — Chat Core Commands & Façade

| Campo | Valor |
|---|---|
| **Documento** | PUBLIC_API_FREEZE |
| **Data** | 2026-07-13 |
| **Sprint** | F6.8 |
| **Fonte** | `src/features/chat-core/core/commands.ts`, `chatCore.ts`, `chatCommandBridge.ts`, `domain/public-api.ts` |
| **Código alterado** | Nenhum |

---

## 1. Namespace oficial: `chatCoreCommands`

| Command | Params | Return | Side effects |
|---|---|---|---|
| `loadInbox` | `instanceIds`, `inboxScope`, filters opcionais (`surface`, `quickFilter`, `attendanceFilter`, `channelOrigin`, `conversationFilter`, `includeOfficialWhenAll`, `allowEmpty`) | `LoadInboxResult` / domain list via façade | HTTP → `conversations/set` (STORE ON) |
| `clearInbox` | `{ allowEmpty? }?` | void | Cancela in-flight; limpa lista store |
| `loadMessages` | `(conversationId, { latestPage? })` | `ChatDomainMessage[]` | HTTP latest page (default STORE ON) ou dump → `messages/set` + cursor |
| `loadMessagesCursor` | `{ conversationId, cursor?, pageSize? }` | page result | HTTP → `messages/prependPage` |
| `resetConversationCursor` | `(conversationId)` | void | Store: `messages/resetCursor` |
| `sendMessage` | `(conversationId, body, { replyToMessageId?, clientMessageId?, optimisticId? })` | `ChatDomainMessage` | Optimistic → HTTP → confirm/rollback |
| `markMessageRead` | `(conversationId, messageId)` | void | Optimistic → HTTP |
| `markConversationRead` | `(conversationId)` | void | Optimistic → HTTP |
| `assignConversation` | `(id, { assignedToUserId, reason? })` | void | Optimistic → HTTP reassign |
| `transferConversation` | `(id, { toUserId?, toTeamId?, reason? })` | void | Optimistic → HTTP |
| `archiveConversation` | `(conversationId)` | void | Optimistic → HTTP close |
| `closeConversation` | `(conversationId)` | void | Optimistic → HTTP close |
| `reopenConversation` | `(conversationId)` | void | Optimistic → HTTP attend |
| `deleteConversation` | `(conversationId)` | void | Optimistic → HTTP system delete |
| `pinConversation` | `(conversationId)` | void | **Optimistic only — sem HTTP** |
| `unpinConversation` | `(conversationId)` | void | **Optimistic only — sem HTTP** |
| `updateConversationStatus` | `(conversationId, status)` | void | **Optimistic only — sem HTTP** |

**Total: 17 handlers.**

---

## 2. Façade `chatCore`

| Método | Equivalente | Notas |
|---|---|---|
| `phase` | `'F6.6'` | Último feature phase (freeze F6.8 em docs) |
| `isWired` | shadow/store gate | — |
| `commands` | `chatCoreCommands` | — |
| `loadInstances` | repo | sync store |
| `loadInbox` / `loadMessages` | commands | — |
| `markRead` / `sendText` | aliases F0 | Preferir `markConversationRead` / `sendMessage` |
| `syncMessages` | repo sync | — |
| `reconcileAttendanceCounts` | F3 | — |
| selectors `get*` | store reads | — |
| `applyEvent` | `syncStoreFromSocketEvent` | — |

---

## 3. Bridge UI (`chatCommandBridge`)

| Função | STORE ON | STORE OFF |
|---|---|---|
| `bridgeMarkConversationRead` | command | `chatService` |
| `bridgeSendMessage` | command | `chatService` |
| `bridgeCloseAttendance` | `closeConversation` | patch |
| `bridgeAttendConversation` | `reopenConversation` | attend |
| `bridgeTransferConversation` | command | transfer |
| `bridgeSystemDeleteConversation` | command | delete |

Sem bridge: assign, archive, pin/unpin, status, loads — chamar `chatCoreCommands` diretamente.

---

## 4. Repository público (`ChatRepository`)

| Método | Efeito |
|---|---|
| `listInstances` | HTTP instances |
| `getConversations` | HTTP lista (agregado/legado) |
| `getMessages` | HTTP dump |
| `getMessagesPage?` | HTTP página (F6) |
| `syncMessages` | HTTP sync |
| `markConversationRead` | HTTP |
| `getAttendanceCounts` | HTTP |
| `sendText` | HTTP |

Stub lança `ChatCoreNotWiredError`; runtime usa `delegatingChatRepository`.

---

## 5. Drift de contrato (documentado — sem fix nesta sprint)

| Drift | Detalhe |
|---|---|
| `ChatCoreCommandHandlers` vs namespace | Cursor cmds / `clearInbox` / `latestPage` parcial na tipagem F0 |
| `ChatCoreCommands` F0 paralelo | `markRead`/`sendText` vs nomes novos |
| Pin/unpin/status | Sem persistência HTTP |

**Freeze:** novos callers devem usar `chatCoreCommands.*`. Qualquer mudança de assinatura → ADR.

---

## 6. Hooks públicos (UI)

Importar de `@/features/chat-core/store/public` (não de `session`/`actions`/`integration`):

`useChatConversationList`, `useChatMessages`, `useChatSelection`, `useFloatingConversationListData`, `useFloatingConversationMessages`, `useConversationCursor`, `useLoadMoreMessages`, `useConversationWindow`, `useWindowMemory`, `useConversationWarmup`, `useConversationVirtualization`, `useConversationScroll`, `useMessageVirtualization`, `useMessageScroll`, `useStableSelector`.

---

## Aceite freeze API

| Critério | Status |
|---|---|
| Inventário completo | ✅ |
| Efeitos colaterais documentados | ✅ |
| Sem alteração funcional | ✅ |
| Mudança futura exige ADR | ✅ |
