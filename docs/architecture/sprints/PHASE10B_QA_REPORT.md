# PHASE10B_QA_REPORT — MB-077

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |
| **Tipo** | Code-path + unit tests |

## Matriz (Store ON)

| Cenário | Mesma Conversation Store? | Notas |
|---|---|---|
| Preview lista Chat | ✅ | selectors |
| Header / perfil Chat | ✅ | selection |
| Floating lista | ✅ | same store |
| Floating CRM link/lead | ✅ Store write | meta RQ auxiliar |
| Kanban board card | ⚠ DTO `conv_*` | residual API |
| Kanban add-card picker | HTTP search list | efêmero |
| CRM lead/client/archive | ✅ upsert / UiUpdate | |
| Tags na conversa | ✅ via patch Store | |
| Attendance bump | ✅ setConversations→Store | |
| Last message / unread | ✅ Store (+ engine unread) | |
| Socket update | ✅ Bridge → Store | 1× map |
| Avatar / name | ✅ Store.raw | |

## Testes automáticos

| Suite | Resultado |
|---|---|
| `conversationRuntimeMetrics.test.ts` | Pass |
| `chat.normalizeConversation.test.ts` | Pass |
| `store.f5.6.consolidation.test.ts` | Pass |

## Manual sugerido

1. Add Lead via `+` em `/chat` — lista + perfil atualizam sem F5.  
2. Mesmo fluxo no Floating — lista Store + meta alinhados.  
3. Enviar mensagem — preview da linha atualiza (bump→Store).  
4. Arquivar — some da inbox ativa.

## Divergência

Se `domain` vs `raw` discordarem em lead/client/preview → log  
`[Conversation Divergence Detected]` + métrica `conversation_duplicate_detected`.
