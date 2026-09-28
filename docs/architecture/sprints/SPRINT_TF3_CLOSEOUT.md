# SPRINT_TF3_CLOSEOUT — Preview 10D: preservar lastMessageAt

| Campo | Valor |
|---|---|
| **Sprint** | TF3 (comando `ok sprint 3`) |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Data** | 2026-07-15 |
| **Tipo** | Domain Store — Preview sync |
| **Backend / Flags / ADR** | **Não alterados** |

---

## Resumo da entrega

`syncConversationPreviewFromMessages` deixa de sobrescrever `lastMessageAt` com `null` quando a última mensagem do slice não tem `sentAt`.  
Hydrate `[]` continua limpando preview **e** At (contrato 10D).

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `previewFromMessages.ts` | `nextAt`: sem last → null; com `sentAt` → thread; senão → preserva inbox |
| Testes | +2 em `store.phase10d.preview-messages.test.ts` (11 total) |

### Critério de aceite

| Critério | Status |
|---|---|
| Última msg sem `sentAt` + body → preview novo, At preservado | **Pass** |
| Com `sentAt` → At = thread | **Pass** |
| Empty hydrate limpa preview + At | **Pass** |
| Teste manual | **Pendente** |

---

## Checklist de teste (você)

1. Abrir conversa cujo inbox tinha data relativa, com thread onde timestamps de mensagem existam → tempo relativo permanece coerente.  
2. Após abrir, preview e eventual `—` (TF2) não devem “começar” sem At se a inbox já tinha `lastMessageAt`.  
3. Conversa genuinamente vazia (hydrate []) → preview vazio e tempo `—`.

---

## Observações (não corrigidas)

1. **TF4** — Chat open última bolha = preview.  
2. Profile/CompactProfile copy “Sem mensagens recentes” para At (TF2 obs).  
3. Backend `?latest=1` still ignored — residual.

---

## Próximo

```
ok sprint 4
```
