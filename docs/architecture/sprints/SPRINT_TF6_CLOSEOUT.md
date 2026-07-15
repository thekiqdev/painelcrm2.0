# SPRINT_TF6_CLOSEOUT — Inbox load pressure (hotfix)

| Campo | Valor |
|---|---|
| **Sprint** | TF6 (hotfix pós-TF5) |
| **Gate** | **CLOSED** (aguardando teste manual + ops flags) |
| **Auditoria** | [`AUDIT_TF6_INBOX_LOAD_PRESSURE.md`](./AUDIT_TF6_INBOX_LOAD_PRESSURE.md) |
| **Plano** | [`PLAN_TF6_INBOX_LOAD_HOTFIX.md`](./PLAN_TF6_INBOX_LOAD_HOTFIX.md) |
| **Data** | 2026-07-15 |
| **Comando** | `ok hotfix TF6` |

---

## Resumo da entrega

| Fatia | Fix |
|---|---|
| **F1** | Shadow/dev-log **fail-safe** em `NODE_ENV=production` (mesmo com flag ON) |
| **F2** | Inbox agregada default **`limit=50`** + “Carregar mais” (Chat + Float) |
| **F3** | TTL 20s no `loadInboxCommand`, debounce Float 600 ms (prod), sem refetch de lista RQ com Store ON, Dock/find sem fan-out N×`instanceId` |

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `isChatAggregatedApiShadowEnabled` / `DevLog` | Retornam `false` em produção |
| `DEFAULT_INBOX_PAGE_SIZE = 50` | `chatConversationsRepository` + `loadInbox` / Float / Chat |
| `loadMoreInboxCommand` | Append no Store / merge na UI local |
| `conversations/set` | **replace** `byId` (evita acumular páginas/filtros) |
| Invalidate Float aggregates | Com Store ON só invalida `bubble-recent` |
| MinimizedDock / `findChatConversationById` | Agregado 50→200 max; sem legado multi-instância se agregado ON |
| Testes | `store.tf6.inbox-load.test.ts` (5), repo + flags BE, F5.9 atualizado |

---

## Ops (ainda necessário no painel)

1. Desligar `CHAT_AGGREGATED_API_SHADOW`  
2. Desligar `CHAT_AGGREGATED_DEV_LOG`  
3. Confirmar `CHAT_AGGREGATED_CHAT` (+ FLOAT) ON  

O fail-safe F1 cobre produção **mesmo se** shadow continuar ON no painel após o deploy.

---

## Checklist de teste (manual)

### Flags / shadow

1. Abrir `/chat` → log **sem** `shadow_compare` / `shadow_divergence`  
2. 1 GET agregada por refresh (não 2× SQL)

### limit=50

3. Network: `view=list` + `limit=50`  
4. “Carregar mais” → append; primeiras 50 permanecem  
5. WS sobe conversa ao topo (TF5)

### Coalesce

6. Abrir Float com `/chat` aberto → sem rajada de GET lista  
7. Várias msgs rápidas → sem re-GET inbox completa (Store ON)

---

## Observações

- Default BE 200 permanece para clients que não passam `limit`  
- Bubble Float ainda é React Query (invalidate leve)  
- Lookup pontual (dock) pode precisar 2ª página agregada (200) se a conversa não está no top-50  

---

## Próximo

Validação manual + ops flags; monitorar payloadBytes / queryMs em produção.
