# SPRINT_TF4_CLOSEOUT — Chat open latest parity

| Campo | Valor |
|---|---|
| **Sprint** | TF4 |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Data** | 2026-07-15 |
| **Comando** | `ok sprint 4` |

---

## Resumo da entrega

Open de conversa (Chat + Float) passa a **esperar sync WA** e só então hidratar a latest page com `force`.  
Virtualizer page pin na cauda em **replace**; Chat faz scroll pós-hydrate.

### Causa raiz

GET em paralelo com sync deixava a thread atrás do preview; scroll/virt não revelava a última bolha após replace.

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `loadMessages.ts` | `openConversationMessagesCommand` |
| `commands.ts` / `index.ts` | export |
| `Chat.tsx` | open via TF4; remove sync paralelo no select; pin rAF |
| `useFloatingConversationMessages.ts` | mesmo open command |
| `useMessageVirtualization.ts` | pin quando `lastId` muda + near-bottom |
| Testes | `store.tf4.chat-open-latest-parity.test.ts` (3) |

---

## Checklist de teste

1. Conversa cujo preview da lista é `"X"` → abrir em `/chat` → **última bolha** (fundo) mostra `"X"`.  
2. Abrir a **mesma** conversa no Float → mesma última msg.  
3. Sem clicar “Atualizar inbox” só para alinhar preview.  
4. Scroll: após open, viewport no fim (não precisa subir/descer para achar a última).

---

## Observações (não corrigidas)

- Backend `?latest=1` residual (ADR-011) — fora de escopo.  
- TF3.3 avatar F5 — teste manual independente.

---

## Próximo

Thread Surface Fixes: **sprints 1–4 closed** (após teste OK).  
Sem sprint TF seguinte no plano — reportar sintomas ou novo plano.
