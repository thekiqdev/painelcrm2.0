# PHASE10D_RUNTIME_FLOW

| Campo | Valor |
|---|---|
| **Data** | 2026-07-15 |

## Ordem determinística (abrir conversa)

```
1. Selection (Chat selectedId / Float panel id)
2. loadMessagesCommand(+ generation++)
3. GET messages latest page (ADR-011)
4. messages/set → Message Store
5. syncConversationPreviewFromMessages
6. Selectors (lista preview + thread)
7. UI Chat / Floating
```

Se generation mismatch no passo 3–4: **não** aplica store; métrica `hydrate_generation_mismatch_total`.

## Socket message.created

```
Bridge normalize
  → appendMessage
  → Message Store
  → sync Preview
  → Selectors / UI (lista + thread se aberta)
```

## Socket conversation.updated

```
upsert Conversation (CRM / unread / meta)
  → se thread hydrated: Preview reescrito a partir das Messages
  → senão: Preview do evento permanece (inbox)
```

## Floating vs Chat

Mesmo Domain Store (flag ON): ambos leem Conversation + Messages da Store.  
Preview da lista = mesmos campos. Thread = `selectMessagesForUi` / hooks Float/Chat.

Residual: header Float ainda pode usar RQ `conversation-meta` (10E) — **não** é o preview da lista.
