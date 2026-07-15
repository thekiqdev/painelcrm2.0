# SPRINT_TF4_CHAT_LATEST_PARITY — Chat open: última bolha = preview

| Campo | Valor |
|---|---|
| **Sprint** | TF4 |
| **Status** | IN PROGRESS → closeout |
| **Plano** | `PLAN_CHAT_THREAD_SURFACE_FIXES.md` |
| **Comando** | `ok sprint 4` |

## Problema

Preview da lista à frente da thread em `/chat` após open (Store ON).

## Causa raiz (audit)

1. **Race:** `handleSelectConversation` disparava `syncConversationMessages` **em paralelo** com `loadMessagesCommand` → GET podia terminar antes do sync WA gravar a última msg → Store/thread atrás do preview da inbox.
2. **Viewport:** com Message Virtual Engine (page), o layout só pinava `append`/`prevCount===0`; **replace** da cauda (mesmo count, `lastId` novo) não fazia scroll → última bolha fora do viewport.
3. Float já pinava no open (TF1); Chat page não chamava pin após hydrate.

## Fix

| Peça | Detalhe |
|---|---|
| `openConversationMessagesCommand` | sync best-effort → `loadMessagesCommand({ force: true })` |
| Chat + Float open | usam o comando TF4 (mesmo path) |
| Select Chat | remove sync paralelo |
| Virt core | pin se `lastId` muda e near-bottom |
| Chat `loadMessages` | rAF `scrollMessagesToBottom` pós-hydrate |

## Não fazer (plano)

Backend / ADR-011 flip / Kanban / Store OFF remove.
