# SPRINT F4b — Frontend Migration para API Agregada

| Campo | Valor |
|---|---|
| **Sprint** | F4b (frontend) |
| **Data** | 2026-07-08 |
| **Status** | Entregue — flags OFF por default |
| **Pré-requisito** | F4a backend + `CHAT_AGGREGATED_CONVERSATIONS=1` no servidor |

---

## 1. Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `src/repositories/chatConversationsRepository.ts` | **Novo** — decisão agregada/legado por superfície |
| `src/repositories/chatConversationsRepository.test.ts` | **Novo** — 4 testes |
| `src/lib/chatAggregatedFlags.ts` | **Novo** — flags por superfície |
| `src/lib/chatConversationsMetrics.ts` | **Novo** — métricas F4b |
| `src/services/chat.ts` | `getConversationsAggregated()` |
| `src/lib/resolveChatConversationForCrm.ts` | Repository em vez de loop |
| `src/lib/chatPrefetch.ts` | Repository (surface `sidebar`) |
| `src/features/floating-chat/floatingChatQueries.ts` | Repository (surface `float`) |
| `src/features/floating-chat/FloatingChatWidget.tsx` | Repository |
| `src/features/floating-chat/FloatingConversationList.tsx` | Repository |
| `src/features/floating-chat/FloatingConversationWindow.tsx` | `findChatConversationById` |
| `src/features/floating-chat/MobileConversationOverlay.tsx` | `findChatConversationById` |
| `src/features/floating-chat/MinimizedChatDock.tsx` | Repository batch meta |
| `src/components/leads/EmbeddedLeadConversationPanel.tsx` | `findChatConversationById` (surface `lead`) |
| `src/pages/Chat.tsx` | `listChatConversations` quando flag `chat` ON |

**Preservados (rollback):** `src/lib/chatConversationsFetch.ts`, `chatService.getConversations()`.

**Não alterados:** Chat Core, WebSocket, Instance Registry, Unread Engine, Providers, UX.

---

## 2. Consumidores migrados

| Fase | Superfície | Arquivo | Flag |
|---|---|---|---|
| **F4b.1** | Floating Chat | `floatingChatQueries.ts` | `VITE_CHAT_FF_AGGREGATED_FLOAT` |
| | | `FloatingChatWidget.tsx` | |
| | | `FloatingConversationList.tsx` | |
| | | `FloatingConversationWindow.tsx` | |
| | | `MobileConversationOverlay.tsx` | |
| | | `MinimizedChatDock.tsx` | |
| **F4b.2** | Lead embed | `EmbeddedLeadConversationPanel.tsx` | `VITE_CHAT_FF_AGGREGATED_LEAD` |
| | CRM resolve | `resolveChatConversationForCrm.ts` | |
| | Quick View | via `resolveConversationIdForCrmRecord` | |
| **F4b.3** | Prefetch / sidebar | `chatPrefetch.ts` | `VITE_CHAT_FF_AGGREGATED_SIDEBAR` |
| **F4b.4** | Chat principal | `Chat.tsx` `loadConversations` | `VITE_CHAT_FF_AGGREGATED_CHAT` |

---

## 3. Consumidores ainda legados

| Arquivo | Motivo |
|---|---|
| `src/lib/chatConversationsFetch.ts` | Fallback interno do repository |
| `ChatKanbanAddCardDialog.tsx` | Fora do escopo F4b (já 1× HTTP) |
| `InstanceDetailsDialog.tsx` | Admin / escopo por instância |
| Qualquer caller com flag OFF | Comportamento idêntico ao pré-F4b |

---

## 4. Loops N+1 eliminados (quando flag ON)

| Superfície | Antes | Depois |
|---|---|---|
| Float lista/bubble | N+1 HTTP | **1** HTTP agregado |
| Float meta window | até N listas | **1** HTTP (`findChatConversationById`) |
| Minimized dock meta | até N listas | **1** HTTP batch |
| Lead embed meta | 1× broad list | **1** HTTP agregado com `instanceIds` |
| CRM resolve | N× loop | **1** HTTP agregado |
| Prefetch idle | 5×(N+1) | **1** HTTP por prefetch key |
| Chat inbox | N+1 merge | **1** HTTP agregado |

---

## 5. Merges eliminados (quando flag ON)

| Local | Merge/sort removido |
|---|---|
| `Chat.tsx` | dedupe `Map` + `sort` — bypass quando `AGGREGATED_CHAT` |
| `fetchMergedChatConversations` | não chamado quando agregado |
| Float lista | sem `sortConversationsByRecent` no path agregado |
| Unread tab float | `unreadOnly` no servidor (`quickFilter: unread`) |

**Nota:** filtros de busca visual no Float/Chat permanecem no cliente (UI only, não merge multi-instância).

---

## 6. Comparação antes/depois

| Métrica | Flags OFF | Flags ON (N=5) |
|---|---|---|
| HTTP float open | 6 | **1** |
| HTTP prefetch idle | ~30 | **~3–5** |
| HTTP Chat load | 6 | **1** |
| Merge JS | sim | **não** |
| Cursor API | não | **sim** (`nextCursor` em `ListResult`) |
| Fallback automático | — | erro agregado → legado |

---

## 7. Ganho esperado

- **−83%** chamadas HTTP nas superfícies migradas com flag ON
- **−93%** no prefetch idle
- Latência inbox ≈ 1 round-trip vs soma sequencial
- Menor CPU cliente (sem dedupe/sort)

---

## 8. Fallbacks

| Condição | Comportamento |
|---|---|
| `getConversationsAggregated` falha | `fetchMergedChatConversations` automático |
| `instanceIds` vazio no agregado | throw → fallback |
| Flag superfície OFF | legado direto |
| Backend `CHAT_AGGREGATED_CONVERSATIONS=0` | fallback por erro HTTP |

Métrica: `getChatConversationsMetricsSnapshot().fallbacks`

---

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Divergência ordem/filtros agregado vs legado | Shadow F4a; fallback; flags por superfície |
| `view=list` campos insuficientes | `normalizeConversation` compatível; flag OFF |
| LIMIT 200 global | `hasMore` + cursor (F6 UX load-more) |
| Flag ON sem backend ON | fallback silencioso |

---

## 10. Aprovação para início da F5

| Critério | Status |
|---|---|
| Repository único por superfície | ✓ |
| 4 flags independentes OFF default | ✓ |
| Fallback automático | ✓ |
| Métricas F4b | ✓ |
| 4 testes repository | ✓ |
| Chat Core inalterado | ✓ |
| Canário por superfície em staging | **Pendente** |
| Paridade visual/filtros validada | **Pendente** |

**F5 (Chat Domain Store)** após canário F4b com todas as superfícies validadas.

---

## Ativação (staging)

```bash
# Backend (F4a)
CHAT_AGGREGATED_CONVERSATIONS=1

# Frontend — habilitar por superfície
VITE_CHAT_FF_AGGREGATED_FLOAT=1
VITE_CHAT_FF_AGGREGATED_LEAD=1
VITE_CHAT_FF_AGGREGATED_SIDEBAR=1
VITE_CHAT_FF_AGGREGATED_CHAT=1

# Métricas
VITE_CHAT_CORE_METRICS=1
```

### API do repository

```typescript
import { listChatConversations } from '@/repositories/chatConversationsRepository';

const { items, nextCursor, hasMore, source } = await listChatConversations({
  surface: 'float',
  instanceIds,
  inboxScope: 'tenant',
  quickFilter: 'all',
  cursor: null,
  limit: 200,
});
```

### Métricas

```typescript
import { getChatConversationsMetricsSnapshot } from '@/lib/chatConversationsMetrics';
getChatConversationsMetricsSnapshot();
// aggregatedCalls, legacyCalls, fallbacks, avgDurationMs, aggregatedSharePercent
```

---

*SPRINT F4b — migração incremental. Flags OFF = zero mudança. Divergências nunca chegam ao usuário graças ao fallback.*
