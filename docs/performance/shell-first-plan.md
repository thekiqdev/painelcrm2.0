# P9 — Shell First Architecture

## Objetivo

Render imediato da estrutura CRM (sidebar + header + área de conteúdo) sem tela branca, com hidratação progressiva do conteúdo.

## Estado atual

| Camada | Comportamento |
|--------|---------------|
| `index.html` | Anti-flash theme script ✅ |
| `main.tsx` | StrictMode + DOM guards |
| `App.tsx` | Providers síncronos + Suspense global |
| `AppLayout.lazy` | **AppShellLoadingFallback** ✅ (S0) |
| Página lazy | `RouteLoadingFallback` spinner full — **gap** |

## Implementado (S0)

### `AppShellLoadingFallback`

- Sidebar skeleton (desktop)
- Header skeleton
- Content placeholders com pulse
- Substitui spinner centralizado no load do AppLayout

### `ChatNavUnreadProvider`

- Uma subscrição shared para sidebar + floating bubble

### Prefetch Nav em `requestIdleCallback`

- Não compete com first paint da página atual

## Roadmap

### Fase A — Shell completo (1–2 dias)

- [ ] `PageContentSkeleton` reutilizável no Suspense interno das rotas
- [ ] Manter shell montado; só trocar `children` area
- [ ] `React.memo(Nav)`, `React.memo(Header)`

### Fase B — Defer secundário (2–3 dias)

- [ ] Lazy `FloatingChatWidget` após idle
- [ ] Lazy `GlobalSearchPanelContent` on focus
- [ ] Defer `MetaPixelTrackingBridge`, `ChatQueryPersistBridge`

### Fase C — Bundle shell (3–5 dias)

- [ ] Split `AppLayout.tsx` em `AppShell` + `AppShellOverlays`
- [ ] Extrair vendors pesados do chunk AppLayout
- [ ] Target: AppLayout < 40 KB gzip

## Progressive hydration

1. **T0:** HTML + CSS + theme class
2. **T1:** React mount + auth check
3. **T2:** Shell visible (sidebar/header skeleton)
4. **T3:** AppLayout interactive
5. **T4:** Page content + data

## Critérios de aceite

| Meta | Shell-first contribui |
|------|----------------------|
| FCP < 1s | Perceived ✅ (skeleton vs branco) |
| TTI < 2s | Precisa reduzir JS bootstrap |
| white_screen: false | Parcial ✅ |
