# PLAN_TF7_WARM_STORE_CACHE — Warm Store + TTL longo + force sync

| Campo | Valor |
|---|---|
| **Documento** | Plano por etapas (sprints TF7) |
| **Data** | 2026-07-15 |
| **Auditoria** | [`AUDIT_TF7_WARM_STORE_CACHE.md`](./AUDIT_TF7_WARM_STORE_CACHE.md) |
| **Tipo** | Hotfix incremental — **uma etapa testável por comando** |
| **Backend SQL/schema / Socket protocol / ADR** | **NÃO alterar** |
| **Predecessor** | TF6 CLOSED ([`SPRINT_TF6_CLOSEOUT.md`](./SPRINT_TF6_CLOSEOUT.md)) |

---

## Objetivo

Evitar GET de inbox **sempre** que o usuário entra no chat quando os dados **já estão** no cliente:

1. **Warm** — hidratar Domain Store a partir do cache local (`chatPageCache`) **com Store ON**
2. **TTL longo** — pular / adiar `loadInbox` se Store já tem rows e o snapshot está fresco (WS mantém fresco)
3. **Force sync** — caminho explícito para limpar cache + refetch (reload tratado como force quando acordado)

Precedência permanece: **Domain Store = SoT**; disco = **warm apenas** (ADR / `cachePrecedence`).

---

## Protocolo (como usar)

```
ok etapa 1   → agente implementa Etapa 1 + SPRINT_TF7_E1_CLOSEOUT.md
você testa checklist E1
ok etapa 2   → idem E2 + closeout
ok etapa 3   → idem E3 + closeout
(opcional) ok etapa 4 → harden / Float parity / polish + closeout TF7
```

Alias aceitos (mesmo efeito):

- `ok sprint TF7.1` ≡ `ok etapa 1`
- `ok hotfix TF7` **não** implementa tudo de uma vez — aponta para este plano e pede `ok etapa 1`

Ao final de **cada** etapa o agente entrega **só** o closeout da etapa (resumo do que mudou + checklist).  
Fecho global TF7: após E3 (ou E4) OK → marcar plano **CLOSED** + linha no índice Thread Surface.

---

## Etapas (ordem fixa)

### Etapa 1 — Warm Store a partir do `chatPageCache` — **P0**

**Comando:** `ok etapa 1`

**Problema:** `Chat.tsx` faz `if (isChatStoreSourceOfTruth()) return` e nunca hidrata do localStorage com Store ON.

| # | Mudança | Onde (orientação) |
|---|---|---|
| 1.1 | Remover / condicionar early-return: com Store ON, **ler** `readChatPageCache` se filtersKey bate | `Chat.tsx` (+ helper opcional em chat-core) |
| 1.2 | Aplicar conversas no Domain Store (`conversations/set` ou `applyStoreConversationList`) **antes** do 1º paint útil | Store API existente |
| 1.3 | Opcional: hidratar msgs da última conversa se `readChatPageMessages` tiver dados | Mesmo escopo Chat |
| 1.4 | **Ainda disparar** `loadInbox` em background nesta etapa (não skip ainda) — warm só acelera UX | Sem muda TTL longo ainda |
| 1.5 | Teste unitário: Store ON + cache presente → Store recebe rows sem await de rede | `store.tf7*.test.ts` ou equivalente |

**Não nesta etapa:** skip de GET; TTL longo; espelho WS→disk; UI de “Limpar cache”.

**Aceite E1**

- [ ] Com cache preenchido, abrir `/chat` (F5): lista aparece **antes** (ou junto) do GET completar
- [ ] Network: ainda há 1 GET agregada (normal nesta etapa)
- [ ] Sem regressão Store OFF (path legado continua warm)
- [ ] filtersKey diferente → não aplica warm cruzado

**Closeout:** [`SPRINT_TF7_E1_CLOSEOUT.md`](./SPRINT_TF7_E1_CLOSEOUT.md) *(criado ao fechar a etapa)*

---

### Etapa 2 — TTL longo + skip GET quando fresco — **P0**

**Comando:** `ok etapa 2`  
**Depende:** E1 OK (warm funciona)

| # | Mudança | Detalhe |
|---|---|---|
| 2.1 | Constante freshness (ex. `INBOX_FRESH_TTL_MS = 5 * 60_000`) | chat-core (`loadInbox.ts` / flags) — **separada** do coalesce 20s |
| 2.2 | Persistir `hydratedAt` / `lastInboxLoadAt` no Store (ou módulo load) após GET OK | Memória + opcional no `chatPageCache.updatedAt` |
| 2.3 | `loadInboxCommand({ force })`: se `!force` e Store tem rows e `now - lastLoad < FRESH_TTL` → **return cached / no-op rede** | Core |
| 2.4 | Política WS: se socket **connected**, preferir skip; se **disconnected**, opcional encurtar TTL ou force soft | Documentar regra no closeout |
| 2.5 | Float/Chat open: não forçar 2º GET se E2 já marcou fresco | Reuso TF6 coalesce |
| 2.6 | Testes: skip quando fresco; sempre fetch com `force: true` | `store.tf7*.test.ts` |

**Não nesta etapa:** botão UI force; espelho contínuo WS→localStorage (E3).

**Aceite E2**

- [ ] Abrir `/chat`, navegar spa, voltar em &lt; TTL → **sem** novo GET `view=list` (ou só se force)
- [ ] `force: true` / sync manual (se já existir API) → sempre GET
- [ ] Após TTL expirar → 1 GET normal
- [ ] Inbound msg com Store ON → continua patch WS **sem** GET lista

**Closeout:** [`SPRINT_TF7_E2_CLOSEOUT.md`](./SPRINT_TF7_E2_CLOSEOUT.md)

---

### Etapa 3 — Espelho cache + force sync manual — **P1**

**Comando:** `ok etapa 3`  
**Depende:** E2 OK

| # | Mudança | Detalhe |
|---|---|---|
| 3.1 | Após hydrate GET e após patches relevantes, `saveChatPageConversations` / msgs **também com Store ON** | Chat (+ ponto único se Float espelhar lista) |
| 3.2 | API `forceReloadInbox()` / flag no comando existente + limpar freshness | chat-core |
| 3.3 | UI: ação “Atualizar” / refresh na inbox Chat (e Float se trivial) chama force | Evitar só depender de F5 mental |
| 3.4 | `clearChatPageCacheForSession` no force (ou opção “Limpar cache”) + reload Store da rede | `chatPageCache.ts` já tem clear |
| 3.5 | Documentar: **Ctrl+R** = reload app (Store some) → warm E1 + se freshness do disk &lt; TTL pode skip E2; **hard clear** = clear storage + force GET | Closeout |
| 3.6 | Testes: force limpa freshness; save chamado no path Store ON | unit |

**Aceite E3**

- [ ] Após sessão com msgs WS, F5: warm mostra lista atualizada do disk (último espelho)
- [ ] Botão/ação Atualizar → GET + rewrite cache
- [ ] “Limpar cache” (se exposto) → lista só após rede
- [ ] Sem promover localStorage a SoT (Store continua dono da UI)

**Closeout:** [`SPRINT_TF7_E3_CLOSEOUT.md`](./SPRINT_TF7_E3_CLOSEOUT.md)

---

### Etapa 4 (opcional) — Harden / Float parity / observabilidade — **P2**

**Comando:** `ok etapa 4`

| # | Mudança | Detalhe |
|---|---|---|
| 4.1 | Warm + freshness também no Float open (mesmo contrato) | `useFloatingConversationListData` / loadInbox |
| 4.2 | DevLog / markChatPerf: `inbox_warm_hit` / `inbox_fetch_skipped_fresh` | debug só |
| 4.3 | Cap explícito: só persistir top-N (= page size 50) no cache | evitar localStorage inchado |
| 4.4 | Closeout **global** TF7 + checklist QA unificado | `SPRINT_TF7_CLOSEOUT.md` |

**Aceite E4**

- [ ] Float e Chat compartilham política warm/fresh/force
- [ ] Plano TF7 marcado CLOSED no índice Thread Surface

**Closeout:** [`SPRINT_TF7_E4_CLOSEOUT.md`](./SPRINT_TF7_E4_CLOSEOUT.md) + [`SPRINT_TF7_CLOSEOUT.md`](./SPRINT_TF7_CLOSEOUT.md)

> Se E3 já cobrir Float mínimo e QA estiver OK, **E4 pode ser skip** — fechar TF7 após E3 com `SPRINT_TF7_CLOSEOUT.md` curto.

---

## Fora de escopo (explicitamente)

| Item | Motivo |
|---|---|
| IndexedDB como SoT | ADR / `shouldIndexedDbActAsSourceOfTruth() === false` |
| MB-028 remoção Store OFF | Tracker separado |
| Deduplicar `operations-dashboard` | Candidato **TF8** |
| Cap warmup N× `/messages` | Pode ser TF8 / polish; não bloqueia warm de lista |
| Redis / SQL agregado | TF6 já cortou pressão; não reabrir |
| Unificar emits WS | OOS TF5 |
| Persistência draft/selection (stubs F5.0) | Só se incidental; não é inbox |

---

## Checklist QA (após E3 ou E4)

1. Cache frio (storage limpo) → 1 GET `view=list&limit=50` → lista OK → cache gravado.  
2. F5 imediato → paint warm → **sem** GET se dentro do FRESH_TTL (E2+).  
3. Receber msg WhatsApp → preview/topo via WS; sem GET lista.  
4. Aguardar &gt; FRESH_TTL → próximo open faz 1 GET.  
5. “Atualizar” / force → GET mesmo dentro do TTL; cache reescrito.  
6. Trocar filtros (fila/groups) → filtersKey diferente → sem warm cruzado; GET novo.  
7. Store OFF (se testável) → sem regressão do warm legado.

---

## Artefatos

| Momento | Arquivo | Status inicial |
|---|---|---|
| Auditoria | `AUDIT_TF7_WARM_STORE_CACHE.md` | **DONE** |
| Plano (este) | `PLAN_TF7_WARM_STORE_CACHE.md` | **ATIVO** |
| Closeout E1 | [`SPRINT_TF7_E1_CLOSEOUT.md`](./SPRINT_TF7_E1_CLOSEOUT.md) | **CLOSED** (aguarda QA) |
| Closeout E2 | [`SPRINT_TF7_E2_CLOSEOUT.md`](./SPRINT_TF7_E2_CLOSEOUT.md) | **CLOSED** (aguarda QA) |
| Closeout E3 | [`SPRINT_TF7_E3_CLOSEOUT.md`](./SPRINT_TF7_E3_CLOSEOUT.md) | **CLOSED** (aguarda QA) |
| Closeout E4 / global | [`SPRINT_TF7_E4_CLOSEOUT.md`](./SPRINT_TF7_E4_CLOSEOUT.md) / [`SPRINT_TF7_CLOSEOUT.md`](./SPRINT_TF7_CLOSEOUT.md) | **CLOSED** (E1–E4) |

---

## Estimativa

| Etapa | Tempo |
|---|---|
| E1 Warm Store | ~0,25–0,5 dia |
| E2 TTL longo / skip | ~0,25–0,5 dia |
| E3 Espelho + force UI | ~0,5 dia |
| E4 Harden (opc.) | ~0,25 dia |
| **Total** | **~1–1,5 dia** (+ E4) |

---

## Assinatura

| | |
|---|---|
| Plano | **CLOSED** (E1–E4) — ver [`SPRINT_TF7_CLOSEOUT.md`](./SPRINT_TF7_CLOSEOUT.md) |
| Predecessor | TF6 (inbox load pressure) |
| Prioridade | **P0/P1** (UX + menos hits ao banco) |
| Próximo comando | **QA unificado TF7** |
