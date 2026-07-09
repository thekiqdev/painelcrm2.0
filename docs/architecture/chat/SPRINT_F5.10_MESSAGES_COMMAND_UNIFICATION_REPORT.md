# Sprint F5.10 — Messages Command Unification

| Campo | Valor |
|---|---|
| **Sprint** | F5.10 |
| **Nome** | Messages Command Unification |
| **Data** | 2026-07-09 |
| **Objetivo** | Unificar pipeline de mensagens Chat + Floating em `loadMessagesCommand` |
| **Feature Flag** | `CHAT_CORE_STORE` (mantida) |
| **Impacto funcional** | Corrige thread vazia em `/chat` (bug F5.9 audit) |
| **Rollback** | `CHAT_CORE_STORE=OFF` → fluxo legado intacto |

---

## Resumo executivo

Consolidado o carregamento de mensagens em **um único command** `loadMessagesCommand`, espelhando o padrão F5.9 (`loadInboxCommand`).

**Causa raiz corrigida:** `repositorySync` re-mapeava `ChatDomainMessage[]` com `mapLegacyMessageToDomain`, perdendo `conversationId` → `messages/set` nunca disparava no Chat Principal.

---

## Arquitetura entregue

```
delegatingChatRepository.getMessages()
         │
         ▼
   messagesFetch.ts
         │
         ▼
  loadMessagesCommand
         │
         ▼
 applyStoreMessagesInternal
         │
         ▼
    messages/set
         │
         ▼
  selectors → hooks → UI
```

Chat Principal e Floating usam **o mesmo command**, sem `surface: 'core' | 'float'`.

---

## Arquivos principais

| Arquivo | Mudança |
|---|---|
| `core/loadMessages.ts` | **Novo** — command único + generation guard |
| `core/messagesFetch.ts` | **Novo** — HTTP via repository |
| `store/repositorySync.ts` | `listMessages` usa `toDomainMessage()` |
| `store/consolidation.ts` | `applyStoreMessagesInternal()` para hidratação |
| `core/commands.ts` | Re-export; `chatCoreCommands.loadMessages` |
| `core/chatCore.ts` | `syncMessages` → `loadMessagesCommand`; phase F5.10 |
| `pages/Chat.tsx` | Remove `{ surface: 'core' }` |
| `hooks/useFloatingConversationMessages.ts` | Remove `{ surface: 'float' }` |
| `hooks/useChatMessages.ts` | `ensureChatDomainStoreSession()` no subscribe |

---

## Escrita permitida (mensagens)

| API | Papel |
|---|---|
| `loadMessagesCommand(conversationId)` | Hidratação HTTP → Store |
| `applyStoreMessages(conversationId, legacy[])` | Outbound / optimistic (UI) |
| `applyStoreMessagesInternal(conversationId, domain[])` | Interno (command) |

---

## Testes

Arquivo: `store.f5.10.messages-command-unification.test.ts` (7 casos)

- Payload legado via `repositorySync`
- Payload Domain via `repositorySync`
- `syncStoreFromCommandResult('listMessages')` com domain
- `loadMessagesCommand` hidrata store
- Paridade Chat × Floating (mesmos ids)
- Concorrência (última generation vence)
- Rollback `CHAT_CORE_STORE=OFF`

Suite `src/features/chat-core/store/`: **102 testes** passando.

---

## Critérios de aceite

| Critério | Status |
|---|---|
| Um pipeline de mensagens | ✅ |
| Chat e Floating mesmo command | ✅ |
| Sem re-mapeamento desnecessário | ✅ |
| `messages/set` para legacy e domain | ✅ |
| Thread `/chat` corrigida | ✅ (fix root cause) |
| Floating intacto | ✅ |
| Rollback via flag | ✅ |
| Alinhado F5.9 | ✅ |

---

## Validação manual

1. `CHAT_CORE_STORE=ON`
2. Abrir `/chat` → selecionar conversa → thread deve exibir mensagens
3. Floating → mesma conversa → mesma lista
4. Enviar mensagem + WS → sem regressão
