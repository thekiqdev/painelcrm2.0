# SPRINT_TF5_CLOSEOUT — WS dedupe + inbox order (hotfix)

| Campo | Valor |
|---|---|
| **Sprint** | TF5 (hotfix pós-TF4) |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Auditoria** | [`AUDIT_TF5_DUPLICATE_MESSAGES_INBOX_ORDER.md`](./AUDIT_TF5_DUPLICATE_MESSAGES_INBOX_ORDER.md) |
| **Data** | 2026-07-15 |
| **Comando** | `ok hotfix TF5` |
| **Branch** | `feature/chat-ownership-thread-surface-tf4` |

---

## Resumo da entrega

| Bug | Sintoma | Fix |
|---|---|---|
| **A** | Inbound WS gera várias bolhas; algumas `--:--`; F5 normaliza | `message_id` estável + flatten v2 + dedupe por `externalMessageId` / `clientMessageId` |
| **B** | Lista `/chat` embaralha e depois normaliza | `conversations/set` e `upsert` reescrevem `orderedIds` via `sortDomainConversations` |

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `normalizeChatMessage` | `id ← id \| message_id`; `external ← provider_message_id`; `sentAt` com `Date`→ISO |
| `eventAppliers.pickMessageFromPayload` | Flatten payload tenant v2 flat |
| `messages/append` | Dedupe lógico; promove id canônico se existente era `temp-*` |
| `conversations/set` / `upsert` | `orderedIds = sortDomainConversations(...)` |
| Testes | `store.tf5.ws-message-dedupe.test.ts` — **7 passed** |

---

## Checklist de teste (manual)

### Bug A

1. Receber **uma** mensagem inbound → **uma** bolha.  
2. Horário **não** é `--:--` (se o provider mandou `sent_at`).  
3. F5 não muda a contagem daquela msg.

### Bug B

1. Abrir `/chat` → lista já em ordem recente (sem “saltos” longos).  
2. Nova msg numa conversa antiga → sobe ao topo sem flash de embaralhamento.

---

## Observações (não corrigidas)

- Sort safety net em `Chat.tsx` (`conversationsToShow`) mantido.  
- Unificar emits BE (`new_message` vs `message.created`) — OOS FE.  
- Paginação inbox 50 — fora deste hotfix.

---

## Próximo

Validação manual A+B em staging/prod; se OK, TF surface estável até novo plano.
