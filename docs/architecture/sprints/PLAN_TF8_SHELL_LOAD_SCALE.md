# PLAN_TF8_SHELL_LOAD_SCALE — F5 residual + shell QPS (escala 1000+)

| Campo | Valor |
|---|---|
| **Documento** | Plano por etapas (sprints TF8) |
| **Data** | 2026-07-16 |
| **Auditoria gaps** | [`AUDIT_TF8_SHELL_LOAD_SCALE.md`](./AUDIT_TF8_SHELL_LOAD_SCALE.md) |
| **Preflight riscos** | [`AUDIT_TF8_PREFLIGHT_RISKS.md`](./AUDIT_TF8_PREFLIGHT_RISKS.md) |
| **Tipo** | Hotfix incremental — **uma etapa testável por comando** |
| **Backend SQL/schema / Socket protocol / ADR** | **NÃO alterar** (salvo fail-safe/TTL FE óbvio) |
| **Predecessor** | TF7 CLOSED ([`SPRINT_TF7_CLOSEOUT.md`](./SPRINT_TF7_CLOSEOUT.md)) |
| **Meta** | F5 “leve”; shell sem storm; caminho tipo chat enterprise |

---

## Regra de ouro (obrigatória)

```
Boot / F5:
  → warm disk + skip GET se updatedAt < 5 min (mesmo com WS down no instante do reload)
Assim que WS conectar (primeira vez após esse skip):
  → soft reconcile = 1× loadInbox({ force: true })
```

**Skip no F5 ≠ nunca mais falar com o servidor.**  
Sem reconcile no reconnect → risco de inbox fantasma (missed events).  
Se o WS **já** estiver connected no momento do seed (SPA), **não** forçar GET imediato — TTL de sessão cobre.

---

## Objetivo

1. **Skip inbox no F5** mesmo durante reconnect WS (seed disk com TTL 5 min)
2. **Soft reconcile** quando o realtime conectar após esse skip
3. **`operations-dashboard` 1×** por janela (E2)
4. **Cap warmup** de `/messages` (E3)
5. **Coalesce/TTL** nos polls do shell (E4)

---

## Protocolo

```
ok etapa 1   → E1 + SPRINT_TF8_E1_CLOSEOUT.md
ok etapa 2   → E2 + closeout
ok etapa 3   → E3 + closeout
ok etapa 4   → E4 + closeout (+ SPRINT_TF8_CLOSEOUT.md global)
```

---

## Etapas (ordem fixa)

### Etapa 1 — F5 inbox skip + soft reconcile WS — **P0**

**Comando:** `ok etapa 1`

**Problema:** No F5 o WS desconecta; `INBOX_FRESH_TTL_DISCONNECTED_MS = 30s` faz o seed do disk falhar → GET `limit=50` de novo.  
**Risco:** skip longo sem reconcile → lista stale (ver preflight).

| # | Mudança | Detalhe |
|---|---|---|
| 1.1 | Seed disk usa TTL **longo** (`INBOX_FRESH_TTL_MS` = 5 min) | `markInboxFreshFromClient` **não** usa TTL disconnected |
| 1.2 | Sessão: `getEffectiveInboxFreshTtlMs()` inalterado | 5 min se WS up / 30 s se down (revalidate em sessão) |
| 1.3 | Soft reconcile | Após seed+skip com WS down → agendar 1× `force` no `bridge` connected |
| 1.4 | Se WS já connected no seed | **Não** agendar force (evita GET em toda navegação SPA) |
| 1.5 | Diag | `inbox_fetch_skipped_fresh` + `reason`; `inbox_soft_reconcile` |
| 1.6 | Testes | Disk &lt; 5 min + WS down → skip; depois “connect” → 1 force |

**Não nesta etapa:** dashboard, warmup msgs, badges.

**Aceite E1**

- [ ] F5 em &lt; 5 min: **sem** GET `limit=50` no boot (warm+skip), mesmo com WS ainda subindo
- [ ] Após WS connect: **no máximo 1** GET `limit=50` (soft reconcile)
- [ ] `force` / “Atualizar lista” → GET imediato
- [ ] Console: `inbox_warm_hit` / `inbox_fetch_skipped_fresh` / `inbox_soft_reconcile`

**Closeout:** `SPRINT_TF8_E1_CLOSEOUT.md`

---

### Etapa 2 — `operations-dashboard` single-flight + TTL — **P0** — **CLOSED**

**Comando:** `ok etapa 2`

| # | Mudança | Detalhe |
|---|---|---|
| 2.1 | Module/cache FE | Promise in-flight + `lastAt` (**60 s** stale) |
| 2.2 | Callers via helper | Chat / OperationalPanel / Settings (`chatService`) |
| 2.3 | Cache keyed | `tenantId:userId` via `getActiveChatCacheSession` |
| 2.4 | Testes | 3 calls simultâneas → 1 HTTP |

**Aceite E2**

- [x] F5: **≤1** GET `operations-dashboard` em ~5 s (código; QA manual)
- [x] Remount imediato: cache hit

**Closeout:** [`SPRINT_TF8_E2_CLOSEOUT.md`](./SPRINT_TF8_E2_CLOSEOUT.md)

---

### Etapa 3 — Cap warmup de mensagens — **P1** — **CLOSED**

**Comando:** `ok etapa 3`

| # | Mudança | Onde |
|---|---|---|
| 3.1 | Cap `useConversationWarmup` | Máx **2** (`DEFAULT_WARM_CONVERSATION_COUNT`) |
| 3.2 | Skip se msgs já no Store | `isConversationAlreadyWarm`; selected owned by open |
| 3.3 | Idle / rAF | rAF×2 + idle (5s / 1.6s) |
| 3.4 | Testes | Cap + skip |

**Aceite E3**

- [x] Abrir `/chat`: ≤2 GETs messages de warmup (+ rota aberta se houver) (código; QA manual)
- [x] Open da conversa selecionada intacto

**Closeout:** [`SPRINT_TF8_E3_CLOSEOUT.md`](./SPRINT_TF8_E3_CLOSEOUT.md)

---

### Etapa 4 — Shell polls coalesce + bubble parity — **P1** — **CLOSED**

**Comando:** `ok etapa 4`

| # | Mudança | Detalhe |
|---|---|---|
| 4.1 | Single-flight / staleTime | tickets / notifications / kanban tags / categories |
| 4.2 | Double-mount | 1 request em voo por chave + debounce badges |
| 4.3 | Bubble `limit=4` | Preferir Store / freshness / join inbox |
| 4.4 | Closeout global | `SPRINT_TF8_CLOSEOUT.md` |

**Aceite E4**

- [x] F5: badges ≤1–2× cada (código; QA manual)
- [x] Bubble não força 2º `limit=50`
- [x] Plano TF8 CLOSED no índice

**Closeout:** [`SPRINT_TF8_E4_CLOSEOUT.md`](./SPRINT_TF8_E4_CLOSEOUT.md) + [`SPRINT_TF8_CLOSEOUT.md`](./SPRINT_TF8_CLOSEOUT.md)

---

## Fora de escopo

| Item | Motivo |
|---|---|
| MB-028 remoção Store OFF | Tracker separado |
| Redis / SQL agregado | Infra / TF futuro |
| Unificar emits WS | OOS TF5 |
| IndexedDB como SoT | ADR |
| Auth/me dedupe profundo | Só se trivial em E4 |

---

## Checklist QA (após E4)

1. F5 &lt; 5 min: zero GET inbox no **boot**; ≤1 GET após WS connect (reconcile).  
2. F5: ≤1 `operations-dashboard`.  
3. F5: ≤2 GETs messages de warmup.  
4. Badges: sem storm.  
5. Msg inbound: WS, sem GET lista.  
6. “Atualizar lista”: force GET ok.  
7. Comparar log F5 antes/depois.

---

## Artefatos

| Momento | Arquivo | Status |
|---|---|---|
| Auditoria gaps | `AUDIT_TF8_SHELL_LOAD_SCALE.md` | **DONE** |
| Preflight riscos | `AUDIT_TF8_PREFLIGHT_RISKS.md` | **DONE** |
| Plano (este) | `PLAN_TF8_SHELL_LOAD_SCALE.md` | **ATIVO** |
| Closeout E1 | [`SPRINT_TF8_E1_CLOSEOUT.md`](./SPRINT_TF8_E1_CLOSEOUT.md) | **CLOSED** (aguarda QA) |
| Closeout E2–E4 / global | … | pending |

---

## Estimativa

| Etapa | Tempo |
|---|---|
| E1 F5 skip + soft reconcile | ~0,25–0,5 dia |
| E2 operations-dashboard | ~0,25–0,5 dia |
| E3 warmup msgs | ~0,25 dia |
| E4 shell polls + bubble | ~0,5 dia |
| **Total** | **~1–1,5 dia** |

---

## Assinatura

| | |
|---|---|
| Plano | **ATIVO** — E1 CLOSED; aguarda `ok etapa 2` |
| Predecessor | TF7 (warm Store) |
| Prioridade | **P0** |
| Preflight | Incorporado (regra de ouro + soft reconcile) |
| Próximo comando | **`ok etapa 2`** (após QA E1) |
