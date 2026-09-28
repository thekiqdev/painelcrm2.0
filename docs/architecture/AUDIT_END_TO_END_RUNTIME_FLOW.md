# AUDIT — End-to-End User Journey Performance & Runtime Flow

| Campo | Valor |
|---|---|
| **Documento** | AUDIT_END_TO_END_RUNTIME_FLOW |
| **Tipo** | investigation_only |
| **Prioridade** | Critical |
| **Data** | 2026-07-14 |
| **Escopo** | Aplicação completa (FE + BE + Banco + Workers + WebSocket + Runtime + Cache) |
| **Código / banco / flags / SQL / cache** | **Nada alterado** |
| **Commits / patches / implementação** | **Nenhum** |
| **Método** | Síntese evidenciada dos audits estáticos + leitura pontual de logout/cache. **Sem** Network/Profiler/EXPLAIN/Heap ao vivo nesta sessão. |
| **Documentos-base** | [`AUDIT_APP_BOOTSTRAP_HYDRATION_PERFORMANCE.md`](./AUDIT_APP_BOOTSTRAP_HYDRATION_PERFORMANCE.md) · [`AUDIT_RUNTIME_EXECUTION_MASTER.md`](./AUDIT_RUNTIME_EXECUTION_MASTER.md) · [`AUDIT_RUNTIME_COST_MODEL.md`](./AUDIT_RUNTIME_COST_MODEL.md) · Chat F5–F6 freeze |

**Legenda de evidência:** ✅ estática · ⚠ Network · ⚠ Profiler · ⚠ EXPLAIN · ⚠ Heap · ⚠ Benchmark live

---

# 1 — Executive Summary

A jornada do usuário autenticado no PainelCRM segue:

1. **Bootstrap serial de identidade** (me → features → migration-flags)  
2. **Fan-out do shell** (permissions, brand, unread, socket, idle floating/prefetch)  
3. **Páginas de domínio** (Dashboard / Chat / CRM / Financeiro / Agenda / Settings) com pipelines HTTP→middleware→SQL  
4. **Realtime** (Bridge ou multi-`io()`) → Store ou invalidate RQ  
5. **Workers contínuos** no mesmo processo Node do HTTP  
6. **Logout** limpando RQ + page cache + IndexedDB chat + flags locais (+ socket disconnect em unmount de hooks)

### Principais gargalos ✅

| Gargalo | Evidência |
|---|---|
| Waterfall auth 3 HTTP | `AuthContext.tsx:145→168→169` |
| Instances 2–3× | Unread + Floating + Chat |
| Chat mount carrega clients/leads/categories | `Chat.tsx:2279-2284` |
| SQL legacy `MAX(messages)` / messages `json_agg` | `chatController.ts:6213+`, `:6959+` |
| Multi-socket se F1 OFF | `Chat.tsx:1520` vs `1535` |
| Invalidate storms | Chat **20×** / FloatWindow **18×** |
| ~19 workers no processo HTTP | `index.ts:559-720` |

### Duplicações / waterfalls / riscos

- **Duplicações:** instances, company (brand∥settings), SoT RQ∥Store∥IDB  
- **Waterfalls:** auth serial; inbox depende instances; SQL correlacionado  
- **Riscos:** flags default OFF → caminho caro; sem Redis → sem multi-réplica WS; Chat.tsx monolítico (~7388 LOC)

---

# 2 — Complete Runtime Journey

```text
Browser
  → main.tsx (StrictMode)
  → App.tsx
      QueryClientProvider → TooltipProvider → BrowserRouter → ThemeProvider
        AuthProvider                    ← GET /api/auth/me → features → migration-flags
          ChatQueryPersistBridge        ← idle IndexedDB
          ModulePermissionsProvider     ← GET /api/me/tenant/my-permissions
            Routes
              AuthGuard
                AppShell
                  FloatingChatDeferred → FloatingChatProvider
                  TenantBrandProvider     ← GET /api/me/tenant/company
                  ChatNavUnreadProvider   ← instances + attendance-counts
                  Sidebar + idle prefetch
                  HeaderRealtimeBridge    ← Socket.IO
                  RequireModuleView
                    ├─ /dashboard         ← overview
                    ├─ /chat              ← runtime-config, instances, inbox, clients, leads, categories, messages
                    ├─ /clients|/leads    ← lists CRM
                    ├─ financeiro/*       ← financial APIs
                    ├─ agenda             ← appointments (+ workers reminders BE)
                    └─ /settings          ← company / sections
                  Realtime events → Bridge → Store (STORE ON) | invalidate (OFF)
  → User actions (send, mark-read, navigate…)
  → Workers (background, continuous)
  → signOut
      POST /api/auth/logout (best-effort)
      clearAllCachedAppData (RQ + chat page cache + IDB)
      resetChatMigrationFlagsToDefaults
      clearAuthState + token null
      navigate /login
      (socket: disconnectRealtime via useRealtimeEvents cleanup / forceDisconnect F1)
```

---

# 3 — Runtime Timeline

## Cold start → `/dashboard`

```text
T0  Paint App providers
T1  GET /api/auth/me                         ✅ AuthContext:145
T2  GET /api/auth/me/features                ✅ :168/:184
T3  GET /api/chat/migration-flags            ✅ :169 → flagManager:67
T4  GET /api/me/tenant/my-permissions        ✅ ModulePermissions:49
T5  AuthGuard libera AppShell
T6‖ GET company | instances+counts | socket | dashboard overview
T7+ Idle: Floating, IDB persist, sidebar warm, search overlay
```

## Abrir `/chat`

```text
(após shell)
→ GET runtime-config                         ✅ Chat.tsx:893-896
→ ensureChatInstances                        ✅ :1052 / :2279
→ loadClients ‖ loadLeads ‖ loadTicketCategories  ✅ :2280-2283
→ loadInboxCommand (após instances)          ✅ :1143 / :2369
→ virt lista (STORE ON)                      ✅ F6.3
→ seleção → loadMessagesCommand              ✅ F5.10/F6.1
→ virt thread / prefetch idle / warm window  ✅ F6.4–F6.6
→ socket already up; Bridge subscribe        ✅ storeBootstrap:65-67
```

## Logout

```text
signOut
→ POST /api/auth/logout                      ✅ AuthContext:313
→ clear state user/session/features
→ clearAllCachedAppData                      ✅ :324 → queryClient.ts:31-37
→ resetChatMigrationFlagsToDefaults          ✅ :325
→ clearAuthState + apiClient.setToken(null)
→ navigate('/login')                         ✅ :337
```

---

# 4 — HTTP Journey

| Etapa | Endpoint | Quem | Quando | Depende | Dup? | Waterfall? |
|---|---|---|---|---|---|---|
| Login session | `GET /api/auth/me` | AuthProvider | mount c/ token | token | Não | **Head** |
| Features | `GET /api/auth/me/features` | AuthProvider | após me | me | Não | Serial |
| Flags | `GET /api/chat/migration-flags` | AuthProvider | após me | me | Não | Serial |
| Permissions | `GET /api/me/tenant/my-permissions` | ModulePermissions | user.id | user | Não | Soft |
| Brand | `GET /api/me/tenant/company` | TenantBrand | shell | tenant | **c/ Settings** | Não |
| Instances | `GET /api/chat/instances` | Unread/Float/Chat | shell/page | chat feature | **Alto** | — |
| Attendance | `GET …/attendance-counts` | Unread (+Chat) | shell | instances | Médio | Após instances |
| Dashboard | `GET /api/dashboard/overview` | Dashboard | page | auth | Baixo | — |
| Inbox | `GET /api/chat/conversations` | loadInbox | Chat | instances | Path agg/legacy | Após instances |
| Messages | `GET …/messages` | loadMessages | seleção | conversation | — | — |
| Clients (Chat) | `GET /api/clients` | Chat mount | Chat | — | **Ruído** | Paralelo mount |
| Leads (Chat) | `GET /api/leads` | Chat mount | Chat | — | **Ruído** | Paralelo |
| Categories | `GET /api/ticket-categories` | Chat mount | Chat | — | Baixo | Paralelo |
| Logout | `POST /api/auth/logout` | signOut | logout | token | — | Best-effort |

Payloads: ⚠ Network. Duplicações: ✅ estáticas acima.

---

# 5 — SQL Journey

| Endpoint | Queries/padrão | Custo relativo | Frequência | Evidência | Tipo |
|---|---|---|---|---|---|
| Conversations **legacy** | JOIN + **`MAX(messages)` correlacionado** + LATERAL + LIMIT 200 | **Muito Alto** | Alta (inbox OFF agg) | `chatController.ts:6213-6504` | ✅ + ⚠ EXPLAIN |
| Conversations **aggregated** | 1 SELECT + tags; access loop instances | Alto | Alta se flag ON | `listService.ts` / queryBuilder | ✅ + ⚠ EXPLAIN |
| Messages | access + per-msg `COUNT`/`json_agg` comments | **Muito Alto** | Alta | `:6959-7011` | ✅ + ⚠ EXPLAIN |
| Attendance-counts | 1 `COUNT FILTER` | Baixo | Alta (shell) | `:6888-6905` | ✅ |
| Instances | 1 JOIN users | Baixo unitário | **×N callers** | `chatInstanceAccess.ts:58-74` | ✅ |
| Auth me / tenant gates | lookups user/tenant/plan | Médio fixo/req | Todo CRM req | `tenantAuthCrm` | ✅ |
| Chat SLA worker | per-row refresh | Alto bg | ~120s | `chatSlaWorkerService.ts` | ✅ |

Índices efetivos: ⚠ EXPLAIN (não inventariados live nesta sessão).

---

# 6 — React Journey

| Tela | Renders/risco | Providers | Hooks chave | Virt | Evidência |
|---|---|---|---|---|---|
| Shell | Re-render em auth/unread/brand | AppShell tree | unread, brand | — | AppShell.tsx |
| Dashboard | Overview query | shell | useQuery overview | Não | Dashboard.tsx |
| Chat | **Alto** (7388 LOC) | shell+store | useChat*, virt, warmup | Sim STORE ON | Chat.tsx |
| Floating | Médio–Alto | FloatingProvider | Float hooks, TanStack | Legacy | floating-chat/* |
| Clients/Leads | Médio–Alto | shell | useQuery lists | Não | Clients/Leads.tsx |
| ClientProfile | Alto + socket risk | shell | profile+chat | Parcial | ClientProfile ~2728 LOC |
| Financeiro | Médio | finance chrome | queries finance | — | Finance.tsx |
| Agenda | Médio | shell | appointments | — | agenda/* |
| Settings | Baixo–Médio | SettingsLayout | company sections | — | Settings |

Memo F6.5 (rows) e `useStableSelector` reduzem re-renders WS quando STORE ON. ✅  
Quantidade exacta de commits: ⚠ Profiler.

---

# 7 — Store Journey

```text
UI / Commands / Bridge
  → dispatch | dispatchBatch
  → reduceChatDomainState (34 action types, 12 slices)
  → skip notify se Object.is
  → useStableSelector (equality) → Hooks → Components
Cursor / Window Cache / Virt windows / Warm prefetch (loadMessagesCommand)
```

| Quem escreve | Commands, `syncStoreFromSocketEvent`, virt setWindow | ✅ |
|---|---|---|
| Quem lê | `store/public` hooks | ✅ |
| Bypass | Float dump; satellites; STORE OFF RQ | ✅ |
| Batch | F6.5 Bridge microtask | ✅ |
| Freeze | ADR-010 / DOMAIN_STORE_FREEZE | ✅ |

---

# 8 — Cache Journey

```text
Request chega
  → (Browser HTTP fraco)
  → React Query (shell/float/dashboard)     ← primeira linha se STORE OFF
  → Domain Store                            ← SoT se STORE ON
  → Window Cache (páginas msgs residentes)
  → Warm Window (IDs aquecidos → prefetch)
  → IndexedDB persist (subset RQ, idle)
  → chatPageCache (legado limpo no logout)
  → Instance registry TTL
  → Redis                                   ← AUSENTE
```

| Quem primeiro | STORE ON: Store para chat domínio; RQ ainda shell |
|---|---|
| Quem substitui | STORE ON bypassa RQ writers Float/Chat |
| Quem duplica | RQ messages ∥ Store ∥ IDB |

Logout limpa RQ + page cache + IDB: `queryClient.ts:31-37` ✅

---

# 9 — Worker Journey

| Worker | Freq tip. | SQL | HTTP | Logs | Dep |
|---|---|---|---|---|---|
| Flags refresh | 120s | Sim | — | Sim | pool |
| Kanban moves | 30s | Sim | — | Sim | — |
| Proposal webhooks | 60s | Sim | Sim | Sim | — |
| Notif retries | poll | Sim | Sim | Sim | — |
| Invoice digest | flag | Sim | — | — | — |
| Billing overdue | 5m | Sim | — | Sim | — |
| Trial notifications | 6h | Sim | — | Sim | — |
| Announcements WA | **~4s** | Sim | Sim | Sim | Meta/WA |
| Agenda reminders | 60s | Sim | Sim | — | — |
| Agenda automation | 5m | Sim | — | — | — |
| Chat SLA | 120s | **N+1** | WS/notify | Sim | chat |
| Chat scheduled msgs | 30s | Sim | UazAPI | JSON | chat |
| WA campaigns | flag | Sim | Graph | — | — |
| Avatar cache | interval | Sim | CDN | **verboso** | — |
| Tickets/trials lifecycle | 1h–24h | Sim | — | Sim | — |

Start: `packages/backend/src/index.ts:559-720` ✅ · Scripts billing/outbox separados ✅

---

# 10 — WebSocket Journey

```text
HTTP server → initializeWebSocket
  → auth JWT + SQL user
  → rooms user:{id} / tenant:{tid}
  → emit conversation/message/attendance/…

Frontend:
  HeaderRealtimeBridge → connectRealtime
    → CHAT_SINGLE_SOCKET ON: ChatRealtimeBridge (shared io)
    → OFF: legacy io() + Chat.tsx own io() + Profile/Kanban possible
  STORE ON: Bridge.subscribe → enqueue → syncStoreFromSocketEvent
  STORE OFF: window events / RQ patch / invalidate
Reconnect: socket.io client defaults + token
Fallback: realtimeClient.connectLegacy
Logout/unmount: disconnectRealtime → forceDisconnect (F1) ou legacy disconnect
```

Evidências: `websocketService.ts`, `bridge.ts`, `Chat.tsx:1495-1597`, `realtimeClient.ts:123-134`, `useRealtimeEvents.ts` ✅

---

# 11 — Bootstrap Journey

| Quem monta | Espera | Bloqueia page? | Lazy? | Auth? | Tenant? |
|---|---|---|---|---|---|
| QueryClient/Theme | — | Não | Não | Não | Não |
| AuthProvider | token | **Sim** (loading) | Não | Sim | Indireto |
| Permissions | user.id | Soft (module gate) | Não | Sim | Sim |
| AppShell | AuthGuard | — | — | Sim | — |
| Brand | user | Não | **Poderia** | Sim | Sim |
| Unread | chat allowed | Não | **Poderia** | Sim | Sim |
| Floating | idle/interaction | Não | **Já lazy** | Sim | Sim |
| Persist IDB | idle | Não | **Já lazy** | Sim | Sim |
| Page | module view | — | code-split rotas | Sim | Sim |

---

# 12 — Waterfall Matrix

| Tipo | Onde | Severidade | Evidência |
|---|---|---|---|
| HTTP Waterfall | Auth 3 hops | 🔴 | AuthContext |
| HTTP Waterfall | Inbox after instances | 🟠 | Chat load order |
| SQL Waterfall | Correlated subqueries per row | 🔴 | chatController |
| React Waterfall | Auth loading → blank shell | 🟠 | AuthGuard |
| Worker Waterfall | SLA per-row | 🟠 | sla worker |
| Socket Waterfall | Multi-connect race F1 OFF | 🔴 | dual io |
| Cache Waterfall | Persist after idle (OK) | 🟢 | defer intentional |
| Bootstrap Waterfall | me→features→flags | 🔴 | same as auth |

---

# 13 — Duplicate Matrix

| Recurso | Qtd típica callers/paths | Onde |
|---|---|---|
| `/api/chat/instances` | **2–3** | Unread, Floating, Chat |
| `/api/me/tenant/company` | **até 2** | Brand, Settings company |
| Conversations list | RQ Float + Store + prefetch | dual SoT |
| Messages | RQ Float dump + Store + IDB | dual SoT |
| Socket connection | **1** (F1 ON) / **2–4** (OFF) | Bridge vs pages |
| Attendance counts | Unread + Chat ops | shell/page |
| Clients/Leads | Clients page + **Chat mount** | Chat.tsx:2281-2282 |
| Permissions | 1 shell | ModulePermissions |
| Migration flags | 1 auth | AuthProvider |
| Middleware auth SQL | 1×/request | tenantAuthCrm (necessário) |

---

# 14 — Dependency Graph

```text
User click /chat
  → Auth already done
  → Chat mount effects
      → ensureChatInstances → chatService → GET /instances
          → Controller listInstances → SQL JOIN
      → loadInboxCommand → Repository → GET /conversations
          → middleware tenantAuthCrm → getConversations
              → aggregated OR legacy SQL
          → Store conversations/set
      → loadClients/Leads/Categories (paralelo CRM)
      → selection → loadMessagesCommand → GET messages → SQL → Store
      → Selectors → Hooks → Virtualization → Render
      → idle useConversationWarmup → loadMessages (cold)
  → Socket (já conectado) → Bridge → Store → memo rows

User logout
  → signOut → POST logout → clear caches → navigate login
```

---

# 15 — Runtime Heat Map

| Área | Heat | Nota |
|---|---|---|
| Frontend Chat page | 🔴 | Monólito + mount CRM |
| Frontend Shell bootstrap | 🟠 | Auth waterfall |
| Frontend Float | 🟠 | Dump + invalidate |
| Frontend Dashboard/CRM lists | 🟡 | Moderado |
| Backend Chat SQL | 🔴 | Correlacionados |
| Backend Workers | 🔴 | Densidade + SLA |
| Backend Logs | 🟠 | ~1705 console |
| Socket F1 ON | 🟡 | OK 1 node |
| Socket F1 OFF | 🔴 | Multi-io |
| Domain Store F6 | 🟢 | Controlado |
| Window/Warm cache | 🟢 | Benefício > custo |
| Cache overlap RQ∥Store | 🟠 | Duplicação |
| Redis | 🔴 | Ausente |
| Providers essentials | 🟡 | Brand/Unread sempre |

---

# 16 — Top Runtime Consumers (síntese Top 100 → Top 40 explícitos)

| # | Consumidor | Domínio | Score |
|---|---|---|---|
| 1 | Auth waterfall | HTTP/Bootstrap | 98 |
| 2 | SQL conversations legacy MAX | SQL | 97 |
| 3 | SQL messages comments agg | SQL | 96 |
| 4 | Chat.tsx | React | 95 |
| 5 | Multi-socket OFF | Socket | 94 |
| 6 | Instances multi-fetch | HTTP | 93 |
| 7 | Chat CRM mount loads | HTTP | 92 |
| 8 | Invalidate storms | RQ/HTTP | 91 |
| 9 | Announcement worker 4s | Worker | 90 |
| 10 | Chat SLA N+1 | Worker/SQL | 89 |
| 11 | Float message dump | Mem/HTTP | 88 |
| 12 | BE console volume | I/O | 87 |
| 13 | WS always-log emits | Socket/I/O | 86 |
| 14 | tenantAuthCrm/request | HTTP/SQL | 85 |
| 15 | Cache overlap | Mem | 84 |
| 16–25 | Avatar/scheduled/kanban/proposal/notif workers, inbox serialize, ClientProfile… | mix | 70–83 |
| 26–40 | Dashboard, finance family, appointments, warm prefetch tradeoff, settings dup company… | mix | 55–69 |
| 41–100 | CRUD long-tail / low-frequency admin | mix | ⚠ LIVE ranking por RPS |

Detalhe expandido: Cost Model §17.

---

# 17 — Runtime Cost Matrix

| Área | HTTP | SQL | React | Socket | CPU | Memória | Complexidade | Score |
|---|---|---|---|---|---|---|---|---|
| Bootstrap Auth | 9 | 5 | 3 | 0 | 4 | 2 | 6 | **9** |
| Shell Unread+Brand | 7 | 3 | 3 | 2 | 3 | 3 | 5 | **7** |
| Chat Inbox+Thread | 8 | 9 | 9 | 6 | 8 | 8 | 9 | **9** |
| Floating | 7 | 6 | 6 | 4 | 5 | 7 | 7 | **7** |
| Dashboard | 5 | 5 | 5 | 1 | 4 | 4 | 4 | **5** |
| CRM Clients/Leads | 5 | 5 | 6 | 1 | 5 | 5 | 5 | **5** |
| Financeiro | 6 | 6 | 5 | 1 | 5 | 4 | 6 | **6** |
| Agenda | 6 | 5 | 5 | 2 | 5 | 4 | 6 | **6** |
| Workers pack | 3 | 8 | 0 | 4 | 8 | 4 | 7 | **8** |
| Store F6 ON | 2 | 1 | 4 | 4 | 4 | 5 | 6 | **4** |
| Cache Window/Warm | 1 | 1 | 2 | 0 | 3 | 5 | 5 | **4** |

---

# 18 — Runtime Bottlenecks

| Bottleneck | Tipo | Evidência |
|---|---|---|
| Auth serial | HTTP waterfall | AuthContext |
| Chat.tsx monolito | React hotspot | ~7388 LOC |
| Legacy list/messages SQL | SQL hotspot | chatController |
| Dual path STORE OFF | Pipeline redundante | RQ+useState+patch |
| Multi-io | Socket hotspot | Chat fork |
| Workers no event loop HTTP | Contenção CPU | index.ts timers |
| Invalidate fan-out | Redundância HTTP | Chat/Float counts |
| Logs always-on workers/WS | I/O | console counts |

---

# 19 — Runtime Optimization Queue (NÃO IMPLEMENTAR)

| Item | Impacto | Benefício | Complexidade | Dependências | Risco | Rollback | Sprint |
|---|---|---|---|---|---|---|---|
| Canário `CHAT_SINGLE_SOCKET` | P0 | Sockets↓ | Ops | Staging | Baixo | Flag OFF | S1 |
| Canário Aggregated+Store+WS-patch | P1 | HTTP/SQL/inv↓ | Ops | QA Chat | Médio | Flags | S1 |
| Single-flight instances | P1 | HTTP↓ | Baixa | Registry | Baixo | PR revert | S2 |
| Lazy clients/leads no Chat | P1 | Payload↓ | Baixa | UX | Baixo | PR revert | S2 |
| Auth parallel/bundle | P1 | TTI↓ | Média | Auth API | Médio | Feature gate | S3 |
| Float latest-page | P2 | Mem↓ | Média | Store | Médio | Flag/PR | S3 |
| SQL messages/list reshape | P1 | p95↓ | Alta | API compat | Médio | dual path | S4 |
| Extrair workers | P2 | CPU API↑ | Alta | Deploy | Médio | dual deploy | S5 |
| Redis adapter F7 | Escala | Multi-node | Alta | Redis HA | Alto | sticky | S5 |
| Throttle logs BE | P2 | I/O↓ | Baixa | Observability | Baixo | revert | S1–S2 |
| Live baselines fill | P3 | Visibilidade | Baixa | Staging | Nenhum | — | S1 |

---

# 20 — Runtime Budget (distribuição relativa estimada)

> Orçamento **relativo** de esforço/custo em sessão CRM típica (Chat-heavy). ✅ juízo estático · ⚠ live calibra %.

| Fatia | % relativa est. | Notas |
|---|---|---|
| Bootstrap Auth+Permissions | 15–20% | Waterfall dominante TTI |
| Shell (brand/unread/socket/idle) | 10–15% | Contínuo |
| Chat HTTP+SQL+React | 30–40% | Maior fatia se /chat |
| Dashboard/CRM lists | 10–15% | |
| Financeiro/Agenda | 5–10% | Sob demanda |
| Workers (always-on node) | 10–20% CPU servidor | Independente UI |
| Socket fan-out | 5–10% | Cresce com CCU |
| Caches (overhead) | 3–5% | Trade por HTTP↓ |
| Logs I/O | 3–8% | Se verbosity alta |

---

# 21 — Runtime Risk Matrix

| ID | Problema | Prioridade |
|---|---|---|
| Defaults flags OFF em prod | Caminho legado caro | **P0** ops |
| Multi-socket | CCU×conexões | **P0** |
| Sem Redis multi-node | Escala horizontal | **P0** escala |
| Auth waterfall | TTI | **P1** |
| Instances duplicate | HTTP | **P1** |
| Chat CRM mount | Payload | **P1** |
| SQL correlacionado | Latência/CPU DB | **P1** |
| Invalidate storms | HTTP pós-WS | **P1** |
| Workers densos | Contenção API | **P2** |
| Logs verbosos | I/O | **P2** |
| Cache overlap | Memória | **P2** |
| Float dump | Mem/HTTP | **P2** |
| Chat monolito | Manutenção/render | **P3** |
| Dead code socket notifications | Higiene | **P3** |

---

# 22 — Evidências (índice)

| Afirmação | Evidência |
|---|---|
| Auth waterfall | `src/contexts/AuthContext.tsx:145,168,169` |
| Permissions | `ModulePermissionsContext.tsx:49` |
| Brand | `TenantBrandContext.tsx:34` |
| Unread | `useChatNavUnreadCount.ts:43,50-53` |
| Floating | `FloatingChatProvider.tsx:104-123` |
| Chat mount 4 loads | `Chat.tsx:2279-2284` |
| Inbox | `Chat.tsx:1143` |
| Dual socket | `Chat.tsx:1495,1520-1521,1535-1597` |
| Bridge→Store | `storeBootstrap.ts:65-67` |
| Invalidate counts | Chat 20 / FloatWindow 18 |
| SQL MAX / json_agg | `chatController.ts:6213+,6959+` |
| Attendance OK | `:6888-6905` |
| Workers | `index.ts:559-720` |
| WS backend | `websocketService.ts:21-443` |
| Logout HTTP+cache | `AuthContext.tsx:308-337`; `queryClient.ts:31-37` |
| Disconnect | `realtimeClient.ts:123-134` |
| Freeze | `chat/ADR-010-CHAT-ARCHITECTURE-FREEZE.md` |

---

# 23 — Classificação dos achados (método)

| Achado | Classificação |
|---|---|
| Waterfalls/dups HTTP estruturais | ✅ Evidência estática |
| SQL correlacionado | ✅ + ⚠ EXPLAIN |
| Multi-socket paths | ✅ |
| Worker intervalos | ✅ |
| Latências ms / payload bytes | ⚠ Network + Benchmark |
| Render counts / FPS | ⚠ React Profiler |
| Heap duplicação real | ⚠ Heap Snapshot |
| Index selectivity | ⚠ EXPLAIN |

---

# 24 — Veredito final

### Maturidade arquitetural

**Alta no núcleo Chat Enterprise (F5–F6 freeze)** quando flags canário estão ON.  
**Média–baixa no shell app-wide e no backend operacional** (workers/logs/SQL legado/flags OFF).

### Principais gargalos

1. Auth waterfall  
2. Chat mount + SQL list/messages  
3. Dual runtime (flags OFF)  
4. Workers no mesmo processo  
5. Multi-socket / falta Redis  

### Prioridades

1. **Ops P0:** canário F1+F4+F5(+F2)  
2. **Eng P1:** instances single-flight + lazy CRM Chat + auth TTI  
3. **Eng P1/P2:** SQL reshape + Float pages  
4. **Infra:** F7 Redis + isolar workers  

### Riscos

Flags OFF disfarçam regressão; otimizar Store freeze sem ADR; multi-réplica sem adapter.

### Prontidão para otimizações

**Pronta** para fila §19 — base factual suficiente.  
**Não pronta** para declarar % ganhos sem ⚠ live before/after.

### Roadmap recomendado (somente planejamento)

| Sprint | Foco |
|---|---|
| S1 | Flags canário + baselines live + log policy design |
| S2 | Instances dedupe + lazy Chat CRM |
| S3 | Auth TTI + Float latest-page |
| S4 | SQL list/messages |
| S5 | Workers isolation + F7 Redis kickoff |

### Assinatura da auditoria

| Campo | Valor |
|---|---|
| **Documento** | AUDIT_END_TO_END_RUNTIME_FLOW |
| **Status** | Completo (investigação estática E2E login→logout) |
| **Alterações no sistema** | Nenhuma |
| **Auditor** | Investigação automatizada evidenciada + síntese dos audits 2026-07-13/14 |
| **Data** | 2026-07-14 |
