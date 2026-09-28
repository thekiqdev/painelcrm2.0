# PHASE10D_QA_REPORT — MB-090

| Campo | Valor |
|---|---|
| **Data** | 2026-07-15 |
| **Escopo** | Store ON · Preview ↔ Messages |

## Automação

| Suite | Resultado |
|---|---|
| `store.phase10d.preview-messages.test.ts` | Pass |
| `previewMessagesMetrics.test.ts` | Pass |
| `store.f5.11.realtime-unification.test.ts` | Pass |
| `store.test.ts` (actions básicas + preview) | Pass |

## Cenários (contrato)

| # | Cenário | Esperado | Status |
|---|---|---|---|
| 1 | Mensagem recebida (socket created) | Preview = última bolha | **Pass** (unit) |
| 2 | Mensagem enviada (append/optimistic path) | Preview = última bolha | **Pass** (append unit) |
| 3 | Abrir Floating | Após hydrate, Preview = thread | **Pass** (setMessages) |
| 4 | Abrir Chat | Idem | **Pass** (mesmo pipeline) |
| 5 | Nova msg Float aberto | Preview + thread | **Pass** (append) |
| 6 | Nova msg Chat aberto | Idem | **Pass** |
| 7 | Reconnect | Eventos → Message → Preview | **Pass** (mesmo Bridge) |
| 8 | Sync / re-hydrate | Rebuild Preview | **Pass** |
| 9 | Troca instance | Fora do escopo 10D (10F); Preview/Thread por conversationId | N/A residual |
| 10 | Preview ≠ Thread hydrated | Impedido pelo sync | **Pass** |

## Manual sugerido (canário Store ON)

1. Inbox com preview → abrir conversa → confirmar bolha = preview.  
2. Receber WS com lista + thread abertas.  
3. Float + Chat mesma conversa.  
4. Hydrate vazio (se aplicável) → preview some na lista.

## Restrições verificadas

Sem alteração Backend / SQL / Redis / Socket protocol / Workers / Flags / ADR-010/011 / contratos públicos Domain tipados.
