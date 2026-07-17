# SPRINT_TF7_E4_CLOSEOUT — Harden / Float parity / observabilidade

| Campo | Valor |
|---|---|
| **Sprint** | TF7 · Etapa 4 (opcional) |
| **Gate** | **CLOSED** (aguardando QA) |
| **Plano** | [`PLAN_TF7_WARM_STORE_CACHE.md`](./PLAN_TF7_WARM_STORE_CACHE.md) |
| **Predecessor** | [`SPRINT_TF7_E3_CLOSEOUT.md`](./SPRINT_TF7_E3_CLOSEOUT.md) |
| **Fecho global** | [`SPRINT_TF7_CLOSEOUT.md`](./SPRINT_TF7_CLOSEOUT.md) |
| **Data** | 2026-07-16 |
| **Comando** | `ok etapa 4` |

---

## Resumo da entrega

Float passa a usar o **mesmo contrato** warm → freshness → mirror → force do Chat. Observabilidade DEV: `inbox_warm_hit` / `inbox_fetch_skipped_fresh` / `inbox_fetch_network`. Cap de mirror **50** confirmado. Chat e Float alinham `filtersKey` via `buildDefaultChatPageInboxFiltersKey`.

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `useFloatingConversationListData` | Warm + `markInboxFreshFromClient` + mirror pós-GET + `refreshInbox` |
| Float UI | Botão Refresh no `FloatingChatListShell` |
| `buildDefaultChatPageInboxFiltersKey` | Chave compartilhada Chat↔Float (defaults) |
| Chat | Usa o helper (mesma forma de chave) |
| `inboxCacheDiag.ts` | `logInboxCacheEvent` + `markChatPerf` em warm/skip |
| Cap | `INBOX_PAGE_CACHE_MIRROR_MAX = 50` (E3; validado E4) |
| Testes | `store.tf7.e4-float-parity.test.ts` (4) — OK |

---

## Diag (DEV)

Ativar com `DEV`, `VITE_CHAT_LIST_DIAG=1` ou `VITE_CHAT_PERF=1`:

- `[inbox-cache] inbox_warm_hit`
- `[inbox-cache] inbox_fetch_skipped_fresh`
- `[inbox-cache] inbox_fetch_network`
- `[chat-perf] inbox_warm_hit` / `inbox_fetch_skipped_fresh`

---

## Checklist de teste (manual)

1. Abrir `/chat` (filtros default) → abrir Float → **sem** 2º GET lista.  
2. Float só (Store vazio) com cache disk → warm + possível skip.  
3. Botão refresh no Float → force GET.  
4. Console DEV: eventos `inbox_*` ao abrir/skip.  
5. Cap: cache local ≤ 50 conversas.

---

## TF7 completo

E1–E4 entregues. Ver checklist unificado em [`SPRINT_TF7_CLOSEOUT.md`](./SPRINT_TF7_CLOSEOUT.md).
