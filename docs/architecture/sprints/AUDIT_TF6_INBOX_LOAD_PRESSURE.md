# AUDIT_TF6 — Pressão de load da inbox (produção)

| Campo | Valor |
|---|---|
| **Documento** | Auditoria (pré-hotfix) |
| **Data** | 2026-07-15 |
| **Ambiente** | Produção — logs `CORRELATION` + `[chat-aggregated-dev]` |
| **Sintoma** | Excesso de requisições; sistema “trava” sob uso normal do chat |
| **Tipo** | Carga HTTP/SQL de listagem — NÃO bug de UI de bolha (TF5) |
| **Successor** | [`PLAN_TF6_INBOX_LOAD_HOTFIX.md`](./PLAN_TF6_INBOX_LOAD_HOTFIX.md) |

---

## Evidência (log produção)

### Padrão observado (~19:36:47–49Z)

| Sinal | Valor típico |
|---|---|
| `GET /api/chat/conversations?instanceId=…&inboxScope=tenant` | Repetido em ~1–2s |
| `GET …&channelOrigin=official` | Em paralelo |
| `aggregated_list` | `view: 'full'`, `rowCount: 200`, `payloadBytes: ~1.0–1.2e6`, `queryMs: ~0.9–2.2s` |
| `shadow_compare` / `shadow_divergence` | Após cada legado |
| Diff shadow | `idMismatch: true`, `orderMismatch: true` (mesmo top-20 ids — métrica barulhenta) |
| Poll leve | `notifications/unread-count`, `announcements`, `tickets/menu-count` |

### Custo por GET legado com shadow ON

```
Cliente GET legado (?instanceId=…)
  ├─ SQL legado ~1,1–1,8s + ~1,2 MB response
  └─ void runAggregatedShadowCompare(view=full, parityMode, limit 200)
        └─ SQL agregada ~0,9–2,2s + ~1 MB  ← NÃO serve a UI
```

**Fórmula prática:** 1 click/open com 2 instâncias × shadow ≈ **4 queries pesadas** (~1 MB cada) em segundos.

---

## Causa raiz (priorizada)

### P0 — Shadow de API agregada ligado em produção

| Item | Detalhe |
|---|---|
| Flag | `CHAT_AGGREGATED_API_SHADOW` (`isChatAggregatedApiShadowEnabled`) |
| Trigger | Todo `getConversations` legado em `chatController` (~L6778) |
| Extra | `CHAT_AGGREGATED_DEV_LOG` liga dumps enormes (`rowIds` ×200) |

Shadow é ferramenta de **migração F4**, não hot path de produto.

### P1 — Lista ainda via legado multi-`instanceId` + payload gordo

| Item | Detalhe |
|---|---|
| Path no log | `?instanceId=` (1 instância por request) + official separado |
| Fallback FE | `fetchMergedChatConversations` / MinimizedChatDock legado → N GETs |
| Repository “bom” | `listChatConversations` já pede `view: 'list'` — mas shadow força `full` |
| Limite | Default BE **200** (`request.ts`); FE muitas vezes **não passa** `limit` |

### P2 — Sem coalesce efetivo entre Chat + Float + invalidate

| Item | Detalhe |
|---|---|
| Domain Store | Memória pós-load; **não** impede novo GET no remount/invalidate |
| Chat page IDB warm | **OFF** quando Store ON |
| Float | `invalidateFloatingChatAggregates` / `scheduleInvalidate…` → refetch lista |
| WS | `conversation.updated` / deletes podem agendar invalidates → storm se shadow ON |

### P3 — Polling de badges (secundário)

Não explica queryMs de 2s; cortar depois.

---

## Resposta: o cache local evita GET/DB?

| Camada | Evita GET? |
|---|---|
| Domain Store (mem) | Só após hydrate; open/sync/invalidate **volta a pedir** |
| IndexedDB page cache | Desligado com Store ON |
| React Query Float (`staleTime` 3 min) | Ajuda Float, mas invalidate zera o benefício |
| Redis / cache BE da lista | **Não existe** |

**Conclusão:** não há cache que proteja o Postgres neste fluxo. Shadow multiplica o dano.

---

## Hipóteses descartadas neste audit

| Hipótese | Por quê |
|---|---|
| Só notifications polling | Leve vs 1–2s SQL |
| TF5 dedupe de msg | Não dispara GET lista |
| Bug de ordem TF5 B | Sintoma diferente (UI shuffle) |

---

## Melhorias (ranking)

| # | Ação | Impacto | Esforço | Deploy |
|---|---|---|---|---|
| 1 | **OFF** `CHAT_AGGREGATED_API_SHADOW` (+ DEV_LOG) em prod | −50% SQL lista | Flag painel | Imediato |
| 2 | FE: `limit=50` + cursor “carregar mais” | −75% payload/SQL 1ª página | Médio | Deploy FE(+BE ok) |
| 3 | FE: coalesce `loadInbox` / invalidates Float | Menos storms | Baixo–médio | Deploy FE |
| 4 | Garantir superfícies em agregada `apiVersion=2` | Menos N× instanceId | Flag / FE | Flag |
| 5 | Remover/sample shadow no código (fail-safe) | Defense in depth | Baixo | Deploy BE |

---

## Critérios de sucesso (pós-hotfix)

- [ ] Log prod **sem** `shadow_compare` / `shadow_divergence` no caminho quente.
- [ ] Open `/chat`: **1** GET agregado `view=list&limit=50` (não N× instanceId + shadow).
- [ ] Payload 1ª página ≪ 1 MB (ordem ~200–400 KB ou menos).
- [ ] Mensagens WS atualizam preview/At via Store **sem** rehidratar inbox completa.

---

## Próximo

Ver plano: [`PLAN_TF6_INBOX_LOAD_HOTFIX.md`](./PLAN_TF6_INBOX_LOAD_HOTFIX.md)  
Comando: `ok hotfix TF6`
