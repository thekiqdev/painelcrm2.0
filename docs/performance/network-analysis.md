# P7 — Network Waterfall

## Cold load (usuário autenticado → `/dashboard`)

```
1. index.html
2. index-*.css (322 KB / 47 gzip)     ← bloqueia FCP
3. main.tsx → entry chunks (paralelo)
   ├─ react-vendor (~105 KB gzip)
   ├─ index-1weHdESK (~117 KB gzip)
   └─ index-B0aWZDQw (~116 KB gzip)
4. Parse/compile JS                    ← long task provável
5. React hydrate #root
6. AuthProvider → GET /api/auth/me     ← waterfall pós-JS
7. ModulePermissions → GET permissions
8. Route match /dashboard
9. AppLayout.lazy chunk (~68 KB gzip)  ← segundo suspense
10. Dashboard chunk (~19 KB gzip)
11. Dashboard queries (overview widgets)
```

**Bloqueio principal:** JS bootstrap deve completar antes de qualquer API autenticada.

## Waterfalls identificados

| Cadeia | Impacto |
|--------|---------|
| JS entry → auth/me → permissions → layout → page | Serial inevitável sem SSR |
| AppLayout → TenantBrand + Instances + Badges + Unread | Paralelo mas **5+ requests** no shell |
| Prefetch Nav (idle) → dashboard + tasks + chat warm | Compete com página atual |
| Chat open → socket handshake fetch + io connect | Extra HTTP antes WS |

## Lazy loading em cascata

```
Suspense #1 App (RouteLoadingFallback - full screen)
  Suspense #2 AppLayout (AppShellLoadingFallback - S0)
    Suspense #3 Dashboard (RouteLoadingFallback - full screen)  ← gap visual
```

## Suspense excessivo

- **130+** `lazyWithReload` em `App.tsx` — bom para bundle, mas cada rota nova = chunk fetch.
- Fallback interno das páginas ainda usa spinner full screen (não shell).

## Recursos cedo demais

| Recurso | Quando carrega | Deveria |
|---------|----------------|---------|
| FloatingChatWidget | Com AppLayout | Idle / hover chat |
| MetaPixel | App mount | Idle |
| ChatQueryPersist | App mount | Após auth + flag chat |
| Global search | Header mount | On focus |
| socket.io chunk | Primeira conexão realtime | OK |

## Recomendações

1. Inline critical CSS / reduzir `index.css`
2. Preload `react-vendor` + entry em `index.html`
3. Unificar fallback de página com shell skeleton
4. HTTP/2 push ou `<link rel="modulepreload">` para vendors
5. Service worker cache para shell chunks (futuro)
