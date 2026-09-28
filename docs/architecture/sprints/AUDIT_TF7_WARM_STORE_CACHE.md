# AUDIT_TF7 — Warm Store + cache local (pós-TF6)

| Campo | Valor |
|---|---|
| **Documento** | Auditoria / gap analysis |
| **Data** | 2026-07-15 |
| **Predecessor** | [`SPRINT_TF6_CLOSEOUT.md`](./SPRINT_TF6_CLOSEOUT.md) |
| **Successor** | [`PLAN_TF7_WARM_STORE_CACHE.md`](./PLAN_TF7_WARM_STORE_CACHE.md) |
| **Tipo** | UX + performance FE (sem mudança SQL/schema) |

---

## Problema

Com `CHAT_CORE_STORE` ON (prod canary):

1. **Domain Store é só memória** — F5 / reabrir `/chat` → Store vazio → `loadInbox` → GET agregada de novo.
2. **Warm `localStorage` (`chatPageCache`) existe**, mas no Chat está **desligado** quando Store é SoT:

```ts
// Chat.tsx — early return
if (isChatStoreSourceOfTruth()) return;
```

3. TTL TF6 (`INBOX_LOAD_TTL_MS = 20s`) só coalescia a **mesma sessão** por poucos segundos — não cobre “já tenho essa informação”.
4. Persistência do Domain Store (`persistence.ts`) ainda é **stub** (draft/selection) — **não** grava inbox.
5. Precedência oficial: Store → RQ → IndexedDB/local **só warm**, nunca SoT — alinhar warm **sob** o Store, sem promover disco a SoT.

---

## Evidência / comportamento desejado (produto)

> Guardar conversas em cache local; atualizar via WebSocket; só forçar rede no sync manual / limpar cache (Ctrl+R tratado como force, se acordado).

Modelo alvo: **stale-while-revalidate**

```
Abrir /chat
  → paint do cache local → Domain Store
  → se fresco + (WS up opcional) → sem GET inbox
  → WS patches → Store (+ espelho no cache)
  → force / limpar cache → GET + rewrite local
```

---

## O que já existe (reuso)

| Artefato | Papel |
|---|---|
| `src/lib/chatPageCache.ts` | `localStorage` por `tenantId:userId`, filtersKey, conversas + msgs (máx ~80/conv), TTL 7 dias |
| `readChatPageCache` / `saveChatPageConversations` / `saveChatPageMessages` | API estável — usada no path Store **OFF** |
| `applyStoreConversationList` / `conversations/set` | Hidratar Store após fetch |
| `loadInboxCommand` + TTL 20s | Coalesce in-flight / short window |
| WS Store ON | Patch sem re-GET lista (TF3.x–TF6) |
| `cachePrecedence.ts` | IDB/local **nunca** SoT |

---

## Gaps (TF7)

| # | Gap | Impacto |
|---|---|---|
| G1 | Warm desligado com Store ON | Toda entrada no chat → GET lista |
| G2 | TTL curto (20s) | Remount / navegação SPA após 20s → GET de novo |
| G3 | Cache não espelha WS continuamente (path Store ON) | Warm fica stale entre visits |
| G4 | Sem “force sync” explícito documentado na UI | Usuário não tem caminho claro para limpar + refetch |
| G5 | (OOS desta auditoria) `operations-dashboard` ×N | Ruído de rede separado — TF8 se necessário |

---

## Riscos se warm mal feito

| Risco | Mitigação no plano |
|---|---|
| Lista 1–2s desatualizada | Aceitar SWR; opcional badge “sincronizando” |
| Missed events offline | Reconcile no reconnect / TTL máximo absoluto |
| Cache de outro user | Já scoped `tenant:user` |
| Quota storage | Cap já existente + só top page (50) |
| filtersKey mismatch | Só warm se filtersKey bate |

---

## Conclusão

**TF7** = reativar warm **sob** Domain Store + TTL longo de “freshness” + force no sync manual — sem promover disco a SoT, sem tocar SQL do agregado, sem MB-028.

Ver plano: [`PLAN_TF7_WARM_STORE_CACHE.md`](./PLAN_TF7_WARM_STORE_CACHE.md)  
Comando de início: `ok etapa 1`
