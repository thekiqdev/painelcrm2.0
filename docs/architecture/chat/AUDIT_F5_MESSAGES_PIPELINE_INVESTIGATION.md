# AUDIT — F5 Messages Pipeline Investigation (/chat)

| Campo | Valor |
|---|---|
| **Audit** | `AUDIT_F5_MESSAGES_PIPELINE_INVESTIGATION` |
| **Versão** | 1.0 |
| **Data** | 2026-07-09 |
| **Tipo** | Investigação (read-only) |
| **Escopo** | Pipeline de mensagens do Chat Principal (`/chat`) |
| **Implementação** | Nenhuma alteração de código |

---

## Resumo executivo

```
PIPELINE DAS MENSAGENS

Quebra em:

Arquivo: src/features/chat-core/store/repositorySync.ts
         (+ loadMessagesCommand surface 'core' em commands.ts)

Função: mapRepositoryResponseToActions('listMessages', payload)
        loadMessagesCommand(..., { surface: 'core' })

Linha aproximada: repositorySync.ts:84–92
                  commands.ts:301–305

Motivo:
  O Chat Principal usa loadMessagesCommand com surface 'core', que obtém
  mensagens já mapeadas para ChatDomainMessage[] via delegatingChatRepository.
  syncStoreFromCommandResult('listMessages', ...) re-mapeia com mapLegacyMessageToDomain,
  que espera conversation_id (snake_case legado). Mensagens de domínio têm conversationId
  (camelCase). O conversationId mapeado fica undefined → nenhuma action messages/set.

Evidência de runtime (estática + contrato):
  - normalizeChatMessage (chat.ts:643) lê apenas raw.conversation_id
  - isDomainMessage / toDomainMessage existem mas NÃO são usados em listMessages
  - Teste F5.4 hidrata com legacy rows; não cobre payload domain do repo core
  - Floating usa surface 'float' → chatService.getConversationMessages (legacy) → OK

Impacto:
  API responde; Store de conversas OK; thread /chat vazia ("Sem mensagens ainda").
  Floating funciona porque usa surface 'float' com payload legado.

Correção sugerida (NÃO IMPLEMENTAR):
  A) loadMessagesCommand core: gravar no store com dispatch direto (domain já mapeado), ou
  B) mapRepositoryResponseToActions listMessages: usar toDomainMessage(row) em vez de
     mapLegacyMessageToDomain forçado, ou
  C) Chat.tsx: chamar loadMessagesCommand(..., { surface: 'float' }) até unificação, ou
  D) delegatingChatRepository.getMessages retornar legacy rows para sync (anti-padrão).
```

---

## Situação observada

| Item | Status |
|------|--------|
| Lista de conversas | ✅ |
| Seleção | ✅ |
| Preview | ✅ |
| Floating Chat | ✅ |
| Chat Principal thread | ❌ vazia |
| Backend / API | ✅ (reportado) |
| Domain Store (inbox) | ✅ |

---

## Pipeline mapeado (Chat Principal, `CHAT_CORE_STORE=ON`)

```
Clique lista
  → handleSelectConversation (Chat.tsx:3070)
  → setSelectedConversationId(conversationId)
  → useEffect [selectedConversationId] (Chat.tsx:1450)
  → loadMessages(conversationId)
  → loadMessagesCommand(id, { surface: 'core' })   ← diverge do Float
  → delegatingChatRepository.getMessages(id)
  → chatService.getConversationMessages(id)       ← HTTP OK
  → mapLegacyMessageToDomain (repo) → ChatDomainMessage[]
  → syncStoreFromCommandResult('listMessages', domainRows)
  → mapRepositoryResponseToActions('listMessages', domainRows)
  → []  (conversationId ausente após re-map)     ← QUEBRA
  → (messages/set nunca dispara)
  → useChatMessages → selectChatMessagesForUi → []
  → messagesView = []
  → VirtualizedMessageList messages={messagesView} → "Sem mensagens ainda"
```

---

## Etapas detalhadas

### 1 — Seleção (`selectedConversationId`)

| Pergunta | Resposta |
|---|---|
| Executa? | ✅ Sim |
| Quem chama? | `handleSelectConversation` (clique), rota mobile, restore refs |
| Parâmetros | UUID da conversa |
| Próximo passo | `useEffect` em `Chat.tsx:1450` dispara `loadMessages` |

Evidência: `setSelectedConversationId(conversationId)` em `Chat.tsx:3093`; usuário confirma seleção OK.

---

### 2 — Trigger (`loadMessages`)

| Pergunta | Resposta |
|---|---|
| Executa? | ✅ Sim (via `useEffect` quando `selectedConversationId` muda) |
| Quem chama? | `useEffect` `Chat.tsx:1450–1461`; também WS/refresh/send (silent) |
| Debounce? | ❌ Não |
| Generation guard? | ❌ Não (só guard `selectedConversationIdRef !== conversationId` antes do fetch) |
| Parâmetros | `conversationId`, opcional `{ silent: true }` |
| Próximo passo | `loadMessagesCommand(..., { surface: 'core' })` se `isChatStoreSourceOfTruth()` |

Guard early-return (`Chat.tsx:1262–1264`): se ref divergir do `conversationId` argumento, aborta antes do HTTP. Normal em troca rápida de conversa; não explica thread persistentemente vazia.

---

### 3 — Repository

| Superfície | Caminho | HTTP |
|---|---|---|
| **Chat (`core`)** | `delegatingChatRepository.getMessages` → `chatService.getConversationMessages` | `GET /api/chat/conversations/:id/messages` |
| **Floating (`float`)** | `chatService.getConversationMessages` direto | Mesmo endpoint |

| Pergunta | Resposta |
|---|---|
| Mesma chamada HTTP? | ✅ Sim (mesmo serviço) |
| Diferença | **Formato pós-HTTP**: core retorna `ChatDomainMessage[]`; float retorna `ChatMessage[]` legado |
| sync adicional | Float dispara `syncConversationMessages` fire-and-forget; Chat principal dispara sync no `handleSelectConversation`, não dentro do command core |

---

### 4 — Chat Core (`loadMessagesCommand`)

| Surface | Comportamento |
|---|---|
| `'float'` | `chatService.getConversationMessages` → `syncStoreFromCommandResult('listMessages', legacyRows)` |
| `'core'` (Chat) | `repo.getMessages` → domain rows → `syncStoreFromCommandResult('listMessages', domainRows)` |
| default (sem surface) | Igual `'core'` |

| Pergunta | Resposta |
|---|---|
| Executa no /chat? | ✅ Sim |
| Quem chama? | `Chat.tsx:1266` |
| Retorno | `ChatDomainMessage[]` (não usado pela UI diretamente) |

---

### 5 — Escrita no Store (`applyStoreMessages`)

| Pergunta | Resposta |
|---|---|
| Executa no load /chat? | ❌ **Não** — load path usa `syncStoreFromCommandResult`, não `applyStoreMessages` |
| Onde applyStoreMessages é usado? | Outbound queue, mutações manuais (`consolidation.ts:52`) |

---

### 6 — Reducer (`messages/set`)

| Pergunta | Resposta |
|---|---|
| Dispara no load /chat? | ❌ **Não** (actions array vazio) |
| Dispara no load Float? | ✅ Sim |
| `byConversationId[conversationId]` após load core | Ausente / length 0 |

Código crítico:

```84:92:src/features/chat-core/store/repositorySync.ts
    case 'listMessages':
    case 'getMessages': {
      if (!Array.isArray(payload) || payload.length === 0) return [];
      const messages = payload.map((row) =>
        mapLegacyMessageToDomain(row as Parameters<typeof mapLegacyMessageToDomain>[0]),
      );
      const conversationId = messages[0]?.conversationId;
      if (!conversationId) return [];
      return [chatDomainActionCreators.setMessages(conversationId, messages)];
```

`mapLegacyMessageToDomain` → `normalizeChatMessage` usa `raw.conversation_id`, não `raw.conversationId`:

```641:644:src/services/chat.ts
  return {
    id: raw.id,
    conversation_id: raw.conversation_id,
```

---

### 7 — Selectors

| Selector | Função | Resultado esperado pós-load quebrado |
|---|---|---|
| `selectConversationMessages` | domain ordenado | `[]` |
| `selectMessages` | alias | `[]` |
| `selectLastMessage` | última | `null` |
| `selectChatMessagesForUi` | UI (Chat) | `[]` |
| `selectMessagesForUi` | UI (Float) | OK se carregado via float |

Selectors estão corretos; leem store vazio.

---

### 8 — Hook (`useChatMessages`)

| Pergunta | Resposta |
|---|---|
| Executa? | ✅ Sim |
| Fonte | `selectChatMessagesForUi(storeState, conversationId)` |
| Retorno | `[]` quando store sem mensagens |
| Store × Hook | Alinhados (ambos vazios) |

Nota secundária: `useChatMessages` usa `getChatDomainStoreSession()` no subscribe; `useChatConversationList` usa `ensureChatDomainStoreSession()`. Em `Chat.tsx` a ordem dos hooks garante store criado antes (lista monta primeiro). **Não é a causa primária** com inbox funcionando.

---

### 9 — Render (`messagesView`)

| Pergunta | Resposta |
|---|---|
| Derivação | `messagesView = chatCoreStoreReadEnabled ? chatStoreMessages.messages : messages` (`Chat.tsx:1310`) |
| Thread render | `VirtualizedMessageList messages={messagesView}` (`Chat.tsx:6458–6459`) |
| Legado `messages` | Ainda atualizado por `setMessages` no effect (`1452–1457`), mas **ignorado** quando store ON |

O render usa o estado correto (`messagesView`); o store é que está vazio.

---

### 10 — Limpeza / resets

| Local | Ação | Afeta thread store ON? |
|---|---|---|
| `Chat.tsx:1452` | `setMessages([])` | ❌ Não (`messagesView` vem do store) |
| Vários `setMessages([])` em guards | Limpa legado | ❌ Não |
| `applyStoreMessages([])` | Não encontrado no load path | — |
| `messages/reset` | Não no fluxo de seleção | — |

Não há evidência de wipe pós-hidratação no store; o problema é **falha de escrita**, não limpeza.

---

### 11 — Comparação Float × Chat

```
FLOATING                          CHAT PRINCIPAL
────────                          ──────────────
Clique conversa                   Clique conversa
  ↓                                 ↓
useFloatingConversationMessages   useEffect → loadMessages
  ↓                                 ↓
loadMessagesCommand(float)        loadMessagesCommand(core)
  ↓                                 ↓
chatService.getConversationMessages   repo.getMessages → mesmo HTTP
  ↓                                 ↓
legacy ChatMessage[]              ChatDomainMessage[]  ← DIVERGÊNCIA
  ↓                                 ↓
syncStoreFromCommandResult        syncStoreFromCommandResult
  ↓                                 ↓
mapLegacyMessageToDomain OK       mapLegacyMessageToDomain FAIL
  ↓                                 ↓
messages/set ✅                   (nenhuma action) ❌
  ↓                                 ↓
selectMessagesForUi               selectChatMessagesForUi
  ↓                                 ↓
Render OK                         Render vazio
```

**Ponto de divergência:** `loadMessagesCommand` surface `'core'` vs `'float'` + re-mapeamento em `repositorySync.ts`.

---

### 12 — Instrumentação DEV (`VITE_F5_MESSAGES_AUDIT`)

**Não implementada** (auditoria read-only).

Logs esperados se instrumentado:

| Evento | Chat /chat | Floating |
|---|---|---|
| `repository response count` | N > 0 | N > 0 |
| `applyStoreMessages` / sync | 0 actions | 1 dispatch |
| `messages/set` | 0 | 1 |
| `selector count` | 0 | N |
| `hook count` | 0 | N |
| `render count` | 0 | N |

---

## Critérios de conclusão

| # | Pergunta | Resposta |
|---|---|---|
| 1 | API retorna mensagens? | ✅ Sim (mesmo endpoint; Float prova) |
| 2 | Store recebe mensagens (Chat)? | ❌ Não |
| 3 | Reducer grava? | ❌ `messages/set` não dispara |
| 4 | Selector lê? | ✅ Sim, retorna `[]` |
| 5 | Hook recebe? | ✅ Sim, retorna `[]` |
| 6 | Render usa estado correto? | ✅ `messagesView` (store), não legado |
| 7 | Onde desaparece? | **Entre `syncStoreFromCommandResult` e `messages/set`** |

---

## Correções sugeridas (referência — não implementar nesta auditoria)

1. **Preferida:** `listMessages` em `repositorySync.ts` usar `toDomainMessage(row)` (já trata domain vs legacy).
2. **Alternativa:** `loadMessagesCommand` core fazer `store.dispatch(setMessages(...))` direto, sem round-trip legacy.
3. **Paridade rápida:** Chat usar `{ surface: 'float' }` até command unificado de mensagens (F6?).
4. **Teste faltante:** caso `syncStoreFromCommandResult('listMessages', domainMessagesFromRepo)`.

---

## Arquivos relevantes

| Arquivo | Papel |
|---|---|
| `src/pages/Chat.tsx` | Seleção, `loadMessages`, `messagesView`, render |
| `src/features/chat-core/core/commands.ts` | `loadMessagesCommand` surfaces |
| `src/features/chat-core/repository/delegatingChatRepository.ts` | `getMessages` → domain |
| `src/features/chat-core/store/repositorySync.ts` | **Quebra** |
| `src/features/chat-core/store/integration.ts` | `syncStoreFromCommandResult` |
| `src/features/chat-core/store/hooks/useChatMessages.ts` | Leitura thread Chat |
| `src/features/chat-core/store/hooks/useFloatingConversationMessages.ts` | Leitura thread Float |
| `src/services/chat.ts` | `normalizeChatMessage` (`conversation_id` only) |
