# SPRINT_TF1.1_CLOSEOUT — Message order (sentAt mapper)

| Campo | Valor |
|---|---|
| **Sprint** | TF1.1 (hotfix sob plano Thread Surface) |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Data** | 2026-07-15 |
| **Comando** | `ok hotfix TF1.1` |
| **Backend / Flags / ADR** | **Não alterados** (só leitura FE do timestamp) |

---

## Resumo da entrega

Ordem das bolhas usava `domain.sentAt` alimentado só por `sent_at`/`created_at` snake no mapper, enquanto `normalizeChatMessage` grava **`sentAt` camelCase**. Resultado: sort por `created_at`/id e label HH:mm por `sent_at` WhatsApp → thread “ao contrário”.

**Fix:** domínio e normalize preferem `sentAt` / `sent_at` reais antes de `created_at`.

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `domainMappers.ts` | `sentAt: normalized.sentAt ?? sent_at ?? created_at` |
| `normalizeChatMessage` | `sentAt: sent_at ?? sentAt ?? created_at` |
| Testes | `store.tf1.1.sentAt-order.test.ts` (3) — caminho produção sem mock identity |

### Critério de aceite

| Critério | Status |
|---|---|
| Suite TF1.1 | **Pass** |
| Manual: HH:mm ASC (antiga → nova), última no fundo | **Pendente** |

---

## Checklist de teste (você)

1. Abrir Float / Chat na conversa que estava invertida.  
2. Confirmar tempos **subindo** no scroll (13:28 → 13:29 → 13:31).  
3. Última mensagem no **fundo**.  
4. Bolhas ainda visíveis (TF1 refs ok).

---

## Observações (não corrigidas)

1. Lista “Sem mensagens recentes” sob preview — **TF2**.  
2. `lastMessageAt` preserve 10D — **TF3**.  
3. Chat latest ≠ preview — **TF4**.  
4. Backend ainda ignora `?latest=1` no GET (ADR-011 residual) — fora deste hotfix.

---

## Próximo

Após teste OK:

```
ok sprint 2
```
