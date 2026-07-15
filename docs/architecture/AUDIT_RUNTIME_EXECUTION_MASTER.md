# AUDIT — Runtime Execution, Bootstrap, Backend, Performance & Architecture

| Campo | Valor |
|---|---|
| **Documento** | AUDIT_RUNTIME_EXECUTION_MASTER |
| **Tipo** | investigation_only |
| **Prioridade** | Critical |
| **Data** | 2026-07-14 |
| **Escopo** | Frontend + Backend + Workers + APIs + Banco + WebSocket + Runtime |
| **Código / banco / flags / logs alterados** | **Nenhum** |
| **Método** | Análise estática do código-fonte com evidências `arquivo:linha`. **Sem** captura Network/Profiler/EXPLAIN ao vivo nesta sessão. |
| **Precedente** | [`AUDIT_APP_BOOTSTRAP_HYDRATION_PERFORMANCE.md`](./AUDIT_APP_BOOTSTRAP_HYDRATION_PERFORMANCE.md) |

---

## Resumo Executivo

A aplicação PainelCRM executa um **bootstrap autenticado em cascata serial**, depois um **fan-out paralelo no shell** e **tarefas idle**. O Chat Enterprise (F5–F6) concentra escrita de domínio no Domain Store quando `CHAT_CORE_STORE=ON`, mas o processo Node do backend mantém **19 timers in-process** + scripts/cron externos, **~1705 `console.*`** no backend, Socket.IO **single-node sem Redis**, e SQL de mensagens/lista legada com **subqueries correlacionadas por linha**.

### Conclusões com evidência

| ID | Conclusão | Evidência |
|---|---|---|
| C1 | Auth é waterfall de 3 HTTP sequenciais | `AuthContext.tsx:145→168→169` |
| C2 | Chat mount dispara 4 cargas em um effect | `Chat.tsx:2279-2284` |
| C3 | Instances podem ser pedidos por Unread + Floating + Chat | `useChatNavUnreadCount.ts:43`, `FloatingChatProvider.tsx:104-105`, `Chat.tsx:1052` |
| C4 | Dual socket se F1 OFF | `Chat.tsx:1495` / `1520-1521` vs `1535-1597` |
| C5 | Bridge → Store wired uma vez | `storeBootstrap.ts:65-67` |
| C6 | Lista conversas legada: `MAX(messages)` correlacionado | `chatController.ts:6213-6223` |
| C7 | Mensagens: `COUNT`/`json_agg` correlacionados | `chatController.ts:6959-6986` |
| C8 | Attendance-counts: 1 query agregada eficiente | `chatController.ts:6888-6905` |
| C9 | Backend sem Redis adapter | `websocketService.ts:21-43`; sem `@socket.io/redis-adapter` |
| C10 | ~19 workers `setInterval` no listen do server | `packages/backend/src/index.ts:559-720` |
| C11 | Backend ~1705 console.* (chatController sozinho 224) | rg count 2026-07-14 |
| C12 | Invalidate storms FE | `Chat.tsx` **20×**, `FloatingConversationWindow.tsx` **18×** |

### Veredito

| Dimensão | Status |
|---|---|
| Radiografia estrutural | **Completa (estática)** |
| Medição de latência real | **Não** — valores de tempo abaixo são **estimativas de ordem**, não milissegundos medidos |
| Pronto para otimização | **Sim** — plano §18 sem implementação |
| Multi-réplica WS | **Bloqueado** até F7 Redis |

---

# PARTE 1 — Bootstrap Runtime

## Fluxograma (Browser → Idle)

```text
Browser
  → main.tsx (StrictMode)                    [src/main.tsx]
  → App.tsx
      QueryClientProvider
        TooltipProvider
          BrowserRouter
            ThemeProvider
              AuthProvider                   ← BLOQUEIA AuthGuard
                ChatQueryPersistBridge       ← idle IndexedDB
                ModulePermissionsProvider
                  Routes
                    AuthGuard                ← espera Auth.loading
                      AppLayout/AppShell
                        FloatingChatDeferred ← idle / interaction
                        TenantBrandProvider
                        ChatNavUnreadScope
                        SidebarProvider
                        HeaderRealtimeBridge ← Socket
                        RequireModuleView
                          Page
                        idle: overlays / sidebar prefetch
```

## Ordem e dependências (quem espera quem)

| # | Fase | Bloqueia? | Depende de | Evidência |
|---|---|---|---|---|
| 1 | Theme localStorage | Não | — | `theme-provider.tsx` |
| 2 | `GET /api/auth/me` | **Sim** (Auth loading) | token | `AuthContext.tsx:145` |
| 3 | `GET /api/auth/me/features` | Sim (serial) | me OK | `:168` → `:184` |
| 4 | `GET /api/chat/migration-flags` | Sim (serial) | me OK | `:169` → `chatMigrationFlagManager.ts:67` |
| 5 | `GET /api/me/tenant/my-permissions` | Parcial | `user.id` | `ModulePermissionsContext.tsx:49` |
| 6 | AuthGuard libera shell | — | Auth !loading | `AuthGuard.tsx` |
| 7 | Brand `GET …/company` | Não p/ page | user tenant | `TenantBrandContext.tsx:34` |
| 8 | Unread instances+counts | Não | chat allowed | `useChatNavUnreadCount.ts:43,50` |
| 9 | Socket connect | Não | token | HeaderRealtimeBridge |
| 10 | Page mount | — | shell | rota |
| 11 | Idle Floating / Persist / Prefetch | Não | timeout/interaction | `FloatingChatDeferred`, `ChatQueryPersistBridge`, `AppShellSidebar` |

### Waterfall vs paralelismo

```text
SERIAL:   me → features → migration-flags
PARALLEL (após user): permissions ‖ brand ‖ unread ‖ page-mount ‖ socket
IDLE:     floating ‖ IDB persist ‖ search overlay ‖ sidebar warm
```

### Chat page paralelo adicional (evidência)

```2279:2284:src/pages/Chat.tsx
  useEffect(() => {
    loadInstances();
    loadClients();
    loadLeads();
    loadTicketCategories();
  }, [loadInstances, loadClients, loadLeads, loadTicketCategories]);
```

Inbox: `Chat.tsx:2369` → `loadConversations` → `loadInboxCommand` (`:1143`).

---

# PARTE 2 — HTTP Timeline

## Cold start autenticado (qualquer rota AppShell)

| Seq | Endpoint | Quem chamou | Bloqueante? | Cache? | Duplicável? | Necessário? |
|---|---|---|---|---|---|---|
| 1 | `GET /api/auth/me` | AuthProvider | **Sim** | Bearer session | Não | Sim |
| 2 | `GET /api/auth/me/features` | AuthProvider | Sim (serial) | — | Não | Sim |
| 3 | `GET /api/chat/migration-flags` | AuthProvider | Sim (serial) | memória flags | Não | Sim p/ chat opt |
| 4 | `GET /api/me/tenant/my-permissions` | ModulePermissions | Soft | — | Não | Sim |
| 5 | `GET /api/me/tenant/company` | TenantBrand | Não | — | **Sim c/ Settings** | Brand UI |
| 6 | `GET /api/chat/instances` | Unread | Não | RQ + registry TTL | **Alto** | Sim p/ unread |
| 7 | `GET /api/chat/conversations/attendance-counts` | Unread | Não | RQ | Médio | Badge |
| 8 | Socket handshake | Realtime | Não | — | multi se F1 OFF | Sim |

Tempo estimado: **serial auth 3× RTT** + paralelo shell. (Não medido aqui.)

## Por rota (além do shell)

### `/` HomeOrRedirect

| Endpoint | Quem | Necessário |
|---|---|---|
| auth cascade se logado | AuthProvider | Sim |
| Landing | UI | Sem CRM HTTP extra |

### `/dashboard`

| Endpoint | Quem | Evidência |
|---|---|---|
| `GET /api/dashboard/overview?preset=current_month` | Dashboard useQuery | `pages/Dashboard.tsx` (serviço overview) |

### `/chat`

| Endpoint | Quem | Evidência | Duplicado? |
|---|---|---|---|
| `GET /api/chat/runtime-config` | RQ | `Chat.tsx:893-896` → `chat.ts:923` | Baixo |
| `GET /api/chat/instances` | loadInstances | `Chat.tsx:1052`, `2279` | **Com Unread/Float** |
| Inbox aggregated/legacy | loadInboxCommand | `Chat.tsx:1143` | — |
| `GET /api/clients` | loadClients | `Chat.tsx:2249`, `2281` | **Ruído p/ thread** |
| `GET /api/leads` | loadLeads | `Chat.tsx:2259`, `2282` | **Ruído** |
| `GET /api/ticket-categories` | loadTicketCategories | `Chat.tsx:2270-2283` | Auxiliar |
| Messages (se seleção) | loadMessagesCommand | commands | — |
| attendance-counts (ops) | Chat / Unread | engine | Médio |

### `/clients` / `/leads`

| Rota | Endpoints |
|---|---|
| Clients | client-groups + clients (`Clients.tsx` useQuery) |
| Leads | lead-statuses + leads |

### `/settings`

| Endpoint | Nota |
|---|---|
| company | Pode **repetir** Brand (`TenantBrand` + CompanyDataSection) |

### Financeiro / demais

Finance: serviços financeiros no mount da página (`Finance.tsx` — `console.error` ungated `:80`). Não expandido SQL nesta radiografia além do padrão CRM auth.

## Timeline exemplo `/chat` (STORE ON, flags canário)

```text
Auth: me → features → flags → permissions
  ├─ brand company
  ├─ unread: instances → attendance-counts
  ├─ socket connect
  └─ Chat mount:
        ├─ runtime-config
        ├─ instances (possível 2º/3º)
        ├─ clients ‖ leads ‖ ticket-categories
        └─ loadInbox → (seleção) loadMessages
  idle:
        ├─ Floating instances+lists
        ├─ IDB persist
        └─ sidebar warm / predictive prefetch
```

---

# PARTE 3 — Backend Pipeline

## Chat HTTP pipeline (todos `/api/chat/*`)

```text
app.use('/api/chat', chatRoutes)          index.ts:428
  → ...tenantAuthCrm                      chatRoutes.ts:123
      1 authenticateToken                 auth.ts:23-61   (JWT + SQL user)
      2 setCurrentTenant                  auth.ts:108-123
      3 bindRequestContext                bindRequestContext.ts:9-15
      4 requireTenantForBusinessApp       auth.ts:166-178
      5 requireTenantCommercialAccess     auth.ts:276-344 (SQL tenants)
      6 requireActivePlanPeriod           auth.ts:351-383
      7 setRequestDb                      auth.ts:228-270 (RLS SET LOCAL)
  → requireFeature('chat')                auth.ts:199-216
  → Controller (chatController.ts)
  → Service / SQL pool.query
  → JSON response
```

### Middleware: redundância?

| Observação | Evidência |
|---|---|
| Auth **não** global — por router | `index.ts` mounts |
| Chat sempre reexecuta JWT+user SQL+tenant+plan | `tenantAuthCrm` cadeia 7 passos |
| Feature checada **depois** de plan/tenant | ordem chatRoutes |
| Agenda actions: **segundo** `requireFeature('agenda')` | chatRoutes.ts:217-225 |

Não há “double authenticateToken” no mesmo router; há **custo repetido por request** (esperado multi-tenant), não middleware duplicado no stack.

### Frontend → Backend (who calls)

| FE caller | Endpoint | Backend entry |
|---|---|---|
| AuthProvider | `/api/auth/me` | auth routes |
| AuthProvider | `/api/auth/me/features` | auth |
| bootstrapChatMigrationFlags | `/api/chat/migration-flags` | `getChatMigrationFlags` |
| chatService.listInstances | `/api/chat/instances` | `listInstances` |
| getConversationAttendanceCounts | `/conversations/attendance-counts` | `getConversationAttendanceCounts` |
| loadInbox / repository | `/conversations` | `getConversations` |
| getConversationMessages | `/conversations/:id/messages` | `getConversationMessages` |

---

# PARTE 4 — SQL (hotspots — evidências)

> Tempos = **não medidos**. Análise de padrão.

### `GET /conversations` — agregado (flag ON)

| Aspecto | Detalhe | Evidência |
|---|---|---|
| Query | 1 SELECT + joins + LATERAL contacts | `queryBuilder.ts:287-312` |
| Tags | 1 batch `attachKanbanTags` | `listService.ts:35-75` |
| Risco N+1 async | loop `fetchInstanceForOperate` | `listService.ts:91-97` |
| LIMIT / ORDER | agregador + COALESCE last_message | queryBuilder |

### `GET /conversations` — legado

| Aspecto | Detalhe | Evidência |
|---|---|---|
| N+1 SQL | `(SELECT MAX(...) FROM chat_messages m WHERE m.conversation_id = c.id)` **por linha** | `chatController.ts:6213-6223` |
| Subquery lead | nested SELECT status | `:6331-6336` |
| LIMIT | 200 | `:6490-6504` |
| Follow-up | `SELECT tenant_id FROM users` | `:6585-6588` |

### `GET /attendance-counts`

| Aspecto | Detalhe |
|---|---|
| Padrão | **1** `COUNT(*) FILTER` + JOIN instances | `:6888-6905` |
| N+1 | Não |

### `GET /instances`

| Aspecto | Detalhe |
|---|---|
| Padrão | 1 query JOIN users | `chatInstanceAccess.ts:58-74` |

### `GET /conversations/:id/messages`

| Aspecto | Detalhe | Evidência |
|---|---|---|
| Access | 1 SELECT + predicate | `:6927-6934` |
| N+1 correlacionado | `COUNT` comments + `json_agg` **por mensagem** | `:6959-6986` |
| LIMIT | 200 + reverse JS | `:7002-7011` |

### Cache SQL possível (orientação, sem implementar)

| Endpoint | Cache candidato |
|---|---|
| instances | registry TTL F3 + RQ (já) |
| attendance-counts | Unread engine incremental |
| conversations list | agregado + frontend Store |
| messages | Window Cache FE; BE page API F6 |

---

# PARTE 5 — React Runtime

| Camada | Quem | Evidência |
|---|---|---|
| Mount shell | AppShell tree | `AppShell.tsx` |
| Auth state | AuthProvider setState | AuthContext |
| Chat re-renders | Domain Store notify → hooks | `useStableSelector` F6.5 |
| Virt conversas | Conversation Virtual Engine | F6.3 |
| Virt mensagens | Message Virtual Engine (core) / TanStack (legacy) | F6.4 |
| Memo rows | ChatConversationRow / ChatMessageRow | F6.5 |
| Inevitáveis | seleção conversa, WS message na thread ativa, scroll virt | — |
| Redundantes (risco) | Chat.tsx monolítico + invalidate→RQ refetch STORE OFF; StrictMode double mount DEV | — |

Quantidades exactas de render = **não medidas** (requer Profiler). Proxies: `CHAT_CORE_METRICS` + `renderOptimizationMetrics`.

---

# PARTE 6 — React Query

| Item | Valor / evidência |
|---|---|
| Config | stale 5m, gc 15m, retry 1, refetch focus/mount/reconnect **false** — `queryClient.ts` |
| Persist | idle `ChatQueryPersistBridge`; IndexedDB allowlist chat — `chatPersistentCache.ts` |
| Keys chat | `['chat','instances']`, `['chat','nav-unread']`, `['floating-chat',…]` |
| Prefetch | sidebar idle + `prefetchFloatingChatLists` (`floatingChatQueries.ts:44-72`) |
| Invalidate alto | Chat.tsx **20**, FloatingConversationWindow **18**, Mobile overlay ~13 |
| Candidatos Store | floating messages/list quando STORE ON (já parcial); unread após F3 |

---

# PARTE 7 — Domain Store

```text
Commands / Bridge sync / consolidation
  → dispatch / dispatchBatch
  → reduceChatDomainState
  → subscribers (useStableSelector skip se equal)
  → Hooks UI
Cursor / Window Cache / Virt slices / Prefetch (read + loadMessagesCommand)
```

| Quem escreve | Commands, `syncStoreFromSocketEvent`, virt window actions |
|---|---|
| Quem lê | `store/public` hooks |
| Bypass STORE ON | Float `latestPage:false`; satellites |
| useState paralelo | Chat muted (`isChatStoreSourceOfTruth`) |
| RQ paralelo | shell unread keys; Float OFF |
| Wire Bridge | `storeBootstrap.ts:65-67` → enqueue → `syncStoreFromSocketEvent` |

Freeze: [`chat/DOMAIN_STORE_FREEZE.md`](./chat/DOMAIN_STORE_FREEZE.md).

---

# PARTE 8 — WebSocket

## Frontend

| Path | Quando | Evidência |
|---|---|---|
| Shared Bridge | `CHAT_SINGLE_SOCKET` ON | `bridge.ts:226`, `Chat.tsx:1520-1521` |
| Dedicated Chat `io()` | Flag OFF | `Chat.tsx:1535-1597` |
| realtimeClient legacy | Shared null | `realtimeClient.ts` |
| ClientProfile / Kanban | Flag OFF | hooks pages |
| HeaderRealtimeBridge | Shell | AppShellRealtime |
| useNotifications | **Dead code** | sem imports |
| Domain handlers | STORE ON | `storeBootstrap.ts:65-67` |

## Backend

| Item | Evidência |
|---|---|
| Init | `websocketService.ts:21-43` |
| Auth + SQL user | `:46-113` |
| Rooms `user:` / `tenant:` | `:158-168` |
| Emits conversation/message/attendance | `:295-443` |
| Redis adapter | **Ausente** |

### Storms

- Multi-`io()` × pages (F1 OFF)
- `emitConversationUpdate` **always logs** (`:318-347`)
- FE invalidate após events se patch OFF

---

# PARTE 9 — Workers

## In-process (`index.ts` listen ~559–720)

| # | Worker | Intervalo típico | SQL | HTTP | Logs |
|---|---|---|---|---|---|
| 1 | Feature flags refresh | 120s | Sim | — | Sim |
| 2 | Kanban scheduled moves | 30s | Sim | — | Sim |
| 3 | Proposal webhooks | 60s | Sim | Sim | Sim |
| 4–5 | Notification outbound retries | poll env | Sim | Sim | Sim |
| 6 | Invoice digest | flag+poll | Sim | — | — |
| 7 | Billing overdue sync | 5 min | Sim | — | Sim |
| 8 | Trial expiring | 6h | Sim | — | Sim |
| 9 | Announcements WA | 4s | Sim | Sim | Sim |
| 10 | Agenda reminders | 60s | Sim | Sim | — |
| 11 | Agenda automation | 5 min | Sim | — | — |
| 12 | **Chat SLA** | 120s | Sim + **N+1 per-row** | notify/WS | Sim (`chatSlaWorkerService.ts:188-270`) |
| 13 | Chat scheduled messages | 30s | Sim | UazAPI | JSON logs |
| 14 | WA Official campaigns | flag | Sim | Graph | — |
| 15 | WhatsApp avatar cache | interval worker | Sim | CDN | **verboso** |
| 16 | Ticket auto-resolve | 24h | Sim | — | Sim |
| 17–19 | Trial recovery/engagement/expiration | 1h–24h | Sim | — | Sim |

## Standalone scripts

`runRecurringWorker`, `runRecurringScheduler`, `runOutboxPublisherWorker`, reconciliations, `cancelExpiredBillings`, etc. — **SQL + side effects**; não na lista HTTP.

**Sem Bull/Agenda** na codebase backend.

---

# PARTE 10 — Cache

| Camada | Primário? | Rollback? | Sobreposição |
|---|---|---|---|
| Domain Store | **Sim** se STORE ON | — | vs RQ |
| React Query | Shell/Float/Dashboard | Sim se STORE OFF | vs Store/IDB |
| IndexedDB persist | Warm reload | — | subset RQ |
| Window Cache | Messages residente | — | Store-internal |
| Warm Window | Prefetch IDs | — | vs Window |
| Instance registry | TTL instances | — | vs RQ instances |
| Browser HTTP | Fraco (APIs auth) | — | — |
| Redis | **Não existe** | — | Futuro F7 |

Obsoleto relativo: chatPageCache + Float dump quando Store canário estável.

---

# PARTE 11 — Feature Flags

| Flag | Default | Quem usa | Remover |
|---|---|---|---|
| `CHAT_SINGLE_SOCKET` | OFF | bridge, Chat, Profile, Kanban | Pós-canário F1 / pós-F7 sticky |
| `CHAT_WS_PATCH_*` (5) | OFF | ws-patch / invalidate bypass | Pós-F2 |
| `CHAT_INSTANCE_REGISTRY` | OFF | ensureChatInstances | Pós-F3 |
| `CHAT_UNREAD_ENGINE` | OFF | unread-engine | Pós-F3 |
| `CHAT_ATTENDANCE_RECONCILE` | OFF | reconcile | Pós-F3 |
| `CHAT_AGGREGATED_*` | OFF | repository surfaces | Pós-F4b |
| `CHAT_CORE_STORE` | OFF | Domain Store SoT | Pós-canário F6 |
| `CHAT_CORE_METRICS` | OFF | metrics DEV | Manter DEV |
| `CHAT_INBOX_CURSOR` | stub false | — | Consolidar |
| `CHAT_REDIS_WS` | stub false | F7 | Após F7 |
| `VITE_CHAT_PERSIST_CACHE` | prod ON / dev OFF | IDB | Manter |

Catálogo: `src/lib/chatMigrationFlags/catalog.ts`. Audit: [`chat/FEATURE_FLAGS_AUDIT.md`](./chat/FEATURE_FLAGS_AUDIT.md).

---

# PARTE 12 — Backend Logs

| Escopo | Quantidade aprox. | Evidência |
|---|---|---|
| `packages/backend/src` `console.*` | **~1705** / ~317 files | rg 2026-07-14 |
| `chatController.ts` | **224** | top file |
| `index.ts` | 39 | startup + workers |
| `websocketService.ts` | 30 | connect + emits |

### Tabela (amostra crítica)

| Área | Qtd | Nível | Pode reduzir? | Motivo |
|---|---|---|---|---|
| chatController | 224 | misturado | **Sim** | Erros + debug em hot path |
| websocket emits | 30 | info/always | **Sim** | `emitConversationUpdate` always logs |
| avatar cache worker | vários | log cycle | **Sim** | `whatsappAvatarCacheWorker.ts` cycles |
| announcement worker | poll 4s | + HTTP | Médio | Volume se fila cheia |
| request log `/api` | por request | INFO mid | Ops | middleware `/api` |
| catch controllers | widespread | error | Manter | Necessário |

Produção: **sem** feature-flag global de silêncio para workers — logs podem ser **sempre-on**.

---

# PARTE 13 — Frontend Logs

### Gated (exemplo)

| Arquivo | Condição |
|---|---|
| `bridge.ts:61-64` | `if (!import.meta.env.DEV) return` |
| `Chat.tsx:1529-1533` | DEV `console.info` socket |
| metrics Prefetch/Render | `CHAT_CORE_METRICS` + DEV |

### Ungated (amostra evidenciada)

| Arquivo:Linha | Tipo |
|---|---|
| `AuthContext.tsx:176` | error fetch user |
| `Chat.tsx:1062` | error instances |
| `Finance.tsx:80` | error finance |
| `Clients.tsx:415` | error tasks |
| `StoreSettings.tsx:26` | error loja |
| `NotFound.tsx:8` | error |
| `ProposalTemplates.tsx:47` | error |
| `ClientGroupsSection.tsx:54` | error |
| `AddConnectionDialog.tsx:117` | error |
| `InstancesList.tsx:70` | error |

Impacto: baixo CPU; ruído DevTools / agentes de log se capturam console.

---

# PARTE 14 — Performance & priorização

## Gargalos (estruturais)

1. Waterfall auth 3 hops  
2. Instances multi-fetch  
3. Chat mount CRM lists  
4. SQL correlacionado messages/list legacy  
5. Multi-socket F1 OFF  
6. Invalidate storms  
7. Workers densos no mesmo processo HTTP  
8. Logs verbosos BE  
9. Chat.tsx monolith render surface  
10. Sem Redis → teto horizontal  

## Classificação

### P0

| ID | Problema |
|---|---|
| P0-1 | `CHAT_SINGLE_SOCKET` OFF → multi `io()` |
| P0-2 | Sem Redis adapter (multi-host) |

### P1

| ID | Problema |
|---|---|
| P1-1 | Auth waterfall serial |
| P1-2 | Instances 2–3× |
| P1-3 | Chat carrega clients/leads/categories no mount |
| P1-4 | SQL N+1 correlacionado messages / list legacy |
| P1-5 | Invalidate storms + flags OFF |
| P1-6 | Chat SLA worker per-row SQL |

### P2

| ID | Problema |
|---|---|
| P2-1 | Brand/Unread em todas rotas shell |
| P2-2 | Company request duplicável |
| P2-3 | Float dump `latestPage:false` |
| P2-4 | Backend console volume / websocket always-log |
| P2-5 | Avatar/announce workers verbosos |

### P3

| ID | Problema |
|---|---|
| P3-1 | Dead `useNotifications` / stub flags |
| P3-2 | Live Network fill baselines |
| P3-3 | Tipagem Commands drift |

---

# PARTE 15 — Escalabilidade

| CCU / escala | Frontend | Backend HTTP | Socket | Banco | Workers |
|---|---|---|---|---|---|
| 10 | OK | OK | OK single | OK | OK |
| 100 | OK c/ flags ON | OK | OK 1 node | Monitor list SQL | OK |
| 500 | Precisa STORE+virt+agg | Agregado ON | Sticky 1 node limite | N+1 legacy risco | Contenção CPU c/ 19 timers |
| 1000 | Canário F6 obrigatório | Pool + agg | **F7 necessário** p/ multi-node | Indexes + page | Separar workers |
| 5000–10000 | Não certificado | Read replicas / rate | Redis fan-out | Partition/tuning | Processos dedicados |

Alinhado a `AUDIT_CHAT_SCALE_READINESS.md`.

---

# PARTE 16 — Arquitetura (diagrama mestre)

```text
[Browser]
   Providers → Shell → Pages
        │ HTTP (apiClient)
        ▼
[Express] middleware → tenantAuthCrm → feature → Controllers
        │                                │
        │                                ▼
        │                         PostgreSQL (pool)
        │
        ├── Socket.IO (single process) ←→ Bridge/legacy io()
        │         │
        │         ▼
        │   Domain Store ← Commands ← UI
        │
        └── setInterval Workers (chat SLA, billing, WA, agenda…)
                 │
                 ▼
              SQL / HTTP externos / emit WS

[Futuro F7] Redis adapter ── fan-out multi-node
[Flags] Super Admin catalog gateia paths FE/BE
[Cache] RQ ‖ Store ‖ IDB ‖ Window ‖ Warm
```

---

# PARTE 17 — Evidências (índice rápido)

| Afirmação | Arquivo:Linha |
|---|---|
| me→features→flags | `AuthContext.tsx:145,168,169` |
| permissions | `ModulePermissionsContext.tsx:49` |
| brand company | `TenantBrandContext.tsx:34` |
| unread instances+counts | `useChatNavUnreadCount.ts:43,50-53` |
| Floating instances+prefetch | `FloatingChatProvider.tsx:104-105,120-123` |
| Chat mount 4 loads | `Chat.tsx:2279-2284` |
| inbox command | `Chat.tsx:1143` |
| shared vs dedicated socket | `Chat.tsx:1495,1520-1521,1535-1597` |
| Bridge subscribe store | `storeBootstrap.ts:65-67` |
| invalidate counts | Chat 20 / FloatWindow 18 |
| tenantAuthCrm | `auth.ts:414-422` + steps 23-383 |
| requireFeature chat | `chatRoutes.ts:123-124` |
| list legacy MAX(messages) | `chatController.ts:6213-6223` |
| messages correlated comments | `chatController.ts:6959-6986` |
| attendance aggregate | `chatController.ts:6888-6905` |
| WS rooms/emits | `websocketService.ts:158-443` |
| workers start | `index.ts:559-720` |
| console BE volume | ~1705; chatController 224 |

---

# PARTE 18 — Plano de otimização (NÃO IMPLEMENTAR)

| ID | Problema | Impacto | Complexidade | Benefício | Prioridade | Dependências |
|---|---|---|---|---|---|---|
| O1 | Parallelizar/bundlar auth bootstrap | TTI | Média | Alto | P1 | Auth API |
| O2 | Single-flight instances | HTTP | Baixa | Alto | P1 | Registry/RQ |
| O3 | Lazy clients/leads no Chat | Payload | Baixa | Alto | P1 | Chat UX |
| O4 | Canário flags F1+F2+F4+F5 | HTTP/WS | Ops | Muito alto | P0/P1 | Super Admin |
| O5 | Page/comments SQL sem correlacionados | Latência BE | Alta | Alto | P1 | API messages |
| O6 | Forçar aggregated list | SQL | Média | Alto | P1 | F4 flags |
| O7 | Extrair workers do processo HTTP | CPU | Alta | Médio–Alto | P2 | Deploy |
| O8 | Reduzir logs WS/workers | I/O | Baixa | Médio | P2 | Observability |
| O9 | Float latest-page | Mem/HTTP | Média | Médio | P2 | F6 Store |
| O10 | Redis adapter F7 | Escala WS | Alta | Crítico escala | P0 escala | Infra Redis |
| O11 | Separar Chat.tsx | Render | Muito alta | Médio | P3 | Freeze ADR |
| O12 | Fill live baselines | Visibilidade | Baixa | Alto ops | P3 | Staging |

---

## Inventários consolidados (pointer)

| Tema | Onde aprofundar |
|---|---|
| Bootstrap providers | §1 + AUDIT_APP_BOOTSTRAP… |
| HTTP | §2 |
| Backend/SQL | §3–4 |
| React/RQ/Store | §5–7 |
| Socket/Workers/Cache | §8–10 |
| Flags/Logs | §11–13 |
| Freeze contratos Chat | `chat/F6_ARCHITECTURE_FREEZE_REPORT.md`, ADR-010 |

---

## Assinatura

| Campo | Valor |
|---|---|
| **Status** | Radiografia investigativa completa (estática) |
| **Alterações** | Nenhuma |
| **Limite** | Sem milissegundos/FPS/EXPLAIN ao vivo — marcar fill staging |
| **Uso** | Base factual para sprints de otimização **futuras** (fora deste documento) |
