# SPRINT F2 — WebSocket Patch (Anti-Invalidate)

| Campo | Valor |
|---|---|
| **Sprint** | F2 — Realtime por patch |
| **Data** | 2026-07-08 |
| **Status** | Implementada — **sub-flags OFF por default** |
| **Master Plan** | [`CHAT_ENTERPRISE_MIGRATION_MASTER_PLAN.md`](../CHAT_ENTERPRISE_MIGRATION_MASTER_PLAN.md) §F2 |

---

## 1. Objetivo

Substituir gradualmente `invalidateQueries` reativos a eventos WebSocket por atualização direta do cache (`setQueryData`) quando o payload WS for suficiente, preservando comportamento e UX do Chat.

---

## 2. Arquivos alterados

### Novos (`src/features/chat-core/ws-patch/`)

| Arquivo | Função |
|---|---|
| `types.ts` | Tipos `ChatWsPatchResult`, contexto |
| `payload-sufficiency.ts` | Validadores de payload por evento |
| `conversation-merge.ts` | Merge seguro de conversas + ordenação |
| `query-cache.ts` | Helpers `setQueryData` no Floating Chat |
| `handlers/message-created.ts` | F2.1 |
| `handlers/conversation-updated.ts` | F2.2 |
| `handlers/message-updated.ts` | F2.3 |
| `handlers/conversation-deleted.ts` | F2.4 |
| `handlers/attendance-updated.ts` | F2.5 |
| `apply-ws-patch.ts` | Dispatcher `tryApplyChatWsPatch` |
| `index.ts` | API pública do módulo |

### Alterados

| Arquivo | Mudança |
|---|---|
| `feature-flags.ts` | 5 sub-flags F2 + `isChatWsPatchPhaseStable()` |
| `index.ts` | Exports F2 |
| `core/chatCore.ts` | Comentário `applyEvent` (patch via UI) |
| `README.md` | Documentação F2 |
| `chat-core.f2.test.ts` | 8 testes |
| `FloatingChatProvider.tsx` | Patch antes de invalidate (message + conversation) |
| `FloatingConversationWindow.tsx` | Idem |
| `MobileConversationOverlay.tsx` | Idem |
| `Chat.tsx` | Patch delete, message_updated, attendance (floating cache) |

---

## 3. Eventos migrados (por sub-flag)

| Etapa | Evento | Flag | Integração |
|---|---|---|---|
| **F2.1** | `message.created` / `new_message` | `VITE_CHAT_FF_WS_PATCH_MESSAGE` | Provider, Window, Overlay |
| **F2.2** | `conversation.updated` / `conversation_updated` | `VITE_CHAT_FF_WS_PATCH_CONVERSATION` | Provider, Window, Overlay |
| **F2.3** | `message_updated` | `VITE_CHAT_FF_WS_PATCH_MESSAGE_UPDATED` | `Chat.tsx` (cache float se existir) |
| **F2.4** | `conversation.deleted` | `VITE_CHAT_FF_WS_PATCH_DELETE` | `Chat.tsx` |
| **F2.5** | `conversation_attendance_updated` | `VITE_CHAT_FF_WS_PATCH_ATTENDANCE` | `Chat.tsx` (campos da conversa em cache) |

---

## 4. Eventos ainda legados

| Evento / fluxo | Motivo |
|---|---|
| `notification.created` | Fora do escopo F2 |
| `channel.status_changed` | Fora do escopo F2 |
| `whatsapp.instance_removed` | Fora do escopo F2 |
| `chat.message_comment.created` | Payload parcial; página Chat usa `setState` local |
| `crm.note.created` | Requer HTTP (`listCrmNotes`) |
| **Contadores agregados** (`attendance-counts`) | Payload F2.5 não inclui queue/mine/team/unread global — HTTP mantido em `Chat.tsx` |
| **Kanban** `refreshCards()` | Estado local do board; não usa RQ — refresh completo mantido |
| **Nav unread** (`useChatNavUnreadCount`) | Poll + HTTP `attendance-counts` — mantido (F3) |
| **Página `/chat`** lista/mensagens | Já patch local via `useState` (pré-F2); sem mudança |
| **Lead / Client profile** conversas | Keys `lead-conversations` / `client-conversations` não migradas nesta sprint |
| `message_updated` no Floating | Evento não propagado via `CustomEvent` — patch só quando cache acessível via `Chat.tsx` |

---

## 5. invalidateQueries eliminados (quando flag ON + payload OK)

Com sub-flag ligada e conversa/mensagens **já em cache**:

| Superfície | Antes (por evento) | Depois |
|---|---|---|
| Floating Provider — `message.created` | 1–4 invalidates | 0 HTTP |
| Floating Provider — `conversation.updated` | 2–3 invalidates | 0 HTTP |
| Floating Window — `message.created` | 2 invalidates | 0 HTTP |
| Floating Window — `conversation.updated` | 3 invalidates | 0 HTTP |
| Chat — `conversation.deleted` | `floating-chat` + `chat-conversations` | 0 se conversa estava em cache float |

**Estimativa por mensagem recebida no float (janela aberta, cache quente):** ~7–9 HTTP → **0** (patch only).

---

## 6. Fallbacks existentes

| Condição | Comportamento |
|---|---|
| Sub-flag OFF | `applied: false`, `reason: flag_off` → invalidate legado |
| Payload insuficiente | `reason: payload_insufficient` → invalidate legado |
| Conversa não está em cache RQ | `reason: conversation_not_in_cache` → invalidate legado |
| Mensagens não carregadas | `reason: messages_not_cached` → invalidate legado |
| Qualquer falha no patch | Caller executa **exatamente** o fluxo pré-F2 |

`invalidateQueries` **não foi removido** — permanece como fallback obrigatório.

---

## 7. Riscos encontrados

| Risco | Mitigação |
|---|---|
| Conversa nova não está na lista em cache | Fallback invalidate agregados |
| Payload v2 sem `message_contract` completo | `normalizeChatMessage` + preview derivado (mesma lógica Chat.tsx) |
| Dual listener Provider + Window | Patch idempotente (dedupe por message id) |
| Contadores globais desalinhados sem HTTP | HTTP `attendance-counts` mantido em attendance WS |
| Legacy `new_message` sem `direction` no detail | Handler Provider já filtrava `incoming`; patch segue mesma regra |

---

## 8. Comparação HTTP antes/depois

| Cenário | Flags | HTTP por WS evento |
|---|---|---|
| Baseline (pré-F2) | todas OFF | 2–9 GET (float ativo) |
| F2.1 ON, cache quente | `WS_PATCH_MESSAGE=1` | 0 |
| F2.2 ON | `WS_PATCH_CONVERSATION=1` | 0 |
| F2 parcial (só MESSAGE) | só message ON | conversation ainda invalida |
| Payload incompleto | qualquer ON | igual baseline (fallback) |

Métricas: `recordChatRealtimeUpdate` + `VITE_CHAT_CORE_METRICS=1`.

### Estatísticas operacionais (F2 patch)

| API | Descrição |
|---|---|
| `recordChatWsPatchAttempt` | Registro automático em cada `tryApplyChatWsPatch` |
| `getChatWsPatchStatistics()` | Patches aplicados, fallbacks, motivos, `%` sucesso por `eventKind` |
| `getChatBaselineSnapshot().wsPatchStatistics` | Mesmo agregado no snapshot geral |

Logs de patch (`ws_patch_attempt`) **somente** com `VITE_CHAT_CORE_METRICS=1` (não em DEV).

---

## 9. Feature Flags

| Flag | Env | Default |
|---|---|---|
| `CHAT_WS_PATCH_MESSAGE` | `VITE_CHAT_FF_WS_PATCH_MESSAGE` | OFF |
| `CHAT_WS_PATCH_CONVERSATION` | `VITE_CHAT_FF_WS_PATCH_CONVERSATION` | OFF |
| `CHAT_WS_PATCH_MESSAGE_UPDATED` | `VITE_CHAT_FF_WS_PATCH_MESSAGE_UPDATED` | OFF |
| `CHAT_WS_PATCH_DELETE` | `VITE_CHAT_FF_WS_PATCH_DELETE` | OFF |
| `CHAT_WS_PATCH_ATTENDANCE` | `VITE_CHAT_FF_WS_PATCH_ATTENDANCE` | OFF |
| `CHAT_WS_PATCH` (fase) | `VITE_CHAT_FF_WS_PATCH` | OFF — estável quando **todas** sub-flags ON em produção |

**Rollback:** desligar sub-flag → invalidate imediato, sem deploy.

---

## 10. Critérios de aceite

| Critério | Status |
|---|---|
| Chat funciona igual com flags OFF | Cumprido |
| Usuário não percebe diferença | Cumprido (default OFF) |
| Sem refetch quando payload suficiente | Cumprido (float, flags ON) |
| Fallback automático | Cumprido |
| Rollback por flag | Cumprido |
| Incremental por evento | Cumprido |
| HTTP / polling / API inalterados | Cumprido |
| 17 testes chat-core passando | Cumprido |

---

## 11. Próximos passos (F3)

1. **Instance Registry** — um `listInstances` até invalidação real.
2. **Unread Engine** — substituir poll 120s + `attendance-counts` por reconcile 2–5 min.
3. Propagar `message_updated` via Bridge → `CustomEvent` (opcional) para patch no float sem socket direto.
4. Canário F2 em staging: ligar sub-flags uma a uma (`MESSAGE` → `CONVERSATION` → …).
5. Atualizar gate F1 §12–13 antes de rollout amplo F2 em produção.

---

*SPRINT F2 — patch WS apenas. Sem otimização HTTP de bootstrap/polling.*
