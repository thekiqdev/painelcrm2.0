# PLAN_TF6_INBOX_LOAD_HOTFIX — Flag + coalesce + limit=50

| Campo | Valor |
|---|---|
| **Documento** | Plano curto de hotfix |
| **Data** | 2026-07-15 |
| **Auditoria** | [`AUDIT_TF6_INBOX_LOAD_PRESSURE.md`](./AUDIT_TF6_INBOX_LOAD_PRESSURE.md) |
| **Tipo** | Hotfix incremental — **uma fatia testável por comando** |
| **Backend SQL/schema / Socket protocol / ADR** | **NÃO alterar** (exceto fail-safe de shadow se autorizado) |
| **Comando** | `ok hotfix TF6` → implementar **fatia 1+2+3** abaixo + closeout |

---

## Objetivo

Cortar a pressão que trava o backend em produção:

1. Shadow **não** roda no hot path  
2. 1ª página da inbox = **50** conversas (`view=list`) + “Carregar mais”  
3. Menos storms de GET (coalesce FE)

---

## Fatias (ordem fixa)

### Fatia 1 — Flags (ops + fail-safe mínimo) — **P0 / 5 min ops**

| Ação | Onde |
|---|---|
| Desligar `CHAT_AGGREGATED_API_SHADOW` | SuperAdmin → Chat migration flags / `superadmin_settings` |
| Desligar `CHAT_AGGREGATED_DEV_LOG` | Idem |
| Confirmar ON: `CHAT_AGGREGATED_CHAT` (+ FLOAT se usado) | Evita N× `?instanceId=` |

**Fail-safe código (recomendado no mesmo hotfix):**  
Se `NODE_ENV=production`, `isChatAggregatedApiShadowEnabled()` retorna **false** mesmo com flag ON (log warn 1×).  
Arquivo: `packages/backend/src/services/chatMigrationFlags/service.ts` (ou wrapper em `featureFlags.ts` agregado).

**Aceite F1**

- [ ] Log prod **sem** `shadow_compare` / `shadow_divergence`  
- [ ] Open chat: SQL da lista ≈ 1× por refresh (não 2×)

---

### Fatia 2 — FE `limit=50` + load more — **P0 / ~0,5–1 dia**

Backend **já** tem `cursor` / `hasMore` / `limit` (1–200). FE repository tipa `limit`/`cursor` mas default não força 50.

| # | Mudança | Arquivo |
|---|---|---|
| 2.1 | Constante `DEFAULT_INBOX_PAGE_SIZE = 50` | `chatConversationsRepository.ts` ou `inboxFetch` / chat-core |
| 2.2 | `buildAggregatedFilters` / `loadInboxCommand` / Float list usam `limit: 50` (1ª página) | repository + `loadInbox` params |
| 2.3 | Estado Store: `inboxNextCursor` / `inboxHasMore` (ou espelho em UI state) | Store mínimo **ou** state local Chat/Float |
| 2.4 | Ação “Carregar mais” → `listChatConversations({ cursor, limit: 50 })` + **append** (não replace) | Chat sidebar + Float list |
| 2.5 | `findChatConversationById` / MinimizedDock: **não** puxar 200 full via legado se agregada ON | Preferir agregado `limit` curto ou get-by-id se existir |

**Não nesta fatia:** mudar default BE de 200→50 (opcional follow-up); virtualizer de lista.

**Aceite F2**

- [ ] Network: 1º GET `view=list&limit=50` (agregado)  
- [ ] Payload ≪ 1 MB  
- [ ] “Carregar mais” traz página seguinte sem apagar as 50  
- [ ] WS upsert ainda sobe conversa ao topo (TF5 orderedIds)

---

### Fatia 3 — FE coalescing — **P1 / ~0,25–0,5 dia**

Já existe:

- `loadInboxCommand` in-flight coalesce por key  
- `scheduleInvalidateFloatingChatAggregates` debounce 120 ms  

Reforçar:

| # | Mudança | Detalhe |
|---|---|---|
| 3.1 | Chat `loadConversations` | Não disparar se Store já tem rows **e** load &lt; N s (TTL leve, ex. 15–30 s) salvo force/manual refresh |
| 3.2 | WS `conversation.updated` | Preferir **patch Store** (já TF3.x); **não** `loadInbox` full; invalidar Float só se Store OFF |
| 3.3 | Subir debounce Float aggregates | 120 ms → **400–800 ms** em prod (ou env) |
| 3.4 | MinimizedChatDock | Bloquear loop `getConversations({ instanceId })` × N quando faltam ids — 1 agregado `limit=50`/`200` max |

**Aceite F3**

- [ ] Abrir Chat+Float: ≤1–2 GETs de lista em 5 s (sem storm)  
- [ ] Inbound msg: preview atualiza **sem** re-GET inbox completa  

---

## Fora de escopo (explicitamente)

- Unificar emits `new_message` / `message.created` (TF5 OOS)  
- Remoção Store OFF / MB-028  
- Paginação mensagens (já F6)  
- Redis cache de lista  
- Reescrever SQL do agregado  

---

## Protocolo

```
ok hotfix TF6
  → agente implementa fatias 1 (fail-safe) + 2 + 3
  → SPRINT_TF6_CLOSEOUT.md
  → usuário: (1) desliga flags no painel SE ainda ON
             (2) testa checklist abaixo
```

Ops pode desligar flags **antes** do deploy do código (ganho imediato).

---

## Checklist de teste (manual)

### Flags / shadow

1. SuperAdmin: shadow + dev log **OFF**.  
2. Abrir `/chat` → Network/server log: **zero** `shadow_compare`.  

### limit=50

3. 1º GET lista: `limit=50` (ou meta `returned ≤ 50`).  
4. Scroll / “Carregar mais” → mais conversas; as 50 iniciais permanecem.  
5. Conversa antiga recebe msg → sobe ao topo (Store).  

### Coalesce

6. Abrir Float com `/chat` aberto → sem rajada de GET lista.  
7. Receber 5 msgs rápidas → no máximo 1 invalidate/refetch de lista (ou nenhum se Store ON).  

---

## Artefatos

| Momento | Arquivo |
|---|---|
| Auditoria | `AUDIT_TF6_INBOX_LOAD_PRESSURE.md` |
| Plano (este) | `PLAN_TF6_INBOX_LOAD_HOTFIX.md` |
| Fecho | `SPRINT_TF6_CLOSEOUT.md` (ao implementar) |

---

## Estimativa

| Fatia | Tempo |
|---|---|
| F1 ops flag | minutos |
| F1 fail-safe BE | ~0,25 |
| F2 limit+load more | 0,5–1 |
| F3 coalesce | 0,25–0,5 |
| **Total** | **~1–1,5 dia** (+ ops imediato) |

---

## Assinatura

| | |
|---|---|
| Plano | **CLOSED** — ver [`SPRINT_TF6_CLOSEOUT.md`](./SPRINT_TF6_CLOSEOUT.md) |
| Predecessor | TF5 CLOSED (QA) + prod load fire |
| Prioridade | **P0** (estabilidade prod) |
