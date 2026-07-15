# SPRINT_TF3.1_CLOSEOUT — Lean conversation.updated ghost row

| Campo | Valor |
|---|---|
| **Sprint** | TF3.1 (hotfix) |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Data** | 2026-07-15 |
| **Comando** | `ok hotfix TF3.1` |
| **Backend / Flags** | **Não alterados** (payload lean do tenant permanece; FE tolera) |

---

## Resumo da entrega

Ao enviar mensagem, o backend emite `conversation_updated` (row completa) **e** `conversation.updated` tenant (**só** `conversation_id`). O Store fazia upsert com `id` indefinido → **row fantasma** (mesmo nome/preview, sem Cliente/tel).

**Fix:** detectar payload lean; resolver `id` via `conversation_id`; patch só preview/at/unread na row existente; **nunca** inserir ghost.

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `normalizeConversation` | `id = raw.id ?? raw.conversation_id` |
| `eventAppliers.pickConversationPatch` | Lean vs full; flag `__leanRealtimePatch` |
| `conversations/upsert` | Lean sem existing → no-op; lean com existing → merge preview only |
| Testes | `store.tf3.1.lean-conversation-upsert.test.ts` (3) |

---

## Checklist de teste (você)

1. Abrir inbox (Store ON).  
2. Enviar mensagem numa conversa com `· Cliente` / telefone.  
3. Confirmar **uma** row (não duplicar magra ao lado).  
4. Preview/tempo atualizam na mesma linha.

---

## Observações

1. **TF4** — Chat open última bolha = preview (ainda pendente).  
2. Payload lean do backend permanece; remediação é FE.  
3. Ghosts já criados nesta sessão → refresh/reload da lista limpa.

---

## Próximo

```
ok sprint 4
```
