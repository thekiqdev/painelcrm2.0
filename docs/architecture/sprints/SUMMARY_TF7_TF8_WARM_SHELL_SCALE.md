# SUMMARY — TF7 + TF8 · Warm Store + Shell load (escala F5)

| Campo | Valor |
|---|---|
| **Documento** | Resumo executivo / consulta futura |
| **Sprints** | TF7 (Warm Store) + TF8 (Shell load) |
| **Predecessor** | TF6 (inbox pressure: `limit=50`, shadow fail-safe, coalesce) |
| **Índice Thread Surface** | [`PLAN_CHAT_THREAD_SURFACE_FIXES.md`](./PLAN_CHAT_THREAD_SURFACE_FIXES.md) |
| **Branch típica** | `feature/chat-tf7-tf8-warm-shell-scale` |
| **Data** | 2026-07-16 / 2026-07-17 |
| **Estado** | **CLOSED** (código + QA F5; residual polish opcional) |

---

## Porquê

Com Domain Store ON, o warm de lista no `localStorage` estava desligado → **F5 sempre GET**.  
Mesmo após TF6/TF7, o F5 ainda gerava **storm residual**: dashboard ×N, badges ×5, warmup `/messages` ×5, tags/categories repetidos.

Meta produto: escala tipo chat enterprise (1000+ operadores) — **paint local → WS → reconcile raro**; shell com **TTL / single-flight**.

---

## TF7 — Warm Store + TTL + force

**Planos:** [`PLAN_TF7_WARM_STORE_CACHE.md`](./PLAN_TF7_WARM_STORE_CACHE.md) · [`AUDIT_TF7_WARM_STORE_CACHE.md`](./AUDIT_TF7_WARM_STORE_CACHE.md)  
**Closeout:** [`SPRINT_TF7_CLOSEOUT.md`](./SPRINT_TF7_CLOSEOUT.md)

| Etapa | Entrega | Closeout |
|---|---|---|
| E1 | `warmInboxFromPageCache` — seed Store do disk com Store ON | [`E1`](./SPRINT_TF7_E1_CLOSEOUT.md) |
| E2 | `INBOX_FRESH_TTL_MS` 5 min (WS up) / 30 s (down); skip GET; Chat+Float partilham freshness | [`E2`](./SPRINT_TF7_E2_CLOSEOUT.md) |
| E3 | Espelho Store→disk (`inboxPageCacheMirror`); `forceReloadInboxCommand`; refresh no menu filtro | [`E3`](./SPRINT_TF7_E3_CLOSEOUT.md) |
| E4 | Float parity + `buildDefaultChatPageInboxFiltersKey` + diag `inboxCacheDiag` | [`E4`](./SPRINT_TF7_E4_CLOSEOUT.md) |

### Modelo mental TF7

```
Abrir /chat ou Float
  → warm localStorage → Domain Store
  → se fresco → sem GET lista
  → WS patches → Store + espelho disk
  → “Atualizar lista” → force GET
```

### Ficheiros-chave TF7

- `src/features/chat-core/core/warmInboxFromPageCache.ts`
- `src/features/chat-core/core/loadInbox.ts` (TTL / freshness / soft reconcile hooks TF8)
- `src/features/chat-core/core/inboxPageCacheMirror.ts`
- `src/features/chat-core/core/inboxCacheDiag.ts`
- `src/lib/chatPageCache.ts`
- `src/pages/Chat.tsx` · `useFloatingConversationListData.ts`

---

## TF8 — Shell load / escala F5

**Planos:** [`PLAN_TF8_SHELL_LOAD_SCALE.md`](./PLAN_TF8_SHELL_LOAD_SCALE.md) · [`AUDIT_TF8_SHELL_LOAD_SCALE.md`](./AUDIT_TF8_SHELL_LOAD_SCALE.md)  
**Preflight (regra de ouro):** [`AUDIT_TF8_PREFLIGHT_RISKS.md`](./AUDIT_TF8_PREFLIGHT_RISKS.md) — skip F5 ≠ nunca GET; após seed+skip com WS down → **1× soft reconcile** quando WS conectar.  
**Closeout:** [`SPRINT_TF8_CLOSEOUT.md`](./SPRINT_TF8_CLOSEOUT.md)

| Etapa | Entrega | Closeout |
|---|---|---|
| E1 | Seed disk TTL 5 min independente de WS + soft reconcile no connect | [`E1`](./SPRINT_TF8_E1_CLOSEOUT.md) |
| E2 | `operations-dashboard` single-flight + TTL 60 s (`tenant:user`) | [`E2`](./SPRINT_TF8_E2_CLOSEOUT.md) |
| E3 | Cap warmup `/messages` **5→2**; selected owned by open; rAF×2 + idle | [`E3`](./SPRINT_TF8_E3_CLOSEOUT.md) |
| E4 | Shell polls (badges/tags/categories) single-flight + TTL + debounce; bubble prefer Store | [`E4`](./SPRINT_TF8_E4_CLOSEOUT.md) |

### Modelo mental TF8

```
F5
  → warm + seed freshness (mesmo WS down, disk < 5 min)
  → skip GET inbox no boot
  → WS connect → ≤1 GET force (soft reconcile)
  → dashboard / badges / tags: 1 voo + TTL
  → warmup msgs: ≤2 (open + 0–1 vizinho)
  → bubble: Store / freshness / join inbox antes de limit=4
```

### Ficheiros-chave TF8

- Soft reconcile: `loadInbox.ts` · `bridge.ts` · Chat + Float
- Dashboard: `src/services/operationsDashboardHttpCache.ts`
- Warmup: `warmWindow.ts` · `predictivePrefetch.ts`
- Shell polls: `shellHttpSoftCache.ts` · `shellPollHttpCaches.ts` · `tickets.ts` · `systemNotifications.ts` · `chatKanban.ts`
- Hooks: `useTicketMenuCount.ts` · `useInAppNotificationBadges.ts`
- Bubble: `resolveBubbleRecent.ts` · `FloatingChatWidget.tsx`
- Logout limpa caches: `src/lib/queryClient.ts`

---

## Resultado QA F5 (evidência)

| Endpoint | Antes (ordem) | Depois TF7+TF8 |
|---|---|---|
| Inbox `limit=50` no boot | quase sempre | skip + ≤1 soft reconcile |
| `operations-dashboard` | ×3–6 | **1×** |
| `/messages` warmup | ×5 | **≤2** |
| `tickets/menu-count` | ×~5 | **1×** |
| `notifications/unread-count` | ×~5 | **1×** |
| `ticket-categories` / `kanban/tags` | vários | **1×** cada |

### Residual conhecido (polish opcional, não blocker)

| Item | Nota |
|---|---|
| Bubble `limit=4` paralelo ao `limit=50` no F5 frio | Race: bubble consulta in-flight antes do registo |
| `attendance-counts` ×2 | Nav + Chat; dedupe in-flight não cobre sequencial |
| `mine` / `unreadOnly` | Filtros auxiliares |
| `auth/me` ×2 | Bootstrap OOS |

---

## Testes

| Área | Ficheiros |
|---|---|
| TF7 | `store.tf7.e1-warm-cache.test.ts` … `e4-float-parity.test.ts` |
| TF8 | `store.tf8.e1-f5-soft-reconcile.test.ts` · `e3-warmup-cap` · `e4-shell-bubble` |
| Caches HTTP | `operationsDashboardHttpCache.test.ts` · `shellHttpSoftCache.test.ts` |

---

## Como navegar a documentação

1. **Este SUMMARY** — mapa e decisão rápida.  
2. **Índice Thread Surface** — estado de todos os TF.  
3. **PLAN / AUDIT** por sprint — escopo e riscos.  
4. **SPRINT_*_CLOSEOUT** — o que entrou em cada etapa.  
5. **Código** — ficheiros-chave acima.

---

## Próximos passos sugeridos (fora deste pacote)

1. Polish curto: coalescer `attendance-counts` + fix race bubble/`limit=50`.  
2. Auth/me dedupe (se trivial).  
3. MB-028 remoção Store OFF (tracker separado).  
4. Infra: Redis / SQL agregado (TF futuro).
