# AUDIT — Runtime Cost Model & Optimization Matrix

| Campo | Valor |
|---|---|
| **Documento** | AUDIT_RUNTIME_COST_MODEL |
| **Tipo** | investigation_only |
| **Prioridade** | Critical |
| **Data** | 2026-07-14 |
| **Escopo** | Frontend + Backend + Banco + Workers + WebSocket + Runtime |
| **Código / banco / flags / logs** | **Inalterados** |
| **Precedente** | [`AUDIT_RUNTIME_EXECUTION_MASTER.md`](./AUDIT_RUNTIME_EXECUTION_MASTER.md), [`AUDIT_APP_BOOTSTRAP_HYDRATION_PERFORMANCE.md`](./AUDIT_APP_BOOTSTRAP_HYDRATION_PERFORMANCE.md) |
| **Método de custo** | **Escore relativo estático** (1–10) derivado de evidência de código. **Não** são milissegundos, bytes ou %CPU medidos em runtime. Onde a medição live for necessária, está marcado `⚠ LIVE`. |

---

## Metodologia do escore

| Dimensão | Como estima (estático) | Evidência típica |
|---|---|---|
| HTTP | hops × duplicação × payload | Auth waterfall; Chat mount 4 loads |
| SQL | correlacionados, joins, N+1 loops, LIMIT | `chatController.ts` subqueries |
| React | LOC página + dual state + virt off | `Chat.tsx` ~7388 linhas |
| Socket | paths `io()` × emit always-log | Bridge vs dedicated |
| Workers | 1/(intervalo) × SQL/HTTP/logs | `index.ts:559-720` |
| CPU | loops maps sort JSON correlacionados | SQL AGG + FE sort lists |
| Memória | caches sobrepostos + dumps | RQ+Store+IDB+Window |
| Complexidade | #pipelines + #flags + monolitos | Freeze F6 + dual-path |
| **Custo** | média ponderada arredondada 1–10 | — |

Escala: **1–3 baixo · 4–6 médio · 7–8 alto · 9–10 crítico**.

---

# Executive Summary

| Achado | Custo | Evidência |
|---|---|---|
| Cold start auth serial (3 HTTP) | **9** | `AuthContext.tsx:145→168→169` |
| Chat mount CRM paralelo (clients/leads/categories) | **8** | `Chat.tsx:2279-2284` |
| Instances multi-fetch | **8** | Unread + Floating + Chat |
| SQL lista legada `MAX(messages)` | **9** | `chatController.ts:6213-6223` |
| SQL messages comments correlacionados | **9** | `:6959-6986` |
| Multi-socket F1 OFF | **9** | `Chat.tsx:1520` vs `1535` |
| Workers densos no mesmo processo HTTP | **8** | 19 timers `index.ts:559-720` |
| Logs BE (~1705 console.*) | **7** | rg; `chatController` 224 |
| Invalidate storms FE | **8** | Chat 20× / FloatWindow 18× |
| Overlap caches RQ∥Store∥IDB∥Window | **7** | docs F6 + persist bridge |

**Veredito:** o maior ROI está em **flags canário (F1/F2/F4/F5)**, **dedupe instances**, **lazy Chat CRM loads**, e **SQL de lista/mensagens** — não em micro-otimizações de UI.

---

# PARTE 1 — Cost Model Global

| Funcionalidade | HTTP | SQL | React | Socket | Workers | CPU | Memória | Complexidade | Custo |
|---|---|---|---|---|---|---|---|---|---|
| Bootstrap Auth | 9 | 5 | 3 | 0 | 0 | 4 | 2 | 6 | **9** |
| Module Permissions | 5 | 4 | 2 | 0 | 0 | 2 | 2 | 3 | **4** |
| Tenant Brand | 4 | 3 | 2 | 0 | 0 | 2 | 2 | 2 | **3** |
| Nav Unread | 7 | 3 | 3 | 2 | 0 | 3 | 3 | 5 | **7** |
| Floating Chat (idle) | 7 | 6 | 6 | 4 | 0 | 5 | 7 | 7 | **7** |
| Chat Inbox LIST | 8 | **9** | 8 | 5 | 0 | 8 | 7 | 9 | **9** |
| Chat Thread MESSAGES | 7 | **9** | 7 | 6 | 0 | 8 | 8 | 8 | **9** |
| Chat Send / Marks | 6 | 5 | 5 | 6 | 0 | 5 | 4 | 6 | **6** |
| Warm Prefetch F6.6 | 5 | 5 | 2 | 0 | 0 | 3 | 5 | 4 | **5** |
| Window Cache F6.2 | 1 | 1 | 2 | 0 | 0 | 3 | 5 | 5 | **4** (custo mem; benefício HTTP↓) |
| Dashboard | 5 | 5 | 5 | 1 | 0 | 4 | 4 | 4 | **5** |
| Clients list | 5 | 5 | 6 | 1 | 0 | 5 | 5 | 5 | **5** |
| Leads list | 5 | 5 | 5 | 1 | 0 | 5 | 5 | 5 | **5** |
| ClientProfile + chat | 7 | 6 | 8 | 7 | 0 | 6 | 6 | 7 | **8** |
| Agenda | 6 | 5 | 5 | 2 | 4 | 5 | 4 | 6 | **6** |
| Financeiro | 6 | 6 | 5 | 1 | 5 | 5 | 4 | 6 | **6** |
| Billing/MeuPlano | 6 | 6 | 7 | 1 | 7 | 6 | 4 | 7 | **7** |
| WhatsApp Instances admin | 6 | 4 | 4 | 3 | 6 | 5 | 4 | 5 | **6** |
| Chat SLA automation | 2 | **8** | 1 | 4 | **9** | 7 | 3 | 7 | **8** |
| Scheduled chat messages | 3 | 5 | 1 | 2 | 7 | 5 | 2 | 5 | **6** |
| Avatar cache worker | 4 | 5 | 0 | 0 | 7 | 5 | 4 | 5 | **6** |
| Announcement WA worker | 5 | 5 | 0 | 0 | 8 | 6 | 3 | 5 | **7** |
| Webhook Uaz/WA | 8 | 5 | 0 | 6 | 2 | 6 | 3 | 6 | **7** |
| Search global | 4 | 4 | 3 | 0 | 0 | 3 | 2 | 3 | **3** |
| Settings company | 4 | 3 | 3 | 0 | 0 | 2 | 2 | 2 | **3** |

---

# PARTE 2 — HTTP Cost

## Fatores por request tipico CRM

| Fator | Custo relativo | Evidência |
|---|---|---|
| Middleware `tenantAuthCrm` (7 steps + SQL user/tenant/plan) | Alto fixo | `auth.ts:414-422` |
| Payload amplo (`/api/clients` full no Chat) | Alto | `Chat.tsx:2249` |
| Duplicação instances | Alto | 3 callers |
| Serialização JSON grande (inbox 200) | Médio–Alto | LIMIT 200 lista |
| Aggregate vs legacy path | Legacy ≫ Aggregate | `getConversations` branch |

## Ranking — Top endpoints mais caros (estático)

> “Top 50” abaixo ranqueia os **hotspots comprovados + famílias principais**. Há **>90** rotas só em `chatRoutes.ts` e **~100** em superadmin; o ranking prioriza **frequência × custo unitário**, não lexicografia de todas as rotas.

| # | Endpoint | Queries est. | Joins/subq | Dup risk | Custo | Evidência |
|---|---|---|---|---|---|---|
| 1 | `GET /api/chat/conversations` (legacy) | 2+ | MAX correlacionado + LATERAL | Médio | **10** | `chatController.ts:6213-6223` |
| 2 | `GET /api/chat/conversations/:id/messages` | 2 | COUNT+json_agg/msg | Médio | **10** | `:6959-6986` |
| 3 | `GET /api/chat/conversations` (agregado + access loop) | 2+ | joins + async instance loop | Médio | **8** | `listService.ts:91-97` |
| 4 | `GET /api/auth/me` | 1–n | user+perfil | — | **8** | waterfall head |
| 5 | `GET /api/chat/instances` | 1 | JOIN users | **Alto** | **8** | multi-caller |
| 6 | Webhook WA inbound | n | writes+emit | — | **8** | storm path |
| 7 | `GET /api/clients` (via Chat mount) | 1 | list full | **Alto contexto** | **8** | `Chat.tsx:2281` |
| 8 | `GET /api/leads` (via Chat mount) | 1 | list | Alto ctx | **8** | `Chat.tsx:2282` |
| 9 | `GET /api/chat/conversations/attendance-counts` | **1** | FILTER aggregate | Médio | **5** | eficiente `:6888` |
| 10 | `GET /api/auth/me/features` | 1 | — | — | **6** | serial auth |
| 11 | `GET /api/chat/migration-flags` | 1 | — | — | **5** | serial |
| 12 | `GET /api/me/tenant/my-permissions` | 1–2 | — | — | **5** | shell |
| 13 | `GET /api/me/tenant/company` | 1 | — | c/ Settings | **5** | Brand |
| 14 | `GET /api/dashboard/overview` | multi | aggregates | — | **6** | Dashboard |
| 15 | `POST /api/chat/messages` (send) | multi | write+emit | — | **7** | path crítico |
| 16 | `POST …/mark-read` | 2–3 | — | — | **5** | — |
| 17 | Floating conversations list | 1 | agg/legacy | Médio | **7** | prefetch |
| 18 | Floating messages dump | 1 | correlacionados | Alto mem | **9** | `latestPage:false` |
| 19 | `GET /api/ticket-categories` | 1 | — | Chat noise | **4** | Chat mount |
| 20 | `GET /api/chat/runtime-config` | 1 | — | Baixo | **3** | `Chat.tsx:893` |
| 21–30 | Financial CRUD / invoices / charges | 2–5 | joins billing | Médio | **6–7** | `financialRoutes` 39 |
| 31–40 | Appointments / agenda | 2–4 | — | Médio | **5–6** | `appointmentsRoutes` 33 |
| 41–45 | Contracts / proposals | 2–5 | templates | Médio | **6** | routes counts |
| 46–50 | Superadmin ops / tenants | variável | admin | Baixo freq user | **5–7** | `superadminRoutes` 100 |

**⚠ LIVE:** payload bytes e p95 latência por endpoint exigem APM/Network staging.

---

# PARTE 3 — SQL Cost

| Endpoint / path | Padrão | Classificação | Evidência |
|---|---|---|---|
| Conversations **legacy** | JOIN + `MAX(messages)` correlacionado + LATERAL + LIMIT 200 | **Muito Alto** | `chatController.ts:6213-6504` |
| Messages thread | access + per-msg `COUNT`/`json_agg` comments | **Muito Alto** | `:6959-7011` |
| Conversations **aggregated** | 1 query + tags batch; access loop instances | **Alto** | `queryBuilder` + `listService.ts:91-97` |
| Chat SLA worker tick | per-row refresh queries | **Muito Alto** (background) | `chatSlaWorkerService.ts:188-270` |
| Attendance-counts | `COUNT FILTER` único | **Baixo** | `:6888-6905` |
| Instances list | 1 JOIN | **Baixo** | `chatInstanceAccess.ts:58-74` |
| Client messages | `ANY(conversation_ids)` batch | **Médio** | getClientMessages |
| Auth me / tenant plan gates | lookups user/tenant | **Médio** (fixo/request) | `authenticateToken` + commercial |

---

# PARTE 4 — React Cost

## Ranking páginas (proxy LOC + papel)

| # | Página | LOC aprox. | Custo React | Motivo |
|---|---|---|---|---|
| 1 | `Chat.tsx` | **7388** | **10** | Monólito + inbox + thread + CRM side loads |
| 2 | `ClientProfile.tsx` | 2728 | **8** | Profile + chat socket risk |
| 3 | `CustomerInvoiceNew.tsx` | 2807 | **7** | Form pesado |
| 4 | `Projects.tsx` | 2775 | **7** | Boards/tasks |
| 5 | `PlanCheckout.tsx` | 2637 | **7** | Checkout |
| 6 | `Clients.tsx` | 2497 | **7** | Lista + drawers |
| 7 | `MeuPlano.tsx` | 1929 | **6** | Billing UX |
| 8 | `Tasks.tsx` | 1412 | **6** | Infinite queries |
| 9 | `Dashboard.tsx` | 1272 | **5** | Overview |
| 10 | Floating windows/list | multi-file | **8** | Virt legacy + dump + invalidate |

### Componentes/hotspots

| Componente / área | Custo | Nota |
|---|---|---|
| Chat sidebar (virt ON) | 5 | F6.3 reduz DOM |
| Chat thread (virt core ON) | 5 | F6.4 |
| Chat thread TanStack Float | 7 | legacy mode |
| ChatComposer / panels | 6 | efeitos + popovers |
| AppShell + providers | 6 | sempre montado |
| Memo rows F6.5 | ↓ custo incremental WS | fingerprint |

**⚠ LIVE:** commits/FPS — React Profiler.

---

# PARTE 5 — Store Cost

| Métrica | Estimativa estática | Evidência |
|---|---|---|
| Slices | 12 | `DOMAIN_STORE_FREEZE` |
| Action types | 34 | freeze |
| Notify | skip se `Object.is` + stable selectors | F6.5 createStore |
| Batch WS | `dispatchBatch` / bridge queue | F6.5 |
| Window residente | ~5 pages/conversa | F6.2 |
| Prefetch idle | ≤5 conversas | F6.6 |
| Subscriptions UI | hooks/public (~10) | `store/public.ts` |
| Memória Store | O(conversas + janela msgs) | memoryMetrics heurística |
| Custo incremental WS (STORE ON) | **Médio–Baixo** vs RQ invalidate | batch+memo |
| Custo residual dual-path OFF | **Alto** | RQ+useState |

Classificação Store ON: **custo estrutural médio, benefício alto**.  
Classificação dual-path OFF: **custo alto**.

---

# PARTE 6 — Worker Cost

| Rank | Worker | Intervalo | SQL | HTTP | Logs | Custo |
|---|---|---|---|---|---|---|
| 1 | Announcements WA | **~4s** | Sim | Sim | Sim | **9** |
| 2 | Chat SLA | ~120s | **N+1** | notify/WS | Sim | **9** |
| 3 | Chat scheduled msgs | ~30s | Sim | UazAPI | JSON | **8** |
| 4 | Kanban scheduled moves | ~30s | Sim | — | Sim | **7** |
| 5 | Avatar cache | interval | Sim | CDN | **verboso** | **7** |
| 6 | Proposal webhooks | ~60s | Sim | Sim | Sim | **7** |
| 7 | Notif outbound retries | poll | Sim | Sim | Sim | **7** |
| 8 | Agenda reminders | ~60s | Sim | Sim | — | **6** |
| 9 | WA Official campaigns | flag | Sim | Graph | — | **6** |
| 10 | Billing overdue | ~5m | Sim | — | Sim | **5** |
| 11 | Feature flags refresh | 120s | Sim | — | Sim | **4** |
| 12–19 | Trials/tickets/digest/automation | 1h–24h | Sim | var | Sim | **3–5** |

Evidência start: `packages/backend/src/index.ts:559-720`.

---

# PARTE 7 — WebSocket Cost

| Fator | Custo | Evidência |
|---|---|---|
| Single shared socket (F1 ON) | **3** | `bridge.ts:226` `forceNew:false` |
| Multi `io()` (F1 OFF) | **9** | Chat/Profile/Kanban/realtimeClient |
| Rooms user+tenant | **4** | `websocketService.ts:158-168` |
| Emit + always log conversation update | **7** | `:318-347` |
| Fan-out tenant room | **6** | escala 1 node |
| Redis multi-node | **N/A / bloqueado** | adapter ausente |
| FE listeners Store | **4** | `storeBootstrap.ts:65-67` |
| FE invalidate fallback | **8** | patch OFF |

---

# PARTE 8 — Cache Cost (economia vs consumo)

| Cache | Memória (est.) | Evita HTTP | Evita SQL | Evita React | Nota |
|---|---|---|---|---|---|
| Domain Store | Médio–Alto | Alto (WS) | Médio | Alto c/ selectors | Primário STORE ON |
| React Query | Médio | Médio–Alto | Médio | Médio | Shell/Float |
| IndexedDB persist | Médio disco | Warm reload | — | Mount↓ | prod default ON |
| Window Cache | Bound ~5 pages | Load-more | — | Scroll | F6.2 |
| Warm Window | Baixo metadados | Troca conversa | — | — | F6.6 |
| Instance registry | Baixo TTL | Instances | — | — | F3 |
| Browser HTTP cache | Baixo | Baixo APIs auth | — | — | fraco |
| Redis | 0 hoje | — | — | — | F7 |

Sobreposição = **custo memória duplicada** (RQ messages ∥ Store ∥ IDB).

---

# PARTE 9 — Bootstrap Cost

| Fase | HTTP | Bloqueio | Custo | Evidência |
|---|---|---|---|---|
| Theme | 0 | Não | 1 | ThemeProvider |
| Auth me | 1 | **Sim** | 9 | `:145` |
| Features | 1 | Sim serial | 7 | `:168` |
| Migration flags | 1 | Sim serial | 6 | `:169` |
| Permissions | 1 | Soft | 4 | ModulePermissions |
| Brand | 1 | Não | 3 | TenantBrand |
| Unread | 2 | Não | 7 | instances+counts |
| Socket | handshake | Não | 5 | HeaderRealtime |
| Floating idle | 1–3 | Não | 6 | Deferred |
| Persist IDB | 0 HTTP | Não | 3 | I/O disco |
| Sidebar prefetch | 1–n | Não | 5 | idle warm |
| Chat page extra | 4+ | Página | 8 | `:2279-2284` |

### Timeline de custo (relativo)

```text
[#########] Auth waterfall          ← maior fatia TTI
[####....] Permissions+Brand
[######.] Unread+Socket
[########] Chat page loads (se /chat)
[###.....] Idle floating/prefetch   ← amortizado
```

---

# PARTE 10 — Logs Cost

| Camada | Volume | I/O | Ruído | Evidência |
|---|---|---|---|---|
| BE console.* | **~1705** | Alto | Alto | rg |
| chatController | 224 | Alto | Alto | top file |
| websocket emits | 30+ always | Médio/req emit | Alto | `emitConversationUpdate` |
| Workers avatar/announce | cycles | Médio contínuo | Alto | workers |
| FE metrics gated | DEV+flag | Baixo prod | Baixo | CHAT_CORE_METRICS |
| FE console.error ungated | dezenas páginas | Baixo | Médio DevTools | Auth/Chat/Finance… |

**⚠ LIVE:** GB/dia de log = métrica ops.

---

# PARTE 11 — Memory Cost

| Residência | Duplicação | Economia possível |
|---|---|---|
| Chat.tsx closures + state | Alta superfície | Split modules (longo prazo) |
| RQ Float messages dump | Alta | latest-page |
| Store window | Bound | Já limitado |
| IDB + RQ + Store | Sobreposição | Allowlist estrita |
| Providers shell | Baixa por se | Lazy unread/brand |
| Worker heaps no mesmo Node | Contende c/ HTTP | Extrair processos |

Heurística F5.12: ~800B/conversa + ~400B/msg (não heap V8 real).

---

# PARTE 12 — CPU Cost

| Hotspot | Tipo | Custo | Evidência |
|---|---|---|---|
| SQL correlacionado list/msg | DB CPU | **10** | chatController |
| JWT+user SQL /request middleware | BE CPU | **6** | tenantAuthCrm |
| JSON serialize inbox 200 | BE CPU | **7** | LIMIT 200 |
| FE sort conversations | FE CPU | **5** | Chat.tsx sorts |
| Virt measure/layout | FE CPU | **4** | F6 measure hysterese |
| WS JSON emit broadcast | BE CPU | **6** | tenant rooms |
| Announcement worker 4s | BE CPU | **8** | poll curto |
| Regex/crypto auth | Médio | **4** | JWT verify |

---

# PARTE 13 — Dependency Cost (grafo)

```text
Auth.loading ──blocks──► AuthGuard ──► Shell/Page
user.id ──► Permissions
user ──► Brand / Unread / Floating / Chat
CHAT_SINGLE_SOCKET ──gates──► #sockets
CHAT_CORE_STORE ──gates──► Store vs RQ SoT
CHAT_AGGREGATED_* ──gates──► SQL list path
CHAT_WS_PATCH_* ──gates──► invalidate volume
Unread.instances ──may duplicate──► Chat.instances / Floating.instances
loadInbox ──depends──► instances enabled
Workers(setInterval) ──contende──► HTTP event loop CPU
Socket emit ──may──► FE invalidate (flag OFF) ──► HTTP storm
```

Quem acorda quem (WS STORE ON): Socket → Bridge → syncStore → selectors → hooks → rows memo.

---

# PARTE 14 — Optimization Matrix

| ID | Problema | Local | Impacto | Benefício | Complexidade | Tempo est. | Dependências | Risco | Retorno |
|---|---|---|---|---|---|---|---|---|---|
| M1 | Ligar `CHAT_SINGLE_SOCKET` | Flags | P0 | Sockets↓ | Ops | 0.5d | Canário | Baixo | **Altíssimo** |
| M2 | Ligar Aggregated+Store+WS-patch | Flags | P1 | HTTP/SQL/invalidate↓ | Ops | 1–2d | QA chat | Médio | **Altíssimo** |
| M3 | Single-flight instances | FE registry/RQ | P1 | HTTP↓ | Baixa | 1–2d | F3 | Baixo | Alto |
| M4 | Lazy clients/leads no Chat | `Chat.tsx` | P1 | Payload↓ | Baixa | 1d | UX tickets | Baixo | Alto |
| M5 | Paralelo/bundle auth | Auth API/FE | P1 | TTI↓ | Média | 3–5d | Auth contract | Médio | Alto |
| M6 | SQL messages sem correlacionados | BE messages | P1 | p95↓ | Alta | 1–2sprints | API compat | Médio | Alto |
| M7 | Forçar/retirar legacy list MAX() | BE conversations | P1 | SQL↓ | Média | 1 sprint | Aggregated ON | Médio | Alto |
| M8 | Float latest-page | Float hooks | P2 | Mem/HTTP↓ | Média | 1 sprint | Store | Médio | Médio |
| M9 | Extrair workers processo | Deploy | P2 | CPU HTTP↑ | Alta | 2+ sprints | Ops | Médio | Médio–Alto |
| M10 | Throttle logs WS/workers | BE | P2 | I/O↓ | Baixa | 2–3d | Observability | Baixo | Médio |
| M11 | Soft-lazy Brand/Unread | Shell | P2 | HTTP rotas↓ | Média | 3d | Nav UX | Baixo | Médio |
| M12 | Redis adapter | F7 | Escala | Multi-node | Alta | F7 | Redis HA | Alto | Crítico escala |
| M13 | Split Chat.tsx | FE | P3 | Render manuten. | Muito alta | multi | Freeze ADR | Alto | Longo prazo |
| M14 | Fill live cost metrics | Staging | P3 | Visibilidade | Baixa | 1d | APM | Nenhum | Alto ops |

---

# PARTE 15 — ROI

| Classe | Itens | Esforço | Benefício |
|---|---|---|---|
| **Quick Win** | M1, M2 (flags), M10 logs | Baixo | Muito alto / Médio |
| **Baixo esforço alto retorno** | M3, M4 | Baixo | Alto |
| **Alto retorno médio esforço** | M5, M7, M8, M11 | Médio | Alto |
| **Estrutural / longo prazo** | M6, M9, M13 | Alto | Alto / Médio |
| **Escalabilidade** | M12 F7 | Alto + infra | Bloqueante 1k+ CCU |

---

# PARTE 16 — Heat Map

| Módulo | Status | Justificativa |
|---|---|---|
| Frontend Chat page | 🔴 | LOC 7388 + mount CRM + dual path |
| Frontend Shell bootstrap | 🟠 | Waterfall auth + unread |
| Frontend Float | 🟠 | Dump + invalidate |
| Frontend Dashboard/CRM lists | 🟡 | Custo moderado |
| Backend Chat SQL list/msg | 🔴 | Correlacionados |
| Backend Auth middleware | 🟡 | Fixo/request necessário |
| Backend Workers | 🔴 | 19 timers + SLA N+1 + announce 4s |
| Backend Logs | 🟠 | ~1705 console |
| Socket (F1 ON) | 🟡 | Aceitável 1 node |
| Socket (F1 OFF / multi) | 🔴 | Storm risk |
| Domain Store F6 | 🟢 | Arquitetura boa; custo controlado |
| Cache Window/Warm | 🟢 | Benefício > custo |
| Cache RQ∥Store overlap | 🟠 | Duplicação |
| Redis / multi-node | 🔴 | Ausente |
| Banco indexes (unmeasured) | 🟡 | ⚠ LIVE EXPLAIN |

---

# PARTE 17 — Top 100 Costs (consumidores)

Mistura HTTP/SQL/React/Socket/Workers/Cache/CPU/Mem. Score relativo.

| # | Consumidor | Domínio | Score | Evidência-chave |
|---|---|---|---|---|
| 1 | Auth waterfall 3-hop | HTTP | 98 | AuthContext |
| 2 | Conversations SQL legacy MAX() | SQL | 97 | chatController 6213 |
| 3 | Messages SQL comments agg | SQL | 96 | 6959 |
| 4 | Chat.tsx monolith | React | 95 | 7388 LOC |
| 5 | Multi-socket F1 OFF | Socket | 94 | Chat.tsx fork |
| 6 | Instances multi-fetch | HTTP | 93 | 3 callers |
| 7 | Chat mount clients+leads | HTTP | 92 | 2279-2284 |
| 8 | Invalidate storms Chat/Float | HTTP/RQ | 91 | 20/18 counts |
| 9 | Announcement worker 4s | Worker | 90 | index timers |
| 10 | Chat SLA per-row SQL | Worker/SQL | 89 | sla worker |
| 11 | Float messages dump | HTTP/Mem | 88 | latestPage:false |
| 12 | Backend console volume | I/O | 87 | ~1705 |
| 13 | WS emit always-log | I/O/Socket | 86 | websocketService |
| 14 | tenantAuthCrm SQL gates | HTTP/SQL | 85 | every chat req |
| 15 | RQ∥Store∥IDB overlap | Mem | 84 | caches |
| 16 | Avatar cache worker | Worker | 83 | avatar worker |
| 17 | Scheduled chat msgs worker | Worker | 82 | 30s poll |
| 18 | Aggregated access instance loop | SQL | 81 | listService 91 |
| 19 | ClientProfile+chat socket | React/Socket | 80 | 2728 LOC |
| 20 | Kanban move worker | Worker | 78 | 30s |
| 21 | Inbox JSON serialize 200 | CPU | 77 | LIMIT 200 |
| 22 | Proposal webhook worker | Worker | 76 | 60s+HTTP |
| 23 | Notif retry workers | Worker | 75 | polls |
| 24 | FloatingConversationWindow invalidates | RQ | 74 | 18× |
| 25 | Unread attendance+instances | HTTP | 73 | nav unread |
| 26 | Sidebar idle prefetch burst | HTTP | 72 | AppShellSidebar |
| 27 | Brand+Settings company dup | HTTP | 70 | two callers |
| 28 | Dashboard overview | HTTP/SQL | 68 | dashboard |
| 29 | Financial routes churn | HTTP | 67 | 39 routes |
| 30 | Appointments module | HTTP/Worker | 66 | reminders |
| 31 | Warm prefetch loads | HTTP | 65 | F6.6 (benefit trade) |
| 32 | Window cache mem | Mem | 50 | intentional |
| 33 | Virt engines CPU measure | CPU | 48 | F6 measure |
| 34 | Store batch notify | Store | 45 | optimized |
| 35 | Permissions fetch | HTTP | 44 | once |
| 36 | Runtime-config | HTTP | 30 | light |
| 37–60 | Billing trials tickets digest… | Worker | 35–55 | low frequency |
| 61–80 | Superadmin CRUD family | HTTP | 30–50 | low user freq |
| 81–100 | Settings sections / small GETs | HTTP/React | 20–40 | low |

Itens 37–100 agrupados por família: detalhamento fino exige **⚠ LIVE** APM ranking por RPS×latência.

---

# PARTE 18 — Roadmap (planejamento only)

### Sprint 1 — Quick Wins (flags + observabilidade)

- M1 Single socket ON canário  
- M2 Aggregated + Store + WS-patch canário  
- M14 Fill Network baseline cost  
- M10 Log throttle design (doc only / feature gate plan)

### Sprint 2 — HTTP dedupe FE

- M3 Single-flight instances  
- M4 Lazy clients/leads/categories no Chat  
- M11 Soft-lazy Brand/Unread (opcional)

### Sprint 3 — Auth TTI + Float

- M5 Auth parallel/bundle  
- M8 Float latest-page  

### Sprint 4 — SQL hotspots

- M7 Eliminar path legacy MAX() (após aggregated estável)  
- M6 Messages query reshape (comments later/batch)

### Sprint 5 — Runtime isolation + scale

- M9 Workers fora do API process  
- M12 Kickoff F7 Redis  
- M13 (backlog) Chat.tsx split sob ADR

Cada sprint: **otimizações independentes o suficiente para rollback por flag/PR**; **nenhuma implementação neste documento**.

---

## Regras de leitura deste modelo

1. Scores **não** são SLAs.  
2. Priorize **P0/P1 matrix** antes de micro-CPU FE.  
3. Store/Window/Warm estão em heat **verde** — não “otimizar” destruindo o freeze F6.8.  
4. Qualquer mudança estrutural Chat Core → ADR (Architecture Freeze).

---

## Assinatura

| Campo | Valor |
|---|---|
| **Status** | Cost model estático + matriz oficial |
| **Implementação** | Nenhuma |
| **Próximo passo humano** | Escolher Sprint 1 (flags) e medir ⚠ LIVE antes/depois |
