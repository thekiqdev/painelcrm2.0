# SPRINT_TF1_CLOSEOUT — Float scroll ref + virtualizer paint

| Campo | Valor |
|---|---|
| **Sprint** | TF1 (plano Thread Surface · comando `ok sprint 1`) |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Data** | 2026-07-15 |
| **Tipo** | Bugfix FE — render Floating |
| **Backend / Flags / ADR** | **Não alterados** |

---

## Resumo da entrega

O Float deixava de pintar mensagens com virtualização ligada porque o `div` de histórico tinha **dois `ref`**: o último (`messageHistoryScrollRef`) sobrescrevia o `scrollRef` usado pelo TanStack Virtual → `getScrollElement() === null` → área vazia com só o botão “Carregar mensagens anteriores”.

**Fix:** um único `scrollRef` para virt, `onScroll` e Load More; pin no fim ao abrir conversa com virt ON.

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `FloatingConversationWindow.tsx` | Removido `messageHistoryScrollRef`; único `ref={scrollRef}` |
| Load More | `loadMore(scrollRef.current)` |
| Scroll virt ON | `requestAnimationFrame` → `scrollToBottom` no open (`conversationId` + primeira wave de msgs) |
| Scroll virt OFF | Mantém `scrollTop = scrollHeight` em `messages.length` |
| Mobile overlay | Já tinha um único `scrollRef` — sem mudança |

### Critério de aceite

| Critério | Status |
|---|---|
| Código: dual ref eliminado | **Pass** |
| Virt / Load More / scroll no mesmo elemento | **Pass** |
| Teste manual usuário (≥40 msgs ou `VITE_CHAT_VIRTUAL_MESSAGES=1`) | **Pendente** |

---

## Checklist de teste (você)

1. Abrir Float numa conversa com muitas mensagens (latest page ~50 → virt ≥40).  
2. Confirmar **bolhas visíveis** (não só o botão Load More).  
3. Confirmar que a mensagem recente (próxima do preview da lista) aparece / scroll no fim.  
4. Clicar “Carregar mensagens anteriores” — histórico sobe sem “sumir” tudo.  
5. Header (nome / atendimento) permanece OK.

---

## Observações (não corrigidas)

1. **Lista “Sem mensagens recentes” sob preview** — Sprint TF2.  
2. **`lastMessageAt` null no 10D** — Sprint TF3.  
3. **Chat page ≠ preview última msg** — Sprint TF4.  
4. Float ainda usa TanStack **legacy** (não Message Virtual Engine core) — ADR/escopo intocado.  
5. **Ordem HH:mm invertida** — causa raiz mapper `sentAt` camelCase; corrigido em **TF1.1** (`SPRINT_TF1.1_CLOSEOUT.md`).

---

## Artefatos

| Arquivo | |
|---|---|
| `SPRINT_TF1_FLOAT_SCROLL_REF.md` | Spec |
| `SPRINT_TF1_CLOSEOUT.md` | Este |
| `FloatingConversationWindow.tsx` | Fix |

---

## Próximo

Após teste OK:

```
ok sprint 2
```

→ Lista fallback de tempo (TF2).
