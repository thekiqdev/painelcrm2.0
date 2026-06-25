# AUDIT_PERFORMANCE_MASTER_PLAN

**Modo:** READ ONLY (Planejamento)  
**Data:** 2026-06-22  
**Status:** Congelamento de features até recuperação de performance  
**Base:** `docs/performance/*.md` (auditorias P1–P10)

---

## 1. Diagnóstico consolidado

### Situação atual

O Painel CRM sofreu degradação perceptível após sprints de funcionalidade. A auditoria identificou gargalos em **quatro eixos** que se reforçam mutuamente:

| Eixo | Sintoma | Evidência |
|------|---------|-----------|
| **Bundle / bootstrap** | Parse JS longo, FCP lento | ~385 KB gzip (entry + vendors + CSS) antes do layout; AppLayout +68 KB gzip adicional |
| **Shell (AppLayout)** | Tela branca, long tasks no mount | Chunk 306 KB; 1.330 LOC; 5+ fetches no primeiro render |
| **Realtime** | Rede/CPU contínuos, até 4 sockets | Chat, ClientProfile, Kanban com `io()` dedicado + singleton |
| **Estado / cache** | Re-renders e refetch em cascata | Header/Nav sem memo; invalidações `['floating-chat']` / `['clients']`; polling paralelo ao socket |

### Já aplicado (S0 parcial — referência, não expandir sem métrica)

| Item | Ganho esperado |
|------|----------------|
| `ChatNavUnreadProvider` (dedup unread) | −50% requests attendance-counts no shell |
| `AppShellLoadingFallback` | FCP percebido melhor no gap do layout |
| Prefetch Nav em `requestIdleCallback` | Menos contenção nos primeiros 2s |

### Gap para meta "instantâneo"

| Métrica | Meta | Estado estimado |
|---------|------|-----------------|
| FCP | < 1s | ⚠️ ~1–2s em 4G (bootstrap 385 KB gzip) |
| TTI | < 2s | ⚠️ Long tasks no parse AppLayout + auth waterfall |
| AppLayout gzip | < 40 KB | ❌ ~68 KB |
| Sockets / usuário | 1 | ❌ até 4 |
| Polling redundante | 0 | ❌ 4+ intervals no shell + kanban |
| Memory leaks conhecidos | 0 | ❌ Chat, ClientProfile, WhatsAppConnection |
| Long tasks > 200ms | 0 | ❌ bootstrap + DnD + Recharts |
| Navegação instantânea | Sim | ⚠️ Header/Nav re-render em toda rota |

---

## 2. FASE 1 — Inventário e classificação

### P0 — Impacto muito alto

| Item | Área | Por quê |
|------|------|---------|
| Bootstrap `App.tsx` + entry chunks | Bootstrap | 338 KB gzip JS antes de qualquer UI autenticada |
| `AppLayout.tsx` (306 KB / 68 KB gzip) | AppLayout | Shell obrigatório em toda rota CRM |
| `AuthProvider` + waterfall auth/me → permissions | Providers | Bloqueia render autenticado |
| `useRealtimeEvents` + sockets dedicados | Sockets | Até 4 conexões; listeners duplicados |
| Polling shell (badges 45s, tickets 60s, unread 120s) | Polling | Compete com realtime já existente |
| Suspense em cascata (App → Layout → Page) | Suspense | Spinner full na página após skeleton do layout |
| `Header` (busca global, 8 setStates em pathname) | Header | Re-render + API debounced em toda navegação |
| `Nav` (15× feature flags, prefetch, ticket count) | Nav | Re-render em toda navegação |
| `FloatingChatProvider` + widget | FloatingChat | Mount pesado; invalidações RQ agressivas |
| `GlobalSearchPanelContent` + CommandDialog | GlobalSearch | No critical path do Header sem necessidade |

### P1 — Impacto médio

| Item | Área |
|------|------|
| `invalidateQueries(['floating-chat'])` em cascata | React Query |
| `invalidateQueries(['clients']` / `['leads']`)` no Chat | React Query |
| Recharts (`BarChart` 370 KB) em dashboard/financeiro | Charts |
| Leads/Chat Kanban DnD + virtualização | Kanban |
| Dashboard widgets sem memo | Widgets |
| `members` query keys fragmentadas (4 caches) | React Query |
| Prefetch keys mismatch (dashboard preset, leads sort) | React Query |
| `Chat.tsx` estado manual (~7k LOC) vs RQ | Chat |
| Assinaturas CRM sem RQ (`useEffect` manual) | React Query |
| `ProjectFinance` staleTime 0 + refetchOnMount always | React Query |

### P2 — Melhorias futuras

| Item | Área |
|------|------|
| CSS 322 KB (`index.css`) — purge Tailwind | CSS |
| ~470 micro-chunks (lucide por ícone) | Micro chunks |
| `<link rel="modulepreload">` vendors | Preload |
| Service worker cache shell | SW |
| RQ persist estratégico além do chat | Cache |
| `experimentalMinChunkSize` no Vite | Bundle |

### Tabela de priorização

| Área | Impacto | Complexidade | Prioridade |
|------|---------|--------------|------------|
| Bootstrap / entry split | Muito alto | Média | **P0** |
| AppLayout split + lazy overlays | Muito alto | Alta | **P0** |
| Shell-first (page skeleton) | Muito alto | Baixa | **P0** |
| Header/Nav memo + estabilização | Muito alto | Baixa | **P0** |
| Socket unificado (Chat/Kanban/Profile) | Muito alto | Alta | **P0** |
| Eliminar polling redundante | Muito alto | Média | **P0** |
| Suspense unificado (sem spinner full) | Alto | Baixa | **P0** |
| GlobalSearch lazy on-demand | Alto | Baixa | **P0** |
| FloatingChat defer/lazy widget | Alto | Média | **P0** |
| RQ invalidações cirúrgicas | Alto | Média | **P1** |
| Badge hooks → RQ + events | Alto | Média | **P1** |
| Query key factories (clients/leads/members) | Médio | Média | **P1** |
| Recharts manualChunk + lazy charts | Médio | Baixa | **P1** |
| Memory leak fixes (Chat, WhatsApp) | Alto | Média | **P1** |
| Providers split (Auth/Permissions) | Médio | Alta | **P1** |
| TipTap/DnD manualChunks | Médio | Baixa | **P1** |
| Assinaturas → React Query | Médio | Média | **P1** |
| CSS purge | Médio | Média | **P2** |
| Service worker | Médio | Alta | **P2** |
| Micro-chunk consolidation | Baixo | Média | **P2** |

---

## 3. FASE 2 — Roadmap completo (sprints)

Ordem ideal: quick wins → shell → realtime → cache → estrutura → hardening.

### S0.1 — Quick Wins ✅ (parcialmente feito)

| Campo | Detalhe |
|-------|---------|
| **Objetivo** | Ganhos imediatos sem refactor estrutural |
| **Arquivos** | `chatNavUnreadContext.tsx`, `AppShellLoadingFallback.tsx`, `AppLayout.lazy.tsx`, `AppLayout.tsx` (idle prefetch) |
| **Risco** | Baixo |
| **Dependências** | Nenhuma |
| **Impacto** | −1 poll timer; −50% unread API; shell skeleton no layout |
| **Pendente neste sprint** | Medir em `before-after.md`; `PageContentSkeleton` nas rotas; `React.memo(Header/Nav)` |

### S0.2 — Shell First

| Campo | Detalhe |
|-------|---------|
| **Objetivo** | Zero tela branca; shell persistente entre rotas |
| **Arquivos** | `RouteLoadingFallback.tsx`, `App.tsx` (Suspense interno), `AppShellLoadingFallback.tsx`, novo `PageContentSkeleton.tsx` |
| **Risco** | Baixo |
| **Dependências** | S0.1 |
| **Impacto** | FCP/LCP percebido; navegação entre módulos sem flash |
| **Entregas** | Skeleton na área `children`; manter sidebar/header montados; remover `min-h-screen` spinner em rotas dentro do layout |

### S0.3 — Realtime Unificado

| Campo | Detalhe |
|-------|---------|
| **Objetivo** | 1 socket por usuário; eventos via `REALTIME_WINDOW_EVENTS` |
| **Arquivos** | `realtimeClient.ts`, `Chat.tsx`, `ClientProfile.tsx`, `useKanbanAttendanceSocketRefresh.ts`, `ChatKanbanPage.tsx`, `useNotifications.ts` (remover) |
| **Risco** | **Alto** — regressão chat/kanban |
| **Dependências** | Testes manuais chat + kanban; feature flag de rollback |
| **Impacto** | −3 conexões WS; menos CPU; menos memory leak surface |
| **Entregas** | Chat/Kanban/Profile consomem window events; remover `io()` dedicados; remover poll 20s Kanban |

### S0.4 — React Query Hardening

| Campo | Detalhe |
|-------|---------|
| **Objetivo** | Invalidações cirúrgicas; eliminar refetch em cascata |
| **Arquivos** | `Chat.tsx`, `FloatingChatProvider.tsx`, `floatingChatQueries.ts`, `whatsappInstanceCacheReset.ts`, `AgendaHolidaysTab.tsx`, `TicketDetail.tsx` |
| **Risco** | Médio — stale UI se invalidação errada |
| **Dependências** | S0.3 (menos eventos duplicados) |
| **Impacto** | Menos re-fetch; menos long tasks pós-mensagem |
| **Entregas** | Substituir `['floating-chat']` por helpers; escopar clients/leads; `Promise.all` em invalidações TicketDetail |

### S0.5 — Providers & Polling

| Campo | Detalhe |
|-------|---------|
| **Objetivo** | Defer bridges; migrar polls para RQ + event invalidation |
| **Arquivos** | `AuthContext.tsx`, `ModulePermissionsContext.tsx`, `MetaPixelTrackingBridge.tsx`, `ChatQueryPersistBridge.tsx`, `useInAppNotificationBadges.ts`, `useTicketMenuCount.ts`, `useChatNavUnreadCount.ts` |
| **Risco** | Médio |
| **Dependências** | S0.4 |
| **Impacto** | −3 intervals no shell; bootstrap mais leve |
| **Entregas** | MetaPixel/ChatPersist em idle; badges/tickets/unread como queries com `staleTime` + invalidate on event; ticket count só se nav visível |

### S0.6 — AppLayout Split

| Campo | Detalhe |
|-------|---------|
| **Objetivo** | AppLayout < 40 KB gzip; separar shell de overlays |
| **Arquivos** | `AppLayout.tsx` → `AppShell.tsx`, `AppShellChrome.tsx`, `AppShellOverlays.tsx`, `AppShellRealtime.tsx`; lazy `FloatingChatWidget`, `GlobalSearchPanelContent` |
| **Risco** | Alto — arquivo monolítico 1.330 LOC |
| **Dependências** | S0.2, S0.5 |
| **Impacto** | −30–40 KB gzip no critical path; TTI melhor |
| **Entregas** | Ver Fase 3 abaixo |

### S0.7 — Memory Leaks

| Campo | Detalhe |
|-------|---------|
| **Objetivo** | 0 leaks conhecidos em código auditado |
| **Arquivos** | `Chat.tsx`, `ClientProfile.tsx`, `WhatsAppConnection.tsx`, `useNotifications.ts`, `realtimeClient.ts` |
| **Risco** | Médio |
| **Dependências** | S0.3 (sockets unificados reduzem superfície) |
| **Impacto** | Heap estável em sessões longas |
| **Entregas** | `socket.off()` antes de disconnect; cleanup intervals; remover dead code |

### S0.8 — Bundle Optimization

| Campo | Detalhe |
|-------|---------|
| **Objetivo** | Reduzir bootstrap; vendors nomeados |
| **Arquivos** | `vite.config.ts`, `App.tsx`, `EntityDrawerContainer.tsx` |
| **Risco** | Médio — cache bust em deploy |
| **Dependências** | S0.6 |
| **Impacto** | −50–100 KB gzip bootstrap estimado |
| **Entregas** | `manualChunks`: recharts, tiptap, dnd-kit, date-fns; lazy EntityDrawer; defer MetaPixel |

### S0.9 — Mobile Performance

| Campo | Detalhe |
|-------|---------|
| **Objetivo** | UX nativa: bottom nav, scroll, overlays leves |
| **Arquivos** | `MobileAppNavigation.tsx`, `MobileShellChromeContext.tsx`, `FloatingChatWidget.tsx`, `MobileConversationOverlay.tsx` |
| **Risco** | Médio |
| **Dependências** | S0.2, S0.6 |
| **Impacto** | TTI mobile; menos jank no scroll |
| **Entregas** | Floating chat só desktop ou após interação; reduzir animações pulse 500ms; `content-visibility` em listas |

### S1.0 — Hardening & Metrics

| Campo | Detalhe |
|-------|---------|
| **Objetivo** | CI de performance; critérios de aceite bloqueantes |
| **Arquivos** | `docs/performance/before-after.md`, Lighthouse CI config, bundle size budget |
| **Risco** | Baixo |
| **Dependências** | S0.1–S0.9 |
| **Impacto** | Regressões detectadas antes de merge |
| **Entregas** | Budget: entry < 250 KB gzip; AppLayout < 40 KB; Lighthouse score mínimo; checklist PR performance |

---

## 4. FASE 3 — AppLayout (proposta arquitetural)

**Arquivo atual:** `src/layouts/AppLayout.tsx` (1.330 linhas, 68 KB gzip)

### 3.1 Imports candidatos a lazy

| Módulo | Gatilho de load |
|--------|-----------------|
| `GlobalSearchPanelContent` | Foco no input ou ⌘K |
| `CommandDialog` (conteúdo completo) | `commandDialogOpen === true` |
| `FloatingChatWidget` + sub-componentes | `requestIdleCallback` ou flag chat |
| `FloatingChatProvider` (opcional) | Mesmo gatilho — avaliar UX |
| Ícones Lucide por grupo | Dynamic import por seção Nav (P2) |

### 3.2 Providers adiáveis

| Provider | Adiar para |
|----------|------------|
| `FloatingChatProvider` | Idle / primeira rota chat / hover bubble |
| `ChatNavUnreadProvider` | Quando chat feature + permission (já condicional) |
| `TenantBrandProvider` | Pode usar placeholder até fetch — skeleton na sidebar |

**Manter síncronos:** `SidebarProvider`, `MobileShellChromeProvider`

### 3.3 Pertence ao shell principal (`AppShell`)

- Estrutura DOM: sidebar slot + main column
- `SidebarProvider` + `Nav` (versão leve, memo)
- `MobileShellChromeProvider` + `MobileAppNavigation`
- `RequireModuleView` wrapper
- `TenantBrandProvider` (com fallback logo)

### 3.4 Mover para `AppShellOverlays`

- `FloatingChatWidget` + `MobileConversationOverlay`
- `CommandDialog` / busca global popover
- Dropdowns pesados do Header (create menu pode ficar no chrome)

### 3.5 Carregar sob demanda

- Busca global (API + painel)
- Chat flutuante completo
- Prefetch de rotas (já em idle — manter)
- `useTicketMenuCount` — só se item Tickets visível na Nav

### 3.6 Hooks que provocam re-render desnecessário

| Hook | Componente | Mitigação |
|------|------------|-----------|
| `useLocation` pathname | Header | Extrair busca para filho; memo Header shell |
| `useFeatureFlag` × 15 | Nav | Context `FeatureFlags` com selector memo |
| `useDebouncedGlobalGroupedSearch` | Header | Lazy mount do search subtree |
| `useInAppNotificationBadges` | Header | RQ query + memo bell |
| `useFloatingChat` | Header create menu | Optional — link direto sem context |

### 3.7 Efeitos para idle

| Efeito | Atual | Alvo |
|--------|-------|------|
| Nav route prefetch | `requestIdleCallback` ✅ | Manter |
| FloatingChat persist hydrate | Mount | Idle |
| `listInstances` (floating) | Mount | Idle ou on chat feature |
| ⌘K listener | Mount | OK (leve) |

### 3.8 Proposta de módulos (sem código)

```
AppShell
├── Providers: TenantBrand, Sidebar, MobileShellChrome
├── AppShellChrome
│   ├── Nav (memo)
│   └── Header (memo, search lazy)
├── AppMainColumn
│   └── {children}  ← única área que muda por rota
└── AppShellOverlays (lazy / idle)
    ├── FloatingChatProvider + Widget
    ├── GlobalSearch / CommandDialog
    └── (futuro) toasts pesados

AppShellRealtime (singleton, 1x por sessão)
├── connectRealtime (via useRealtimeEvents)
├── Emissão REALTIME_WINDOW_EVENTS
└── Hooks consumidores (badges, unread, kanban cards)
```

**Wrapper:** `AppLayout.lazy.tsx` mantém Suspense com `AppShellLoadingFallback`.

---

## 5. FASE 4 — Providers (árvore ideal)

### Globais obrigatórios (bootstrap)

```
QueryClientProvider
BrowserRouter
ThemeProvider
AuthProvider          ← considerar split Session / User / Features
ModulePermissionsProvider  ← considerar selectors memoizados
TooltipProvider
Toaster
```

### Globais adiáveis (pós-auth ou idle)

```
ChatQueryPersistBridge     → idle + hasChat
MetaPixelTrackingBridge    → idle
ChatRouteTimingListener    → dev-only ou remover prod
EntityDrawerContainer      → lazy on first open
```

### Escopo AppLayout (autenticado)

```
TenantBrandProvider
SidebarProvider
MobileShellChromeProvider
ChatNavUnreadProvider      → enabled if chat
AppShellRealtimeProvider   → useRealtimeEvents (extrair do Header)
AppShellOverlays           → FloatingChatProvider (lazy)
```

### Locais (não promover a global)

- `FinanceMobileChromeContext`
- `TenantDetailContext`
- `KanbanServiceProvider`
- `FloatingChatProvider` internals

### Cascatas a eliminar

| Cascata | Solução |
|---------|---------|
| Auth `loading` → tudo | Skeleton auth-aware; não montar AppLayout até `user` |
| Permissions fetch → Nav+Header+Page | Selectors `useCanView('chat')` estáveis |
| Theme toggle → árvore inteira | OK aceitável; evitar `useTheme` no Nav |
| Message event → invalidate all floating-chat | S0.4 helpers cirúrgicos |

---

## 6. FASE 5 — Realtime (arquitetura alvo)

### Estado atual

| Socket | Arquivo | Redundante? |
|--------|---------|-------------|
| 1 | `realtimeClient.ts` | **Base** |
| 2 | `Chat.tsx` | ✅ Sim |
| 3 | `ClientProfile.tsx` | ✅ Sim |
| 4 | `useKanbanAttendanceSocketRefresh.ts` | ✅ Sim |
| 5 | `useNotifications.ts` | Dead code |

**Máximo observado:** 4 sockets simultâneos.

### Polls elimináveis (com socket + window events ativos)

| Poll | Intervalo | Ação |
|------|-----------|------|
| `ChatKanbanPage` | 20s | Remover após S0.3 |
| `useChatNavUnreadCount` | 120s | Manter como fallback longo ou remover se eventos 100% confiáveis |
| `useInAppNotificationBadges` | 45s | Migrar para invalidate on `notificationCreated` |
| `useTicketMenuCount` | 60s | Idem |

### Telas que podem usar apenas `REALTIME_WINDOW_EVENTS`

- `Chat.tsx` (após mapear eventos faltantes no singleton)
- `ClientProfile.tsx`
- `ChatKanbanPage` / `useKanbanBoardRealtimeCards` (já usa window events — remover socket duplicado)
- `FloatingChatProvider`
- `useChatNavUnreadCount`

### Arquitetura alvo

```
┌─────────────────────────────────────┐
│  Backend Socket.IO (/socket.io/)    │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│  realtimeClient.ts (SINGLETON)      │
│  connectRealtime(token)             │
│  disconnectRealtime() on logout     │
└─────────────────┬───────────────────┘
                  │ dispatch
┌─────────────────▼───────────────────┐
│  window CustomEvents                │
│  REALTIME_WINDOW_EVENTS.*           │
└─────────────────┬───────────────────┘
                  │
     ┌────────────┼────────────┐
     ▼            ▼            ▼
 useBadges   useChatUnread  useKanbanCards
 FloatingChat  TicketCount   ...
```

**Regra:** Nenhum `io()` fora de `realtimeClient.ts` (exceção documentada: superadmin tools isolados, se necessário).

---

## 7. FASE 6 — React Query (plano de migração)

### Fase A — Corrigir danos (S0.4)

1. Inventariar todos `invalidateQueries` com prefixo amplo
2. Substituir por `invalidateFloatingChatAggregates`, `invalidateFloatingChatConversationMeta`
3. Chat delete/update: máximo 2–3 keys por operação

### Fase B — Unificar keys (S0.4 / S0.5)

| Domínio | Factory proposta | Arquivo |
|---------|------------------|---------|
| tasks | ✅ existe | `lib/queryKeys/tasks.ts` |
| clients | `clientsKeys.list(tenant, user)` | novo |
| leads | `leadsKeys.list(tenant, user, sort, filter)` | novo |
| members | `membersKeys.all(tenant)` | novo |
| appointments | incluir `client` subtree | `AgendaPage` |

### Fase C — Migrar polling manual → RQ

| Hook manual | Query key | staleTime | Invalidate |
|-------------|-----------|-----------|------------|
| `useInAppNotificationBadges` | `['badges', 'in-app']` | 60s | `notificationCreated` |
| `useTicketMenuCount` | `['tickets', 'menu-count']` | 60s | `notificationCreated` |
| `useChatNavUnreadCount` | `['chat', 'nav-unread']` | 90s | message/conv events |
| Subscriptions list/detail | `['crm-subscriptions', ...]` | 60s | mutations |

### Fase D — Chat página (longo prazo)

- Não migrar `Chat.tsx` inteiro de uma vez
- Novas features só via RQ
- Extrair conversations list para `useInfiniteQuery` incremental

### Queries com refetch excessivo hoje

| Query | Causa |
|-------|-------|
| `ProjectFinance` | staleTime 0 + refetchOnMount always |
| `EmbeddedLeadConversationPanel` messages | staleTime 5s + websocket |
| Floating chat on each message | broad invalidate |

---

## 8. FASE 7 — Memory leaks (classificação)

### Alta severidade

| Local | Problema | Sprint |
|-------|----------|--------|
| `Chat.tsx` | `disconnect()` sem `off()`; early-return stale listeners | S0.7 |
| `ClientProfile.tsx` | Idem | S0.7 |
| `WhatsAppConnection.tsx` | Interval sem cleanup on unmount | S0.7 |
| Sockets dedicados | Órfãos ao navegar | S0.3 |

### Média severidade

| Local | Problema | Sprint |
|-------|----------|--------|
| `FloatingChatProvider` | Painéis retêm conversas | S0.9 (limit panels) |
| RQ cache 15 min | Retenção memória | S1.0 (tunar gcTime por query) |
| Chat persist IDB | Crescimento disco | S1.0 |
| `useNotifications.ts` | Dead code com reconnect | S0.7 (delete) |

### Baixa severidade

| Local | Problema |
|-------|----------|
| `realtimeClient` singleton | By design |
| `AuthWhatsApp` resend timer | Parcial cleanup |

### Validação obrigatória (S1.0)

1. Heap snapshot: 10× Dashboard ↔ Chat ↔ Leads
2. WS tab: máximo 1 connection
3. Performance monitor: heap slope < 5 MB / 10 min idle

---

## 9. FASE 8 — Bundle (plano de redução)

### Bootstrap atual (~385 KB gzip)

| Chunk | Gzip | Ação |
|-------|------|------|
| `index-*` entry | ~117 KB | Defer bridges; split route table metadata |
| `index-*` shared | ~116 KB | manualChunks vendors |
| `react-vendor` | ~105 KB | modulepreload |
| `index.css` | ~47 KB | Purge (P2) |

### manualChunks recomendados (`vite.config.ts`)

```text
recharts      → chart-vendor
@tiptap/*     → editor-vendor
@dnd-kit/*    → dnd-vendor
date-fns      → date-fns (se duplicado)
socket.io     → já existe ✅
```

### Chunks > 100 KB gzip (lazy por rota — não no bootstrap)

Settings 92, Projects 155, BarChart 102, AppLayout 68, Chat 55, Agenda 39, Leads 37, Dashboard 19

### Meta AppLayout < 40 KB gzip

- Split físico do arquivo (S0.6)
- Lazy overlays (~15–20 KB estimado)
- Ícones Nav em sub-chunk ou SVG inline críticos
- Remover GlobalSearch do chunk principal

### Dependências no bootstrap sem necessidade imediata

- `EntityDrawerContainer` → lazy
- `MetaPixelTrackingBridge` → idle
- `ChatQueryPersistBridge` → idle + chat flag
- 130 `lazyWithReload` factories em `App.tsx` — OK (só factories)

---

## 10. FASE 9 — Mobile First

### Gargalos mobile identificados

| Gargalo | Causa | Sprint |
|---------|-------|--------|
| Header global oculto mas shell pesado | AppLayout full chunk no mobile | S0.6 |
| Bottom nav + safe area | OK estruturalmente | — |
| Floating chat bubble | Carrega desktop logic | S0.9 — hide < 1024px já parcial |
| `MobileConversationOverlay` | Pesado com RQ | Lazy com overlay open |
| Scroll jank em listas | Virtualização inconsistente | P1 |
| Suspense full screen | Spinner em troca de rota | S0.2 |
| 68 KB AppLayout gzip | Parse em CPU mobile | S0.6 + S0.8 |

### Otimizações mobile (sem remover features)

1. **Shell mobile-first:** bottom nav + content skeleton sem sidebar desktop
2. **`touch-action` / `-webkit-overflow-scrolling`** em listas chat/leads
3. **Reduzir `backdrop-blur`** no header mobile (GPU)
4. **Defer FloatingChat** completamente no mobile (usar rota `/chat` only)
5. **`prefers-reduced-motion`** para animações pulse/pulse sweep
6. **Viewport:** já tem `viewport-fit=cover` ✅

### Experiência alvo "app nativo"

| Aspecto | Estado | Alvo |
|---------|--------|------|
| Tab bar fixa | ✅ | Manter |
| Transição entre tabs | Spinner | Skeleton content |
| Pull-to-refresh | Não universal | Opcional P2 |
| Offline shell | Não | SW P2 |

---

## 11. FASE 10 — Metas e métricas

### Metas bloqueantes (release performance)

| ID | Métrica | Alvo |
|----|---------|------|
| M1 | FCP (dashboard autenticado, 4G) | < 1000 ms |
| M2 | TTI | < 2000 ms |
| M3 | LCP | < 1500 ms |
| M4 | AppLayout chunk gzip | < 40 KB |
| M5 | Bootstrap JS gzip (sem layout/page) | < 280 KB |
| M6 | Sockets simultâneos / usuário | ≤ 1 |
| M7 | Polling redundante no shell | 0 |
| M8 | Memory leaks conhecidos | 0 |
| M9 | Long tasks > 200 ms (dashboard mount) | 0 |
| M10 | Header/Nav re-renders por navegação | ≤ 1 cada |
| M11 | `attendance-counts` nos primeiros 5s | ≤ 1 request |

### Tabela Antes × Depois esperado

| Métrica | Antes (auditoria) | Após S1.0 (meta) |
|---------|-------------------|------------------|
| FCP percebido | Spinner / branco | Shell skeleton < 1s |
| TTI | 2.5–4s estimado | < 2s |
| Bootstrap gzip | ~385 KB | ~280 KB |
| AppLayout gzip | ~68 KB | < 40 KB |
| Sockets máx | 4 | 1 |
| Polls shell | 3 intervals | 0 (event-driven) |
| Unread API mount | 2× (pré-S0.1) → 1× | 1× |
| Long tasks mount | 2–4 | 0–1 |
| Navegação CRM | Flash spinner página | Skeleton in-place |
| Heap após 30 min | Crescimento (risco) | Estável ±10% |

### Instrumentação

| Ferramenta | Quando |
|------------|--------|
| `npm run analyze` + `dist/stats.html` | Cada sprint bundle |
| Lighthouse CI (dashboard, leads, chat) | S1.0 |
| Chrome Performance (long tasks) | S0.2, S0.6 |
| Network waterfall (5s pós-login) | S0.1, S0.5 |
| Heap snapshot | S0.7, S1.0 |
| `before-after.md` | Atualizar por sprint |

---

## 12. Riscos e dependências globais

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Regressão chat ao unificar socket | Alta | Alto | Feature flag; QA checklist chat |
| Split AppLayout introduz bugs UI | Média | Alto | PRs pequenos; Storybook/snapshots se existir |
| RQ invalidação errada → stale UI | Média | Médio | Testes integração; invalidação conservadora primeiro |
| Reduzir polling → badges desatualizados | Baixa | Médio | Fallback poll 5 min |
| Bundle split → mais requests HTTP | Baixa | Baixo | HTTP/2; preload crítico |

**Dependência crítica:** Congelar features até **S0.3 + S0.6** completos (maior impacto usuário).

---

## 13. Critérios de aceite do programa

O programa **Performance First** considera-se concluído quando:

- [ ] Todas as metas M1–M11 atingidas em staging (3 medições consecutivas)
- [ ] `before-after.md` preenchido com dados reais
- [ ] Zero issues Alta em memory audit
- [ ] Checklist PR performance em CONTRIBUTING ou CI
- [ ] Documentação `AUDIT_PERFORMANCE_MASTER_PLAN.md` revisada com status por sprint

---

## 14. Ordem de execução recomendada

```
S0.1 (medir quick wins já feitos)
  → S0.2 Shell First
    → S0.3 Realtime Unificado
      → S0.4 React Query
        → S0.5 Providers/Polling
          → S0.7 Memory (paralelo após S0.3)
            → S0.6 AppLayout Split
              → S0.8 Bundle
                → S0.9 Mobile
                  → S1.0 Hardening
```

**Paralelizável:** S0.7 após S0.3; S0.8 parcialmente com S0.6.

---

## 15. Política durante o congelamento

1. **Nenhuma feature nova** mergeada sem exceção aprovada por performance lead.
2. Bugfixes críticos permitidos se não aumentarem bundle > 2 KB gzip.
3. Todo PR deve declarar impacto: bundle / sockets / polls / renders.
4. Sprints de produto retomam após critérios M1–M11 em staging.

---

## Referências

| Documento | Conteúdo |
|-----------|----------|
| `bundle-analysis.md` | Top 20 chunks, bootstrap |
| `applayout-audit.md` | Hooks, fetches, imports |
| `providers-analysis.md` | Árvore atual |
| `query-analysis.md` | RQ, invalidações, polling |
| `realtime-analysis.md` | Sockets, listeners |
| `network-analysis.md` | Waterfall |
| `react-profiler.md` | Renders, long tasks |
| `memory-analysis.md` | Leaks |
| `shell-first-plan.md` | Progressive hydration |
| `fixes.md` | S0 aplicado |
| `before-after.md` | Template métricas |

---

*Documento produzido em modo READ ONLY. Nenhum código foi alterado na elaboração deste plano.*
