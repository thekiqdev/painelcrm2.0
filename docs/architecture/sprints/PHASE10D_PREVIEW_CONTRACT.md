# PHASE10D_PREVIEW_CONTRACT — MB-083

| Campo | Valor |
|---|---|
| **Data** | 2026-07-15 |
| **Status** | Oficial Store ON |

## Contrato

```
Conversation Preview NÃO possui vida própria quando a Thread está hydrated.

Sempre deriva da última Message válida do slice messages.byConversationId[id].
```

### Hydrated

Presença da chave `messages.byConversationId[conversationId]` (mesmo que `[]`).

### Regras

1. **Proibido** efetivar `lastMessagePreview` / `lastMessageAt` via `conversations/upsert` quando hydrated — o reducer **reaplica** Preview ← Messages após o upsert.
2. **`messages/append|set|update|remove|prepend*`** → obrigatoriamente `syncConversationPreviewFromMessages`.
3. Thread vazia hydrated (`[]`) → Preview = `null` (sem órfão).
4. Sem hydrate → Preview de inbox / `conversation.updated` permitido (projeção até abrir).
5. Direção canônica de eventos de conteúdo: **Message → Conversation → UI**. Nunca Conversation Preview → Message Store.

### API interna

- `derivePreviewTextFromDomainMessage`
- `pickLastDomainMessage`
- `syncConversationPreviewFromMessages`

Não há `setLastMessagePreview` público. Escritas passam pelas actions de Messages (ou upsert Conversation que é corrigido se hydrated).
