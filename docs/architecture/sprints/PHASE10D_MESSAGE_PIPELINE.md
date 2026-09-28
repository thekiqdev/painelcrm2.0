# PHASE10D_MESSAGE_PIPELINE — MB-082

| Campo | Valor |
|---|---|
| **Data** | 2026-07-15 |

## Caminhos que alteram `messages[]` (Domain Store)

| Caminho | Entry | Store action | Preview sync |
|---|---|---|---|
| Open thread | `loadMessagesCommand` | `messages/set` | Sim |
| Load more | `loadMessagesCursorCommand` | `prepend` / `prependPage` | Sim (tail imutável tipicamente) |
| Socket message.created | Bridge → `appendMessage` | `messages/append` | Sim |
| Socket message.updated/* | `updateMessage` | `messages/update` | Sim |
| Socket message.deleted | `removeMessage` | `messages/remove` | Sim |
| Optimistic send | `appendMessage` | `messages/append` | Sim |
| Confirm / merge | update/append | update/append | Sim |
| `applyStoreMessages` | setMessages | `messages/set` | Sim |
| Window eviction | remove ids | **sem** preview sync dedicado | Evict não chama sync (preserva) |

## Generation / races

`loadMessagesCommand` mantém generation por conversation; mismatch incrementa `hydrate_generation_mismatch_total` e **não** aplica write stale.

## Reconnect / sync manual

Reconnect aplica eventos via Bridge; sync manual tipicamente re-`loadMessagesCommand` / inbox — Preview rebuild no `messages/set`.
