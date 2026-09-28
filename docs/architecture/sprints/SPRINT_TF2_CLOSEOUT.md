# SPRINT_TF2_CLOSEOUT — Lista: fallback de tempo

| Campo | Valor |
|---|---|
| **Sprint** | TF2 (comando `ok sprint 2`) |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Data** | 2026-07-15 |
| **Tipo** | UI copy — lista Float + Chat |
| **Backend / Flags / ADR / 10D sync** | **Não alterados** |

---

## Resumo da entrega

Preview e timestamp da lista deixaram de compartilhar o mesmo fallback.  
Sem `lastMessageAt` → **`—`**.  
“Sem mensagens recentes” só na linha de **preview** vazia.

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `ui/conversationListCopy.ts` | Contrato compartilhado preview/time |
| `FloatingConversationList` | Usa helpers |
| `Chat.tsx` sidebar row | Usa helpers |
| Testes | `store.tf2.list-copy.test.ts` (4) |

### Critério de aceite

| Critério | Status |
|---|---|
| Preview + At nulo → sem “Sem mensagens recentes” na linha de tempo | **Pass** (código) |
| Sem preview → uma frase de vazio na preview; tempo `—` | **Pass** (código) |
| Float + Chat alinhados | **Pass** |
| Teste manual | **Pendente** |

---

## Checklist de teste (você)

1. Lista Float: conversa com preview texto e At nulo → sob o texto aparece **`—`**, não “Sem mensagens recentes”.  
2. Conversa sem preview e sem At → preview “Sem mensagens recentes”, tempo `—` (não duplicado).  
3. Mesmo comportamento na sidebar `/chat`.

---

## Observações (não corrigidas)

1. **Profile / CompactProfile / header CRM** ainda usam “Sem mensagens recentes” para At nulo — fora do escopo lista.  
2. **TF3** — preservar `lastMessageAt` no sync 10D (raiz de At nulo).  
3. **TF4** — Chat latest parity.

---

## Próximo

```
ok sprint 3
```
