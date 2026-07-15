# AUDIT_RUNTIME_MESSAGE_FLOW — AUD-106 (Messages) + thread

| Campo | Valor |
|---|---|
| **Auditoria** | Phase 10C |
| **Data** | 2026-07-14 |

## Pipeline Messages (Store ON)

```
Open conversation (Chat ou Float)
  → loadMessagesCommand({ latestPage: true })   // ADR-011 Float
  → GET messages?latest=1
  → applyStoreMessagesInternal
  → selectMessagesForUi
  → Thread UI
```

Socket:

```
message.created
  → Bridge → appendMessage(conversationId, msg)
  → Thread atualiza SE slice já existe / selector assina
  → Preview NÃO atualizado neste reducer
```

## Preview vs Thread (AUD-106)

| Caso | Como nasce | Owner Preview | Owner Thread |
|---|---|---|---|
| Preview atualizado / Thread antiga | `conversation.updated` upsert preview; messages hydrate atrasado ou página parcial | Conversation | Messages |
| Preview atualizado / Thread vazia | Preview via inbox/socket; `loadMessagesCommand` retorna `[]` / falha / race generation | Conversation | Messages (vazio) |
| Preview vazio / Thread com msgs | Messages hydrated; conversation row stale (sem updated) | Conversation stale | Messages |
| Preview ok / Thread ok | Ambos atualizados (hydrate + eventos) | Alinhado | Alinhado |

**Conclusão:** Preview e Thread **não** são a mesma entidade. Preview ∈ Conversation; Thread ∈ Messages[]. Phase 10B unificou Conversation, não ligou Preview↔Messages.

## Floating específico

| Componente | Lê Messages de |
|---|---|
| FloatingConversationWindow | `useFloatingConversationMessages` → Store ON |
| MobileConversationOverlay | idem |
| Provider WS Store ON | **não** invalida RQ messages; depende Bridge append |

Se Bridge não entregar append e hydrate vier vazio → Float thread vazia com lista ainda mostrando preview da Conversation Store.
