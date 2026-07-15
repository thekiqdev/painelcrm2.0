# AUDIT — Application Bootstrap, Hydration & Performance

| Campo | Valor |
|---|---|
| **Documento** | AUDIT_APP_BOOTSTRAP_HYDRATION_PERFORMANCE |
| **Tipo** | investigation_only |
| **Prioridade** | Critical |
| **Data** | 2026-07-13 |
| **Escopo** | Aplicação inteira (FE + BE + integrações) — **não** limitado ao Chat Core |
| **Código alterado** | **Nenhum** |
| **Método** | Análise estática de código + inventários de flags/docs F5–F6; **sem** corrida Network/Profiler ao vivo nesta auditoria |

---

## Resumo executivo

A aplicação hidrata em **cascata autenticada** (Auth → Features → Migration Flags → Permissions → Shell), depois **deferral idle** (Floating Chat, persist RQ IndexedDB, overlays, MetaPixel) e **prefetch oportunista** na sidebar. O Chat Enterprise (F5–F6) já concentra SoT no Domain Store quando `CHAT_CORE_STORE=ON`, mas a **shell CRM ainda dispara HTTP paralelo** (brand, unread/instances, clients/leads no mount do Chat) e mantém **dual-path** amplo com flags OFF.

### Achados críticos (P0/P1)

| ID | Achado | Impacto |
|---|---|---|
| P0-1 | Múltiplos caminhos Socket.IO se `CHAT_SINGLE_SOCKET=OFF` (Chat / ClientProfile / Kanban / realtimeClient) | CCU × sockets; reconexão storm |
| P0-2 | Sem Redis adapter no backend — WS single-process | Bloqueia multi-réplica (já na F7) |
| P1-1 | Waterfall auth: `/me` → `/me/features` → `/chat/migration-flags` → `/me/tenant/my-permissions` | TTI shell atrasado serialmente |
| P1-2 | Possível **triplicação** de `/api/chat/instances` (Unread + Floating + Chat page / registry) | HTTP redundante no warm start |
| P1-3 | Chat.tsx monta ainda carrega **clients + leads + ticket-categories** em paralelo ao inbox | Payload/CRM amplo na abertura `/chat` |
| P1-4 | Storms de `invalidateQueries` em Chat/Floating quando WS-patch OFF | HTTP após mutação/WS |
| P1-5 | Overlay SoT: RQ + Domain Store + chatPageCache + IndexedDB persist + Window Cache | Sobreposição de caches |

### Veredito operacional

| Dimensão | Avaliação |
|---|---|
| Bootstrap estrutural | **Compreensível e deferrado** — bom uso de idle |
| Hidratação autenticada | **Waterfall serial** — principal custo de cold start |
| Chat STORE ON | **Arquitetura F6 sólida**; shell/satellites ainda ruidosos |
| Produção default flags | Catalog **OFF** → comportamento legado caro até Super Admin ligar flags |
| Multi-host WS | **Não pronto** sem F7 |
| Live metrics fill | **Pendente** staging (esta auditoria é estática) |

---

## Fluxograma completo da aplicação

```text
Browser
  │
  ▼
main.tsx (StrictMode)
  │
  ▼
App.tsx
  QueryClientProvider
    TooltipProvider
      BrowserRouter
        ThemeProvider
          AuthProvider ──► GET /api/auth/me → features → chat/migration-flags
            ChatQueryPersistBridge (idle IndexedDB)
            ModulePermissionsProvider ──► GET /api/me/tenant/my-permissions
              Routes
                AuthGuard (sem HTTP)
                  AppLayout / AppShell
                    FloatingChatDeferred (idle) → FloatingChatProvider → instances + lists
                    TenantBrandProvider → GET /api/me/tenant/company
                    ChatNavUnreadProvider → instances + attendance-counts
                    Sidebar idle prefetch → dashboard/tasks/chat warm
                    HeaderRealtimeBridge → Socket.IO
                    RequireModuleView (sem HTTP)
                      Page (/dashboard | /chat | /clients | /leads | /settings | …)
```

Backend (request CRM típico):

```text
HTTP
  → helmet/cors/json/rate-limit/log
  → route mount
  → tenantAuthCrm (authenticate → tenant → plan → db)
  → requireFeature / requirePermission (quando aplicável)
  → controller → service → PostgreSQL pool.query
```

Realtime:

```text
Socket.IO (single Server, sem Redis)
  ← JWT handshake
  → rooms / emit
Frontend: useRealtimeEvents / ChatRealtimeBridge / (legado io() por superfície)
```

---

## Bootstrap Timeline

### Cold start autenticado (rota tipicamente `/dashboard` ou `/chat`)

| T | Fase | Quem | HTTP / trabalho |
|---|---|---|---|
| T0 | Paint React | `main` → `App` | — |
| T1 | Auth | `AuthProvider` | `GET /api/auth/me` |
| T2 | Features | `AuthProvider` | `GET /api/auth/me/features` |
| T3 | Chat flags | `AuthProvider` | `GET /api/chat/migration-flags` |
| T4 | Permissions | `ModulePermissionsProvider` | `GET /api/me/tenant/my-permissions` |
| T5 | Shell ready | `AppShell` | — |
| T6 | Brand | `TenantBrandProvider` | `GET /api/me/tenant/company` (tenant não-superadmin) |
| T7 | Unread | `ChatNavUnreadProvider` | instances + `attendance-counts` |
| T8 | Realtime | `HeaderRealtimeBridge` | Socket connect |
| T9 | Page | Route component | ver mapa de rotas |
| T10+ | Idle (1.5–5s) | Persist / Floating / Overlays / MetaPixel / Sidebar prefetch | IndexedDB; floating lists; dashboard/tasks/chat warm |

### Ordem e dependências

```text
me ──► features ──► migration-flags     (serial no Auth)
user.id ──► my-permissions              (paralelo após user)
user.tenant ──► company brand
chat allowed ──► unread (instances + counts)
Floating armed ──► instances + floating conversations
Chat page ──► runtime-config + instances + inbox (+ clients/leads/categories)
```

| Padrão | Presente? |
|---|---|
| Paralelismo pós-auth | Parcial (brand ‖ unread ‖ page) |
| Waterfall autenticado | **Sim** (me → features → flags) |
| Request bloqueando outro | Auth `loading` bloqueia AuthGuard → shell |
| Duplicata instances | **Risco alto** (Unread + Float + Chat) |
| Provider disparando HTTP não usado pela página | Brand/Unread em **todas** rotas AppShell |

---

## Inventário de Providers

| Provider | Onde monta | Quando | HTTP / side-effect | Context |
|---|---|---|---|---|
| `QueryClientProvider` | `App.tsx` | sempre | — | RQ |
| `TooltipProvider` | `App.tsx` | sempre | — | Radix |
| `ThemeProvider` | `App.tsx` | sempre | localStorage tema | theme |
| `AuthProvider` | `App.tsx` | sempre | me / features / migration-flags | auth |
| `ModulePermissionsProvider` | `App.tsx` | c/ user | my-permissions | modules |
| `ChatQueryPersistBridge` | `App.tsx` | idle | IndexedDB persist | — |
| `MetaPixelTrackingBridge` | `App.tsx` | idle | pixel | — |
| `FloatingChatDeferred`→`Provider` | `AppShell` | idle/interaction | instances + lists | floating |
| `TenantBrandProvider` | `AppShell` | shell | company | brand |
| `GlobalSearchSlotProvider` | `AppShell` | shell | — | search slot |
| `ChatNavUnreadProvider` | `AppShell` | chat allowed | instances + counts | unread |
| `SidebarProvider` | `AppShell` | shell | — | sidebar UI |
| `MobileShellChromeProvider` | `AppShell` | shell | — | mobile chrome |
| `SettingsLayoutContext` | Settings routes | settings | — | section |
| `TenantDetailProvider` | Superadmin | tenant detail | superadmin tenant | — |
| `FinanceMobileChromeProvider` | Finance | finance | — | chrome |

### Detecções

| Achado | Severidade |
|---|---|
| Brand + Unread em **toda** rota AppShell (mesmo Settings) | P2 |
| Floating montado (deferred) em **toda** shell — prefetch após idle | P2 |
| StrictMode → double effect DEV (parece duplicata HTTP em DEV) | P3 (esperado) |
| Providers de chrome sem HTTP — OK | — |
| Nested QueryClient **não** encontrado | OK |

---

## Inventário HTTP

### Cliente

- `src/integrations/api/client.ts` — **fetch**, Bearer token, **sem axios**
- Retry HTTP: nenhum (só RQ `retry: 1`)
- Cancel: `AbortSignal` suportado
- Tenant: **server-side** (`setCurrentTenant`), sem header tenant no client

### RQ defaults (`src/lib/queryClient.ts`)

| Opção | Valor |
|---|---|
| staleTime | 5 min |
| gcTime | 15 min |
| retry | 1 |
| refetchOnWindowFocus/Mount/Reconnect | **false** |

### Bootstrap / shell (estimativa estática)

| Endpoint | Disparado por |
|---|---|
| `GET /api/auth/me` | AuthProvider |
| `GET /api/auth/me/features` | AuthProvider |
| `GET /api/chat/migration-flags` | AuthProvider |
| `GET /api/me/tenant/my-permissions` | ModulePermissionsProvider |
| `GET /api/me/tenant/company` | TenantBrandProvider (+ Settings company) |
| `GET /api/chat/instances` | Unread / Floating / Chat / registry |
| `GET /api/chat/conversations/attendance-counts` | Unread (+ Chat) |
| Aggregated/legacy conversations | Floating prefetch / Chat inbox |

### Por rota (além do shell)

| Rota | Página | HTTP típico de mount |
|---|---|---|
| `/` | HomeOrRedirect / Landing | só auth se logado; landing UI |
| `/dashboard` | `Dashboard.tsx` | `GET /api/dashboard/overview?preset=current_month` |
| `/chat` | `Chat.tsx` | `runtime-config`, instances, inbox (`loadInboxCommand`), **clients**, **leads**, ticket-categories; msgs se selecionada |
| `/clients` | `Clients.tsx` | client-groups + clients |
| `/leads` | `Leads.tsx` | lead-statuses + leads |
| `/settings` | Company default | company (pode **duplicar** brand) |

### Riscos HTTP

| Risco | Tipo |
|---|---|
| Waterfall auth 3 hops | serial |
| Instances N× superfícies | duplicata |
| Chat carrega CRM clients/leads na abertura | desnecessário p/ thr ead |
| Company 2× (Brand + Settings) | duplicata |
| Invalidates Chat/Floating (~20/arquivo) | churn |
| Agregado OFF → N+1 getConversations | N+1 clássico |

---

## Inventário Backend

### Middleware (`packages/backend/src/index.ts`)

Ordem aproximada: helmet → cors → webhooks raw → json → correlationId → static → rate limits → health → request log `/api` → routers.

**Auth não é global** — por router. CRM tipicamente:

```text
authenticateToken → setCurrentTenant → bindRequestContext
→ requireTenantForBusinessApp → requireTenantCommercialAccess
→ requireActivePlanPeriod → setRequestDb
(+ requireFeature / requirePermission)
```

Chat: `tenantAuthCrm` + `requireFeature('chat')`.

### Serviços / controllers

- Controllers finos + services + `pool.query` (PostgreSQL)
- Chat: aggregated conversations service (F4), distribution, SLA workers, avatar cache worker
- Logs: muitos `console.log/error/warn` em workers e controllers (não structured logger único)

### Socket.IO

| Item | Estado |
|---|---|
| Init | `initializeWebSocket(httpServer)` |
| Adapter Redis | **Ausente** |
| Auth | JWT handshake |

---

## Inventário React

| Tema | Observação |
|---|---|
| StrictMode | ON em `main.tsx` — double mount DEV |
| App grande | `Chat.tsx` monolítico — alto custo de re-render residual mesmo com F6.5 |
| Memo F6 | `ChatConversationRow` / `ChatMessageRow` + virt |
| Effects | Selection sync store; virt measure/scroll; idle arms |
| Props instáveis | Mitigado F6.5 selectors; Chat ainda cria closures/handlers massivos |
| Estado duplicado STORE ON | `useState` muted em Chat; reads via hooks |

Não foi medido FPS/commit ao vivo nesta auditoria.

---

## Inventário React Query

### Keys principais

| Domínio | Keys |
|---|---|
| Chat instances | `['chat','instances', tenant, user]` |
| Nav unread | `['chat','nav-unread', …]` |
| Floating | `['floating-chat', conversations\|messages\|bubble-recent\|…]` |
| Clients | `['clients','list', …]` |
| Leads | `['leads', …]` |
| Dashboard | overview query em Dashboard |
| Tasks | `src/lib/queryKeys/tasks.ts` |

### Persist

- `ChatQueryPersistBridge` → IndexedDB (prod ON default; DEV OFF default via `VITE_CHAT_PERSIST_CACHE`)
- Allowlist: instances, nav-unread, floating conversations/messages/meta

### Problemas

| Achado | Severidade |
|---|---|
| Invalidates amplos `floating-chat` / clients / leads | P1 |
| Keys paralelas instances (registry vs RQ vs connected-instances) | P1 |
| Dual SoT RQ vs Domain Store (flags OFF / Float dump) | P1 |
| Prefetch idle + page fetch podem sobrepor | P2 |

---

## Inventário Domain Store

| Quem escreve (STORE ON) | Commands, Bridge sync, consolidation |
|---|---|
| Quem lê | Hooks `store/public` |
| Bypass STORE ON | Float dump `latestPage:false`; satellites Kanban/Lead; UI muted useState |
| useState paralelo | Chat.tsx muted; Float local UI state (painéis) OK |
| RQ paralelo | Float/Chat OFF paths; shell unread pode ainda usar RQ |
| Cache próprio residual | chatPageCache, persist IndexedDB |

Ver também [`DOMAIN_STORE_FREEZE.md`](./chat/DOMAIN_STORE_FREEZE.md) / F6 freeze.

---

## Inventário Cache

| Camada | Conteúdo | Sobreposição |
|---|---|---|
| Browser / HTTP | Browser HTTP cache | Baixa (APIs auth) |
| React Query | lists / floating / dashboard | **Alta** vs Store |
| Domain Store | SoT chat | Primária se flag ON |
| IndexedDB RQ persist | subset chat keys | vs RQ memory |
| chatPageCache | page conversations/messages | legado |
| Window Cache F6.2 | pages residentes | Store-internal |
| Warm Window F6.6 | IDs aquecidos + prefetch | vs Window |
| Instance registry F3 | TTL in-memory instances | vs RQ instances |
| Redis | **Não usado** | — |

**Sobreposição crítica:** RQ floating messages ↔ Store messages ↔ persist IDB ↔ window cache.

---

## Inventário WebSocket

### Frontend — caminhos de conexão

| # | Path | Condicao |
|---|---|---|
| 1 | `HeaderRealtimeBridge` → `useRealtimeEvents` | Shell |
| 2 | `ChatRealtimeBridge` / `acquireSharedChatSocket` | `CHAT_SINGLE_SOCKET` ON |
| 3 | `realtimeClient` legacy `io()` | Flag OFF |
| 4 | `Chat.tsx` own `io()` | Flag OFF |
| 5 | `ClientProfile` own `io()` | Flag OFF |
| 6 | Kanban attendance socket | Flag OFF → own |
| 7 | Onboarding WhatsApp | wizard |
| 8 | `useNotifications` own `io()` | **Código morto** (sem imports) |

### Backend

Single `Server`; rooms; sem Redis fan-out.

### Detecções

Listeners duplicados se multi-`io()`; eventos legacy + v2 ainda suportados; unsubscribe no logout (shared release no-op F1).

---

## Inventário Banco

| Tema | Achado |
|---|---|
| Engine | PostgreSQL + `pool.query` |
| N+1 | Histórico `getConversations` por instance (mitigado agregado F4) |
| Chat lists | Serviço agregado F4a (flag backend) |
| Workers | SLA, avatar cache — queries periódicas + logs |
| Indexes | Fora do escopo live EXPLAIN nesta auditoria |
| Redis | Ausente |

Risco residual: agregação/joins pesados em tenants grandes — ver `AUDIT_CHAT_SCALE_READINESS.md` / F4 audits.

---

## Inventário Logs

| Camada | Padrão | Gate |
|---|---|---|
| FE metrics chat | `console.info` Prefetch/RenderOptimization/… | DEV + `CHAT_CORE_METRICS` |
| FE hydration audit | `console.debug` F5 | DEV / flag audit |
| FE ChatListDiag | `console.log` | DEV / `VITE_CHAT_LIST_DIAG` |
| BE controllers | `console.error` em catch | sempre |
| BE workers | `console.log/warn` ciclos | sempre |
| BE request log | middleware `/api` | ambiente |

**Risco:** workers WhatsApp/avatar geram volume INFO em produção sem feature-flag explícita de silêncio.

---

## Inventário Feature Flags

### Catalog Super Admin (default OFF)

`CHAT_SINGLE_SOCKET`, 5× `CHAT_WS_PATCH_*`, F3 registry/unread/reconcile, 4× `CHAT_AGGREGATED_*`, shadow/log, `CHAT_CORE_STORE`, `CHAT_CORE_METRICS`.

### Stubs

`CHAT_INBOX_CURSOR` / `CHAT_REDIS_WS` — hardcoded false.

### VITE relevantes

`VITE_API_*`, `VITE_CHAT_PERSIST_CACHE`, `VITE_CHAT_REALTIME_*`, `VITE_CHAT_VIRTUAL_MESSAGES`, billing/checkout/landing flags, diag `VITE_CHAT_*_DEBUG`.

### Flags mortas / confusas

| Flag | Nota |
|---|---|
| `CHAT_INBOX_CURSOR` | Stub — F6 usa STORE |
| `useNotifications` socket | Código morto |
| WS-patch com STORE ON | Bypass — branches “vivas” só OFF |

---

## Inventário de Legado

Fontes: [`LEGACY_REMOVAL_TRACKER.md`](./chat/LEGACY_REMOVAL_TRACKER.md), freeze F6.8.

| Classe | Exemplos app-wide |
|---|---|
| ROLLBACK | Dual socket, RQ Chat, Chat useState muted, TanStack Float, N+1 HTTP |
| ACTIVE satélite | Kanban/Lead HTTP direto, Admin instance dialogs |
| DEPRECATED candidatos | Shadow F4a, Float dump, shadow validation |
| REMOVE_READY | **Nenhum** |

---

## Gargalos encontrados

1. **Waterfall auth (3 HTTP)** antes do shell.  
2. **Instances** potencialmente 2–3× no warm path.  
3. **Chat mount** traz clients+leads+categories.  
4. **Invalidate storms** sem WS-patch.  
5. **Multi-socket** sem F1.  
6. **Caches sobrepostos** (RQ/Store/IDB/Window/Warm).  
7. **Chat.tsx** tamanho → custo React residual.  
8. **Company** possivelmente 2× (Brand + Settings).  
9. **Backend logs** workers sem throttle.  
10. **Sem Redis** → teto horizontal WS.

---

## Riscos

| Risco | Descrição |
|---|---|
| Flag defaults OFF | Produção “parece F0” até Super Admin ligar otimizações |
| Dual SoT drift | Float dump vs Chat pages |
| Reconnect storm | Multi-`io()` + drop de rede |
| Persist IDB stale | Buster tenant:user OK; risk se allowlist crescer |
| StrictMode false positives | Diagnóstico DEV de “duplicata” |
| Scale CCU | Confirmado em AUDIT_CHAT_SCALE_READINESS |

---

## Priorização

### P0 — Imediato (ops / flags, sem código nesta auditoria)

| ID | Item | Ação sugerida (somente orientação) |
|---|---|---|
| P0-1 | Ligar `CHAT_SINGLE_SOCKET` em staging/prod canário | Reduz sockets |
| P0-2 | Planejar F7 Redis antes de multi-réplica | Infra |

### P1 — Alto impacto bootstrap/HTTP

| ID | Item |
|---|---|
| P1-1 | Colapsar waterfall auth (paralelo features/flags ou bundle) |
| P1-2 | Deduplicar fetch de instances (single flight) |
| P1-3 | Adiar clients/leads no mount `/chat` |
| P1-4 | Canário `CHAT_CORE_STORE` + `CHAT_WS_PATCH_*` + Aggregated |
| P1-5 | Inventário invalidate → patch/store first |

### P2 — Médio

| ID | Item |
|---|---|
| P2-1 | Brand/Unread lazy por rota que precisa |
| P2-2 | Company request dedupe Brand↔Settings |
| P2-3 | Float latest-page (eliminar dump) |
| P2-4 | Silenciar/estruturar logs workers BE |

### P3 — Baixo / higiene

| ID | Item |
|---|---|
| P3-1 | Remover stub `CHAT_INBOX_CURSOR` / dead `useNotifications` |
| P3-2 | Fill live baseline Network ([`PERFORMANCE_BASELINE_F6.md`](./chat/PERFORMANCE_BASELINE_F6.md)) |
| P3-3 | Alinhar tipagem `ChatCoreCommandHandlers` |

---

## Performance (estado instrumentado vs medido)

| Sinal | Instrumentado? | Medido nesta auditoria? |
|---|---|---|
| HTTP open chat ≤4 (design F5.12) | Parcial (métricas DEV) | **Não** (live) |
| Virt / window / warm | Sim (chat-core metrics) | **Não** (live) |
| FPS / commit / DOM | Proxies metrics | **Não** |
| Backend query plans | — | **Não** |

Para preencher números: staging + DevTools Network + `logChatPerformanceReport()` com `CHAT_CORE_METRICS=ON`.

---

## Arquitetura — bypass / dual-path (validação)

| Pipeline | STORE ON | Flag OFF / satélite |
|---|---|---|
| HTTP Chat | Commands → Store | RQ / useState / N+1 |
| Realtime Chat | Bridge → Store | multi-io + RQ patch/invalidate |
| UI Chat | Selectors → Hooks | local state |
| Shell CRM | Permissions/Brand/Unread | sempre ativo |
| Satélites | — | Kanban/Lead HTTP próprio |

Dependências circulares graves **não** evidenciadas. Dívida = **pipelines paralelos flagados**, não loops import.

---

## Referências cruzadas

| Doc |
|---|
| [`chat/AUDIT_F5_FINAL.md`](./chat/AUDIT_F5_FINAL.md) |
| [`chat/AUDIT_F6_PERFORMANCE_CERTIFICATION.md`](./chat/AUDIT_F6_PERFORMANCE_CERTIFICATION.md) |
| [`chat/PERFORMANCE_BASELINE_F6.md`](./chat/PERFORMANCE_BASELINE_F6.md) |
| [`chat/F6_ARCHITECTURE_FREEZE_REPORT.md`](./chat/F6_ARCHITECTURE_FREEZE_REPORT.md) |
| [`chat/FEATURE_FLAGS_AUDIT.md`](./chat/FEATURE_FLAGS_AUDIT.md) |
| [`chat/LEGACY_REMOVAL_TRACKER.md`](./chat/LEGACY_REMOVAL_TRACKER.md) |
| [`AUDIT_CHAT_SCALE_READINESS.md`](./chat/AUDIT_CHAT_SCALE_READINESS.md) |

---

## Assinatura

| Campo | Valor |
|---|---|
| **Status** | Investigação completa (estática) |
| **Código modificado** | Nenhum |
| **Commits** | Nenhum |
| **Próximo passo recomendado (ops)** | Canário flags P0 + fill Network live; engenharia P1 em sprints dedicadas **fora** deste documento |
