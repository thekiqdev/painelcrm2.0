# PERFORMANCE_FORENSICS_V2

**Modo:** READ ONLY  
**Data:** 2026-06-23  
**Build:** `npm run build:crm` (pós S0.1 + S0.2)  
**Escopo:** Gargalos reais após Shell First Architecture

---

## Executive summary

S0.1/S0.2 reduziram o shell bloqueante (`AppLayout` 44,8 KB → `AppShell` **31,2 KB gzip**) e adiaram overlays/realtime. Os maiores gargalos restantes são:

1. **Chunks de rota monolíticos** — `Projects` (154 KB gzip), `Settings` (92 KB), `Chat` (55 KB), `Agenda` (39 KB)
2. **Bootstrap entry** — ~234 KB gzip combinado (`index-*` + `react-vendor`)
3. **Bibliotecas compartilhadas pesadas** — `recharts`/`BarChart` (~102 KB gzip), `pdfjs` (~103 KB gzip)
4. **Runtime paralelo** — polling header (45s/60s/120s) + socket singleton + sockets dedicados por rota (Chat, ClientProfile, Kanban)
5. **Prefetch idle do sidebar** — dispara 6+ rotas/chunks após mount do shell

---

## PARTE 1 — Bundle Forensics

**Fonte:** `npm run build:crm` — 470 chunks JS listados.

### Top 25 chunks (ranking gzip)

| # | Chunk | Gzip | Min | Class | Origem |
|---|-------|------|-----|-------|--------|
| 1 | `Projects-*.js` | **154,49 KB** | 557,53 KB | **P0** | `src/pages/Projects.tsx` + imports síncronos massivos |
| 2 | `Settings-*.js` | **91,72 KB** | 667,50 KB | **P0** | `src/pages/Settings.tsx` + tabs/settings |
| 3 | `index-BVWW*.js` | **117,08 KB** | 485,71 KB | **P0** | Entry secundário Vite (vendors/app router) |
| 4 | `index-B2Ie*.js` | **116,51 KB** | 364,86 KB | **P0** | Entry principal CRM |
| 5 | `react-vendor-*.js` | **104,55 KB** | 341,60 KB | **P0** | React, RQ, router, etc. |
| 6 | `pdfWorker-*.js` | **103,50 KB** | 346,80 KB | **P0** | `pdfjs-dist` worker |
| 7 | `BarChart-*.js` | **101,98 KB** | 370,46 KB | **P0** | `recharts` (shared) |
| 8 | `Agenda-*.js` | **39,01 KB** | 267,81 KB | **P1** | `src/pages/Agenda.tsx` |
| 9 | `Chat-*.js` | **55,00 KB** | 248,23 KB | **P1** | `src/pages/Chat.tsx` |
| 10 | `ChatKanbanPage-*.js` | **37,35 KB** | 223,11 KB | **P1** | Kanban + `@dnd-kit` |
| 11 | `Leads-*.js` | **36,66 KB** | 194,94 KB | **P1** | `src/pages/Leads.tsx` + kanban embutido |
| 12 | `ContractCreateForm-*.js` | **36,56 KB** | 169,89 KB | **P1** | Formulários contrato |
| 13 | `ClientProfile-*.js` | **32,05 KB** | 214,94 KB | **P1** | Perfil + socket próprio |
| 14 | `AppShell-*.js` | **31,17 KB** | 139,97 KB | **P2** | `src/layouts/shell/AppShell.tsx` |
| 15 | `AcquisitionSignupFlow-*.js` | **27,32 KB** | 161,28 KB | **P2** | Aquisição (fora CRM autenticado) |
| 16 | `VirtualizedMessageItem-*.js` | **25,31 KB** | 147,66 KB | **P2** | Chat message rendering |
| 17 | `StickyNote-*.js` | **25,75 KB** | 90,61 KB | **P2** | Componente rich note |
| 18 | `FloatingChatBundle-*.js` | **23,29 KB** | 100,07 KB | **P2** | Provider + widget (lazy) |
| 19 | `AppShellOverlaysInner-*.js` | **18,46 KB** | 53,92 KB | **P2** | GlobalSearch overlay (lazy) |
| 20 | `Dashboard-*.js` | **19,15 KB** | 131,34 KB | **P3** | Página dashboard |
| 21 | `SubscriptionsList-*.js` | **19,91 KB** | 91,28 KB | **P3** | Assinaturas CRM |
| 22 | `Clients-*.js` | **21,97 KB** | 126,97 KB | **P3** | Lista clientes |
| 23 | `Tasks-*.js` | **19,43 KB** | 109,49 KB | **P3** | Tarefas |
| 24 | `Finance-*.js` | **6,92 KB** | 45,96 KB | **P3** | Hub financeiro (sub-rotas split) |
| 25 | `AppShellRealtime-*.js` | **0,51 KB** | 0,88 KB | **P3** | Bridge realtime (lazy) ✅ |

### Classificação por tier

| Tier | Critério | Count (top list) |
|------|----------|------------------|
| **P0** | > 100 KB gzip | 7 |
| **P1** | 50–100 KB gzip | 2 (`Chat`, `Agenda` borderline P1) |
| **P2** | 25–50 KB gzip | 8 |
| **P3** | < 25 KB gzip | restante (~453 chunks) |

### Dependências internas críticas (shared)

| Lib | Chunk evidência | Consumidores típicos |
|-----|-----------------|---------------------|
| `recharts` | `BarChart-*.js` 102 KB gzip | Dashboard, SubscriptionsCharts, finance reports |
| `react` + ecosystem | `react-vendor` 104 KB gzip | Bootstrap |
| `pdfjs-dist` | `pdfWorker` 103 KB gzip | Visualização PDF (contratos, drive) |
| `@dnd-kit/*` | embutido em Leads/Kanban/Tasks chunks | Kanban boards |
| `@tiptap/*` | parcial em Settings/StickyNote | Editores rich text |
| `socket.io-client` | em Chat, ClientProfile, realtimeClient | Múltiplas rotas |
| `taskUnified` | `taskUnified-*.js` 12,5 KB gzip | Projects, Tasks |

---

## PARTE 2 — Route Forensics

Estimativas baseadas em chunks Vite + código. **Tempos não medidos em runtime** (sem Lighthouse nesta auditoria).

### `/dashboard`

| Métrica | Evidência |
|---------|-----------|
| **Chunks principais** | `AppShell` 31 KB + `Dashboard` 19 KB + **`BarChart` 102 KB** + shared ~20–40 KB |
| **Total gzip estimado (1ª visita)** | **~170–190 KB JS** (shell + page + recharts) |
| **API requests (mount)** | 1× `GET /api/dashboard/overview` (`Dashboard.tsx:75-78`) |
| **Prefetch shell** | `prefetchDashboardOverview` idle (`AppShellSidebar.tsx:51-78`, `prefetchAppData.ts:31-41`) — **pode duplicar** se usuário navega antes de stale |
| **Mount** | Monolito ~1.350 LOC; 10+ `useMemo`/`useEffect` |
| **Data ready** | Single query; waterfall mínimo |
| **Serial?** | Não na página; shell prefetch é paralelo pós-idle |

### `/leads`

| Métrica | Evidência |
|---------|-----------|
| **Chunks** | `Leads` 37 KB gzip + `LeadKanbanBoard` (embutido) + `@dnd-kit` |
| **Queries** | `statuses` + `leads` list (`Leads.tsx:149-164`) |
| **API** | 2+ requests iniciais |
| **Invalidações amplas** | `invalidateQueries(['floating-chat'])`, `['leads']` em ações (`Leads.tsx:346-347`) |

### `/clients`

| Métrica | Evidência |
|---------|-----------|
| **Chunks** | `Clients` 22 KB + `ClientSearchCombobox` 4,7 KB |
| **Queries** | 1 lista principal (`Clients.tsx:363`) |
| **Prefetch nav** | `prefetchClientsListNav` — 2 API (`/api/client-groups`, `/api/clients`) |

### `/projects`

| Métrica | Evidência |
|---------|-----------|
| **Chunks** | **`Projects` 154 KB gzip** — maior rota CRM |
| **Queries** | teams, projects, members (`Projects.tsx:220-575`) |
| **API** | 3+ requests no mount |
| **Serial?** | Possível: members após project select |

### `/finance/*`

| Métrica | Evidência |
|---------|-----------|
| **Chunks** | Hub `Finance` 7 KB; sub-páginas 2–16 KB cada (bem split) |
| **Pattern** | `FinanceLayout.lazy` + rotas filhas ✅ |

### `/chat`

| Métrica | Evidência |
|---------|-----------|
| **Chunks** | `Chat` 55 KB + `VirtualizedMessageItem` 25 KB + lazy deps |
| **Socket** | **Socket dedicado** `io()` em `Chat.tsx:1459` (não usa singleton) |
| **Queries** | `clientGroupsList`, `chatRuntimeConfig` (`Chat.tsx:813-819`) |
| **Runtime** | ~2.000+ LOC; handlers WebSocket extensos |

### `/crm-subscriptions` (Assinaturas)

| Métrica | Evidência |
|---------|-----------|
| **Chunks** | `SubscriptionsList` 20 KB + possível `BarChart` se charts abertos |
| **Componentes** | `SubscriptionsChartsPanel`, filtros, cards |

---

## PARTE 3 — React Render Forensics

Análise estática (sem React Profiler). Foco em re-renders por navegação no shell.

| Componente | Class | Motivo | Evidência |
|------------|-------|--------|-----------|
| `NavLinkItem` (dentro Sidebar) | **P0** | `useLocation()` em cada item | `AppShellSidebar.tsx:131-133` — N subscrições router |
| `AppShellHeaderActions` | **P1** | `pathname` → menu "Criar" | `AppShellHeaderActions.tsx:24,88-201` — memo não evita pathname |
| `GlobalSearchOverlay` | **P1** | Reset estado em `pathname` | `GlobalSearchOverlay.tsx:53-65` |
| `AppShellHeader` | **P2** | `overlayReady` context | `GlobalSearchSlotContext` |
| `HeaderProfileCluster` | **P3** | Memo; só badges/user | Estável entre rotas ✅ |
| `AppShellSidebar` | **P2** | Memo outer; filhos NavLink re-render | React.memo no container |
| `Dashboard` | **P1** | 15+ feature flags + permissions hooks | Re-render em context changes |
| `MobileShellChromeProvider` | **P1** | Context header mobile | Usado em Dashboard mount effect |
| `ChatNavUnreadProvider` | **P2** | count state 120s poll | Propaga count a filhos |
| `FloatingChatProvider` | **P1** | panels, drafts, pulse 500ms interval | `FloatingChatProvider.tsx:262-277` |

---

## PARTE 4 — React Query Forensics

**Defaults globais** (`queryClient.ts:16-27`):

- `staleTime`: 5 min
- `refetchOnWindowFocus`: **false**
- `refetchOnMount`: **false**
- `refetchOnReconnect`: **false**

### Polling / intervalos explícitos

| Query / Hook | queryKey | Intervalo | Classificação |
|--------------|----------|-----------|---------------|
| `useChatNavUnreadCount` | (imperativo) | **120s** + realtime events | Suspeito (socket já cobre) |
| `useInAppNotificationBadges` | (imperativo) | **45s** + realtime | Redundante parcial |
| `useTicketMenuCount` | tickets | **60s** | Suspeito |
| `ClientDriveFileManager` | drive files | `refetchInterval` dinâmico | Necessário (upload) |
| Chat Kanban ops | REST | **20s** `setInterval` | Redundante vs socket refresh |

### Prefetch nav (shell idle)

| queryKey | API | Trigger |
|----------|-----|---------|
| `dashboard-overview` | `/api/dashboard/overview` | Sidebar idle |
| `clients/list` | `/api/client-groups` + `/api/clients` | Sidebar hover + idle |
| `tasks/unified/summary` | tasks summary | Sidebar idle |
| `leads` list | leads API | prefetch nav |
| Chat core | instances + unread + lists | `scheduleIdleChatPrefetch` |

**Duplicatas observadas:** prefetch dashboard + mount Dashboard usa mesma key — OK se stale; senão request duplicado.

### Invalidações amplas (amostra P0)

| Padrão | Arquivos |
|--------|----------|
| `invalidateQueries(['floating-chat'])` | Leads, MobileConversationOverlay, whatsappInstanceCacheReset |
| `invalidateQueries(['clients'])` | Leads, vários fluxos CRM |
| `invalidateQueries(['leads'])` | EmbeddedLeadConversationPanel |

---

## PARTE 5 — Socket.IO Forensics

### Conexões identificadas

| # | Socket | Provider / Arquivo | Eventos |
|---|--------|-------------------|---------|
| 1 | **Singleton** | `realtimeClient.ts:46-84` via `useRealtimeEvents` → `AppShellRealtime` | message/conv/notification/channel/whatsapp |
| 2 | **Chat dedicado** | `Chat.tsx:1459` | new_message, conversation.updated, reconnect handlers |
| 3 | **ClientProfile** | `ClientProfile.tsx:1012` | Mensagens cliente |
| 4 | **Kanban attendance** | `useKanbanAttendanceSocketRefresh.ts:31` | Refresh kanban cards |
| 5 | **FloatingChat** | Escuta `REALTIME_WINDOW_EVENTS` (window) | Derivado do singleton ✅ |

### Respostas

1. **Quantos simultâneos?** Em `/dashboard`: **1** (singleton). Em `/chat`: **2** (singleton + Chat). Em `/clients/:id`: **2**. Em `/chat/kanban`: **2–3**.
2. **Mais de um socket por tenant?** **Sim** — Chat e ClientProfile abrem `io()` independente do singleton (`connectRealtime`).
3. **Polling paralelo ao websocket?** **Sim** — unread 120s, badges 45s, tickets 60s, kanban 20s enquanto sockets activos.

---

## PARTE 6 — Polling Forensics

| Origem | Frequência | Classificação |
|--------|------------|---------------|
| `useInAppNotificationBadges` | 45s | **Redundante** (realtime + event) |
| `useTicketMenuCount` | 60s | **Suspeito** |
| `useChatNavUnreadCount` | 120s | **Redundante** (realtime debounced) |
| `ChatKanbanPage` ops refresh | 20s | **Redundante** (socket hook exists) |
| `FloatingChatProvider` pulse cleanup | 500ms | **Necessário** (UI state local) |
| `AgendaWeekView` now tick | 60s | Necessário |
| Nav prefetch | idle 1.5–3s | Necessário (perf) |
| MetaPixel / ChatPersist | idle 1.5–6s | Necessário ✅ (S0.1) |

---

## PARTE 7 — Main Thread Forensics

Estimativas estáticas (LOC + complexidade). **Sem profiling medido.**

| Função / Área | Tempo est. | Evidência |
|---------------|------------|-----------|
| `Dashboard` chartRows `useMemo` | 10–25ms | Mapeia monthly array + labels |
| `Dashboard` render completo | 25–50ms+ | ~1.350 LOC, múltiplos cards + Recharts |
| `Projects.tsx` mount | 50–100ms+ | 2.846 LOC, 3 queries, views múltiplas |
| `Leads` kanban sort/filter | 10–25ms | Listas grandes |
| `Chat` message list virtualized | 10–25ms | VirtualizedMessageItem chunk |
| `recharts` first paint | 25–50ms | BarChart 102 KB parse |
| `Projects` BoardView drag | 10ms+ per move | Pointer handlers custom (sem dnd-kit) |
| IndexedDB chat restore | 25–100ms | ChatQueryPersistBridge idle |

---

## PARTE 8 — Dashboard Forensics

**Arquivo:** `src/pages/Dashboard.tsx` (~1.355 linhas)

### Requests no mount

| # | Endpoint | Mecanismo |
|---|----------|-----------|
| 1 | `GET /api/dashboard/overview?preset=...` | `useQuery` L75-78 |

**Prefetch paralelo (shell):** mesmo endpoint via `prefetchDashboardOverview` se idle completou.

### Widgets / cálculos

- KPI cards, filas agent attendance, tickets preview
- **Gráfico Recharts** BarChart (`ResponsiveContainer`, L21) → puxa chunk `BarChart` **102 KB gzip**
- `DashboardQuickActionsPanel` — `@dnd-kit` sortable
- `computeOrderedQuickActions` — `useMemo`
- Trial banner, activation block

### Respostas

1. **Quantos requests?** **1** API principal (+ 2 badge polls globais header se shell montado).
2. **Consolidáveis?** Overview já consolidado backend; badges poderiam unificar num endpoint `/api/header/summary`.
3. **Waterfall?** Query única — **não**.
4. **Serial?** **Não** na página; gráfico espera `overview` (correto).

---

## PARTE 9 — Projects Forensics

**Chunk:** `Projects-*.js` — **557 KB min / 154,49 KB gzip** (P0)

### Composição (imports síncronos em `Projects.tsx`)

| Módulo | Impacto |
|--------|---------|
| `BoardView`, `CalendarView`, `TaskListView`, `ProjectsGrid/List` | UI massiva inline |
| `TaskSidePanel`, `TaskDetailDialog`, `TaskFormDialog` | `@/components/tasks` tree |
| `ProjectVersionControlPanel` | chunk separado 25 KB — carregado quando tab aberta |
| `ProjectDriveWorkspace`, `ProjectFinance` | Drive + finance embutidos |
| `taskUnified` | 75 KB min chunk partilhado |
| CSV/XLSX import utils | parsers |
| **Sem** `@dnd-kit` no BoardView | drag custom pointer (L1-511) |

### Respostas

1. **O que compõe 154 KB?** Página monolítica + todas as views/tabs importadas estaticamente + task system + drive + finance parcial.
2. **O que pode ser lazy?** `CalendarView`, `BoardView`, `ProjectDriveWorkspace`, `ProjectFinance`, `TaskSidePanel`, import dialogs — **por tab/view**.
3. **Ganho estimado split?** **40–60% gzip** na rota inicial (`/projects` list-only) se apenas grid/list carregar first.

---

## PARTE 10 — Chat Forensics

**Chunk:** `Chat-*.js` — **248 KB min / 55 KB gzip**

### Por que ~55 KB?

- Página monolítica **~2.000+ LOC**
- Socket.io client + handlers inline
- Virtualized messages (chunk separado 25 KB)
- Composer, filters, attendance, CRM links

### Bundle vs runtime

| Aspecto | Diagnóstico |
|---------|-------------|
| **Bundle** | 55 KB gzip é moderado para feature; não é o maior P0 |
| **Runtime** | **Problema maior:** socket duplicado + handlers pesados + invalidações |

### Duplicidade listeners

- Socket **próprio** em `Chat.tsx` **+** singleton `realtimeClient` activo no shell
- `useChatNavUnreadCount` escuta mesmos window events + poll 120s
- FloatingChat escuta window events derivados do singleton

---

## PARTE 11 — Bootstrap Forensics

**Montagem em `App.tsx` (L216+) antes da rota:**

| Provider / Componente | Obrigatório? | Pode adiar? | Class |
|-----------------------|--------------|-------------|-------|
| `QueryClientProvider` | Sim | Não | **core** |
| `TooltipProvider` | Sim (UI) | Parcial | core |
| `BrowserRouter` | Sim | Não | core |
| `ThemeProvider` | Sim | Não | core |
| `AuthProvider` | Sim | Não | core |
| `ChatQueryPersistBridge` | Não imediato | **Sim (idle)** ✅ | defer |
| `ModulePermissionsProvider` | Sim (rotas) | Parcial | core |
| `MetaPixelTrackingBridge` | Não | **Sim (idle)** ✅ | defer |
| `ChatRouteTimingListener` | Não | Sim | defer |
| `EntityDrawerContainer` | Não até drawer | **Sim (lazy)** | lazy |
| `Toaster` | Sim (feedback) | Parcial | core |
| `Suspense` + 100+ lazy refs | Declarativos | OK | — |

**Bootstrap JS gzip medido:**

- `index-B2Ie` 116,51 KB + `index-BVWW` 117,08 KB + `react-vendor` 104,55 KB ≈ **338 KB gzip** (antes de AppShell)

**Sync imports pesados no entry:** `AuthGuard`, `AuthLayout`, `EntityDrawerContainer`, `loadChatPage` ref, todos os `lazyWithReload` declarations (metadata only).

---

## PARTE 12 — Ranking Final (Top 20 gargalos)

| # | P | Item | Impacto | Esforço |
|---|-----|------|---------|---------|
| 1 | **P0** | `Projects` chunk 154 KB monolítico | TTI rota projetos | Médio |
| 2 | **P0** | `Settings` chunk 92 KB | TTI configurações | Médio |
| 3 | **P0** | Bootstrap ~338 KB gzip (entry+vendors) | FCP global | Alto |
| 4 | **P0** | `recharts`/`BarChart` 102 KB no Dashboard | TTI dashboard | Baixo |
| 5 | **P0** | Socket duplicado Chat vs singleton | CPU + rede | Médio |
| 6 | **P1** | `Chat` 55 KB + runtime socket | TTI /chat | Médio |
| 7 | **P1** | `Agenda` 39 KB | TTI agenda | Médio |
| 8 | **P1** | `Leads` 37 KB + dnd kanban | TTI leads | Médio |
| 9 | **P1** | Polling header 45s/60s/120s | Rede contínua | Baixo |
| 10 | **P1** | Nav prefetch idle (6 rotas) | Rede pós-login | Baixo |
| 11 | **P1** | `AppShell` ainda 31 KB (> meta 25) | TTI shell | Médio |
| 12 | **P1** | `NavLinkItem` useLocation × N | Re-render nav | Baixo |
| 13 | **P1** | Invalidações RQ amplas (`floating-chat`) | Refetch cascata | Médio |
| 14 | **P2** | `ClientProfile` socket + 32 KB | Perfil cliente | Médio |
| 15 | **P2** | Kanban poll 20s | Rede | Baixo |
| 16 | **P2** | `pdfWorker` 103 KB (on-demand) | Rotas PDF | Baixo |
| 17 | **P2** | `EntityDrawerContainer` sync bootstrap | Entry parse | Baixo |
| 18 | **P2** | Dashboard monolito 1.350 LOC | Maintainability/TTI | Médio |
| 19 | **P2** | `SubscriptionsList` + charts | Assinaturas | Baixo |
| 20 | **P3** | GlobalSearch portal flash | UX micro | Baixo |

---

## Métricas S0 baseline (referência)

| Métrica | S0.1 | S0.2 | Esta auditoria |
|---------|------|------|----------------|
| AppLayout/AppShell gzip | 44,8 KB | 31,2 KB | 31,2 KB ✅ |
| Overlays lazy | Parcial | 18,5 KB chunk | Confirmado |
| Entry gzip | ~116 KB | ~116 KB | 116–117 KB (estável) |

---

## Limitações desta auditoria

- Sem medições Lighthouse / React Profiler em runtime
- Tempos de mount são **estimativas** por análise estática
- Network waterfall real depende de backend latency
- Contagem exacta de chunks por rota requer `vite-bundle-visualizer` (não executado — build log usado)

---

*Auditoria READ ONLY — nenhum código alterado.*
