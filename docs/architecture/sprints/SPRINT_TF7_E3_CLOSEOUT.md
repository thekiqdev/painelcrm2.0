# SPRINT_TF7_E3_CLOSEOUT — Espelho cache + force sync manual

| Campo | Valor |
|---|---|
| **Sprint** | TF7 · Etapa 3 |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Plano** | [`PLAN_TF7_WARM_STORE_CACHE.md`](./PLAN_TF7_WARM_STORE_CACHE.md) |
| **Predecessor** | [`SPRINT_TF7_E2_CLOSEOUT.md`](./SPRINT_TF7_E2_CLOSEOUT.md) |
| **Data** | 2026-07-16 |
| **Comando** | `ok etapa 3` |

---

## Resumo da entrega

Com Store ON, o Domain Store **espelha** conversas/msgs no `localStorage` (debounce após WS/upserts + após GET/open). A UI do Chat ganha menu **Atualizar lista** / **Limpar cache local e atualizar**, usando `forceReloadInboxCommand` (ignora TTL E2).

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `inboxPageCacheMirror.ts` | `mirrorStoreInboxToPageCache`, `mirrorStoreMessagesToPageCache`, `attachInboxPageCacheMirror` (debounce 800 ms) |
| Cap mirror | Top **50** (`INBOX_PAGE_CACHE_MIRROR_MAX`) |
| `forceReloadInboxCommand` | `invalidateInboxFreshness` + `loadInbox({ force: true })` |
| `clearPageCacheScope` | Opção no force → `clearChatPageCacheForSession` |
| Chat | Subscribe mirror; seed msgs após open; botão RefreshCw na lista |
| Testes | `store.tf7.e3-mirror-force.test.ts` (6) — OK |

---

## Comportamento Ctrl+R vs hard clear (3.5)

| Ação | Efeito |
|---|---|
| **Ctrl+R / F5** | Store some → warm E1 do disk → se `updatedAt` fresco (E2) pode **skip GET** |
| **Atualizar lista** | Force GET + rewrite cache (TTL ignorado) |
| **Limpar cache local e atualizar** | Apaga `localStorage` + force GET + rewrite |

Disco **nunca** é SoT — Domain Store continua dono da UI.

---

## Checklist de teste (manual)

1. Abrir `/chat`, receber msg WS → aguardar ~1 s → F5 → warm mostra preview atualizado.  
2. Menu refresh → **Atualizar lista** → Network: GET `view=list` + toast OK.  
3. **Limpar cache local e atualizar** → storage limpo + GET + lista da rede.  
4. Após “Atualizar”, próximo F5 em &lt; TTL → warm + skip (E1+E2).  
5. Store continua SoT (UI não lê só do disk).

---

## Próximo

- QA E3 → fecho global em [`SPRINT_TF7_CLOSEOUT.md`](./SPRINT_TF7_CLOSEOUT.md)  
- Opcional: **`ok etapa 4`** (Float parity / observabilidade)
