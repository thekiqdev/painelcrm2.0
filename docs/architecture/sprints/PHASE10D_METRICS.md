# PHASE10D_METRICS — MB-089

| Campo | Valor |
|---|---|
| **Módulo** | `src/features/chat-core/metrics/previewMessagesMetrics.ts` |
| **Persistência** | Memória (DEV / test) |
| **Endpoint** | Nenhum |

## Contadores

| Metric | Significado |
|---|---|
| `preview_without_message_total` | Hydrate vazio com Preview prévio (órfão limpo) |
| `message_without_preview_total` | Última message sem texto derivável |
| `preview_thread_divergence_total` | Preview ≠ thread no momento do rebuild |
| `conversation_preview_rebuilt_total` | Escritas efetivas de Preview ← Messages |
| `message_append_total` | `messages/append` |
| `hydrate_generation_mismatch_total` | Race generation em `loadMessagesCommand` |

## API

- `getPreviewMessagesMetricsSnapshot()`
- `resetPreviewMessagesMetricsForTests()`

Exportadas em `chat-core/index.ts`.

## Log DEV

`console.warn('[Preview Thread Divergence]', { conversationId, storePreview, threadPreview })`
