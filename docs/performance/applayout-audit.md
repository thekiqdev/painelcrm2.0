# P2 — Auditoria do AppLayout

**Arquivo:** `src/layouts/AppLayout.tsx` (1.330 linhas, **306 KB** minificado / **68 KB** gzip)  
**Wrapper lazy:** `src/layouts/AppLayout.lazy.tsx`

## O que carrega no primeiro render autenticado

```
AuthGuard (já resolvido)
  → AppLayout.lazy (Suspense)
    → AppLayout.tsx
      → TenantBrandProvider          [fetch brand API]
      → FloatingChatProvider         [persist, instances, realtime listeners]
      → ChatNavUnreadProvider        [attendance-counts API — após fix S0]
      → SidebarProvider
        → Nav (sidebar desktop)
        → MobileShellChromeProvider
          → Header
          → AppMainColumn (children = página lazy)
        → FloatingChatWidget
```

## Imports síncronos pesados no AppLayout

| Import | Impacto |
|--------|---------|
| `@/components/ui/sidebar` | Radix + estado sidebar |
| `lucide-react` (30+ ícones) | Tree-shaken mas ainda no chunk |
| `GlobalSearchPanelContent` | Busca global + command palette |
| `useDebouncedGlobalGroupedSearch` | API em cada keystroke (debounced) |
| `FloatingChatProvider` + widget | Chat flutuante completo |
| `routePreload` + `prefetchAppData` | Prefetch de rotas em idle |
| `useRealtimeEvents` (via Header) | Socket singleton |

## Providers aninhados (só AppLayout)

1. `TenantBrandProvider`
2. `FloatingChatProvider`
3. `ChatNavUnreadProvider` *(S0)*
4. `SidebarProvider` (+ `TooltipProvider` interno)
5. `MobileShellChromeProvider`

## Hooks globais no layout

| Hook | Componente | Efeito |
|------|-----------|--------|
| `useAuth` | Nav, Header | Re-render em auth |
| `useModulePermissions` | Nav, Header | Re-render em permissões |
| `useFeatureFlag` × 15+ | Nav, Header | Uma chamada por flag |
| `useRealtimeEvents` | Header | Conecta socket |
| `useInAppNotificationBadges` | Header | Poll 45s + listeners |
| `useChatNavUnreadCount` | Provider único | Poll 120s *(dedup S0)* |
| `useTicketMenuCount` | Nav | Poll 60s |
| `useDebouncedGlobalGroupedSearch` | Header | API busca global |
| `useFloatingChat` | Header create menu | Context chat |

## Queries / fetches automáticos (mount)

| Origem | Endpoint / ação |
|--------|-----------------|
| `TenantBrandProvider` | Branding tenant |
| `FloatingChatProvider` | `listInstances`, persist IDB |
| `ChatNavUnreadProvider` | `listInstances` + `attendance-counts` |
| `useInAppNotificationBadges` | 2× unread count services |
| `useTicketMenuCount` | `ticketsService.getMenuCount` |
| `useRealtimeEvents` | WebSocket connect |
| Nav `useEffect` (idle) | `prefetchDashboardOverview`, `prefetchTasksSummaryNav`, `prefetchChatWarm` |

## Listeners e subscriptions

- `document keydown` (⌘K) — Header
- Window realtime events — badges, chat, floating chat
- `FloatingChatProvider` — 4+ `REALTIME_WINDOW_EVENTS`
- Sidebar collapse state — `SidebarProvider`

## WebSocket

- `useRealtimeEvents()` no **Header** → `connectRealtime(token)` em todo layout autenticado
- Chat dedicado **não** está no AppLayout, mas FloatingChat reage aos mesmos window events

## O que deveria carregar em background

| Módulo | Motivo |
|--------|--------|
| `GlobalSearchPanelContent` | Só após foco na busca ou ⌘K |
| `FloatingChatWidget` | Após idle ou primeira interação chat |
| `CommandDialog` completo | Lazy com `commandDialogOpen` |
| Prefetch Nav (dashboard, chat warm) | ✅ Já movido para `requestIdleCallback` (S0) |
| `useTicketMenuCount` | Só se módulo tickets visível na nav |

## Imports desnecessários no critical path

- **30 ícones Lucide** no mesmo arquivo — considerar ícones por seção de nav.
- **`Command` + `CommandDialog`** sempre no bundle do Header.

## Tela branca

**Antes:** `RouteLoadingFallback` = `min-h-screen` spinner centralizado.  
**Depois (S0):** `AppShellLoadingFallback` = sidebar + header skeleton.

## Cascata Suspense

```
App Suspense (RouteLoadingFallback)
  → AuthGuard
    → AppLayout.lazy Suspense (AppShellLoadingFallback)  ← shell-first
      → Page Suspense (RouteLoadingFallback)               ← ainda spinner full
```

Próximo passo: usar shell skeleton também no Suspense interno das páginas quando já dentro do layout.
