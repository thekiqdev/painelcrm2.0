# AUDIT_RUNTIME_DIVERGENCES — AUD-007 / AUD-009

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |
| **Base doc** | `PHASE9_RUNTIME_FLOW.md` + critérios Phase 9 |

---

## AUD-007 — Runtime Flow vs implementação

| Item do fluxo / aceite Phase 9 | Status | Evidência |
|---|---|---|
| Login → bootstrap HTTP → Store → Socket → eventos → UI | **IMPLEMENTADO** | `bootstrapChatF3Session`, Bridge |
| Sem polling contínuo conversations | **IMPLEMENTADO** | sem interval lista |
| Sem polling attendance / unread | **IMPLEMENTADO** | periodic reconcile no-op; nav sem 120s |
| Sem polling ops dashboard | **IMPLEMENTADO** | 1×/tenant; refresh = métrica |
| Sem GET messages pós `conversation_updated` (Chat) | **IMPLEMENTADO** | comment + handlers locais |
| Attendance só login / manual / archive / inconsistência | **PARCIAL** | `loadConversations` ainda chama attendance-counts; prefetch idle; nav bootstrap |
| Kanban sem reload periódico 20s | **IMPLEMENTADO** | interval removido |
| Kanban updates só Socket **sem GET** | **NÃO IMPLEMENTADO** | `useKanbanAttendanceSocketRefresh` → `listCards` |
| HTTP só bootstrap / open / page / manual / F5 / inconsistência | **PARCIAL** | mount: runtime-config, ticket-categories, kanban tags; idle prefetch; filter reload lista |
| Cache sessão: Runtime Config / Flags / Tags / Categories / Ops | **PARCIAL** | instances + company 24h; flags login; runtime-config RQ 60s; tags/categories **sem** cache sessão P9; ops 1× effect |
| Socket atualiza Store sem GET | **PARCIAL** | Chat SoT ON OK; Floating OFF residual invalidate; Kanban GET |
| Floating pulse sem HTTP | **IMPLEMENTADO** | 500ms cleanup only |
| RQ sem refetch focus/reconnect | **IMPLEMENTADO** | `queryClient` defaults |
| Zero componentes fora do Chat gerando HTTP | **NÃO IMPLEMENTADO** (como zero absoluto) | tickets menu 60s; notifications 45s; idle prefetch shell |
| `automatic_http_refresh_total = 0` | **PARCIAL** | não há instrumentação em todos os residual paths; Target conceitual OK para pollers Chat |

---

## AUD-009 — Tabela Documento → Implementação → Diferença → Impacto → Correção recomendada

| Documento | Implementação | Diferença | Impacto | Correção recomendada (próxima sprint) |
|---|---|---|---|---|
| P9: attendance GET só login/manual/archive/inconsistência | `loadConversations` → `fetchChatAttendanceCounts` sempre | HTTP attendance a cada reload de lista/filtro | Tráfego extra ao filtrar inbox | Remover acoplamento; confiar engine/Socket; só force manual |
| P9: Socket SoT sem GET pós-evento | Kanban `listCards` após WS | GET cards em tráfego WS do board | Carga em boards ativos | Patch cards local / Store kanban; eliminar refresh HTTP |
| P9: updates dinâmicas via Socket | Floating Store OFF → invalidate | GET RQ se patch insuficiente | Dual-path legado | Forçar Store ON canário; endurecer patch payloads |
| P9 MB-043 cache tags/categories/runtime/ops | Mount Chat dispara GETs | Cache incompleto | Boot `/chat` mais “chatty” | Session cache + invalidate em mutação real |
| P9 escopo Chat zero polling | Shell tickets/notifications intervals | Pollers 60s/45s fora Chat | Backend load global | Sprint fora Chat ou documentar KEEP permanente |
| P9 HTTP permitido lista fechada | Idle `prefetchChatCore` | GET conversations/unread/instances pós-login idle | Burst após login | Contar como bootstrap estendido ou gate explícito |
| P9 QA: Kanban OK sem poll | Sem poll; com GET-on-socket | Inventário P9 subestimou WS→HTTP | Falsa sensação de pureza event-driven | Atualizar doc + corrigir hook |
| Closeout P9 “CLOSED” zero polling contínuo | Verdadeiro para **timers HTTP Chat** | “Event-driven purity” incompleta | Aceite estreito OK; aceite amplo falha | Separar gates: (A) zero poll (B) zero GET-on-socket |

---

## AUD-008 — Instrumentação (proposta; **não implementada**)

Regras da auditoria: **não alterar código**. Pontos recomendados para próxima sprint (logs temporários / métrica `automatic_http_refresh`):

| Endpoint / função | Trigger a etiquetar | Stack resumida |
|---|---|---|
| `fetchChatAttendanceCounts` | `reason` + caller (`loadConversations` / bootstrap / prefetch / manual) | — |
| `loadInboxCommand` | mount / filter / sync / archive | — |
| `listCards` via `refreshCardsOnly` | `socket` vs `manual` vs `dnd` | hook Kanban |
| `invalidateQueries` floating | `ws_patch_fail` / `store_off` | FloatingChatProvider |
| `getOperationsDashboard` | `mount_sla` / `manual` | Chat effect |
| Shell intervals | `timer` tickets/notifications | hooks menu/badges |

Schema sugerido: `{ endpoint, trigger: login|socket|manual|timer|mount|invalidate|prefetch|filter, stack: string[] }`.
