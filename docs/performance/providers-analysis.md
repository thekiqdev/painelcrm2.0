# P3 — Auditoria de Providers

## Árvore global (`App.tsx`)

```
QueryClientProvider
  └ TooltipProvider
      └ BrowserRouter
          └ ThemeProvider (next-themes)
              └ AuthProvider
                  ├ ChatQueryPersistBridge
                  ├ ChatRouteTimingListener
                  └ ModulePermissionsProvider
                      ├ MetaPixelTrackingBridge
                      ├ Suspense (rotas)
                      └ EntityDrawerContainer
              Toaster (fora AuthProvider, dentro Theme)
```

## Providers por responsabilidade

| Provider | Arquivo | Dados / side effects | Re-render cascade |
|----------|---------|----------------------|-------------------|
| **QueryClientProvider** | `lib/queryClient.ts` | Cache global RQ | Qualquer `invalidateQueries` |
| **TooltipProvider** | `ui/tooltip.tsx` | Radix context | Baixo |
| **ThemeProvider** | `theme-provider.tsx` | `localStorage` theme | Troca light/dark → **toda árvore** |
| **AuthProvider** | `AuthContext.tsx` | `GET /api/auth/me`, features, redirects | **Alto** — `user`, `loading`, `features` |
| **ModulePermissionsProvider** | `ModulePermissionsContext.tsx` | Permissões por módulo | **Alto** — qualquer `canView` change |
| **ChatQueryPersistBridge** | `ChatQueryPersistBridge.tsx` | Persist RQ chat em IDB | Mount + auth |
| **MetaPixelTrackingBridge** | `MetaPixelTrackingBridge.tsx` | Pixel scripts | Baixo |

### AppLayout (após auth)

| Provider | Dados |
|----------|-------|
| TenantBrandProvider | Logo, cores |
| FloatingChatProvider | Painéis, instances, persist |
| ChatNavUnreadProvider | Unread count compartilhado |
| SidebarProvider | Collapse state |
| MobileShellChromeProvider | Bottom nav visibility |

### Outros (escopo local)

- `FinanceMobileChromeContext` — rotas financeiro
- `TenantDetailContext` — superadmin client detail
- `KanbanServiceProvider` — kanban pages

## AuthProvider — detalhe

**Mount:**
1. Lê token / impersonation URL
2. `fetchCurrentUser()` → `/api/auth/me`
3. Carrega `features` do plano
4. `useEffect` redirects (plano expirado, onboarding, commercial 402)

**Cascata:** `loading: true → false` re-renderiza AuthGuard + toda árvore autenticada.

## ModulePermissionsProvider

- Fetch permissões após `user` disponível
- `hasPermissionKey`, `canView`, `canCreate` usados em **Nav + Header + cada página**
- Sem memoização de selectors → consumidores re-renderizam juntos

## FloatingChatProvider

- Estado grande: `panels[]`, drafts, mobile overlay
- Listeners realtime em **cada mensagem** → `invalidateQueries` floating-chat
- `setInterval` 500ms para pulse animation sweep

## Cascatas de renderização identificadas

1. **Login:** Auth loading off → Permissions load → Feature flags → AppLayout mount → 5+ fetches paralelos
2. **Troca de tema:** ThemeProvider → todos os consumidores `useTheme`
3. **Mensagem chat:** Window event → FloatingChat invalidates → bubble + dock + list re-fetch
4. **Navegação:** `pathname` change → Header `useEffect` reseta busca (8 setStates)

## Estimativa de renders por navegação (estática)

| Componente | Triggers |
|------------|----------|
| AuthProvider | Raramente |
| ModulePermissionsProvider | 1× após auth |
| AppLayout Nav | `pathname`, permissions, feature flags |
| Header | `pathname`, search state, badges |
| Page | Nova rota lazy + queries |

**Risco:** Header + Nav re-renderizam em **toda** navegação mesmo quando só `children` muda.

## Recomendações

1. `React.memo` em `Nav` e `Header` com comparador de props estáveis.
2. Split `AuthProvider` — separar `session` de `features` contexts.
3. Defer `MetaPixelTrackingBridge` até `requestIdleCallback`.
4. `FloatingChatProvider` — invalidação cirúrgica (já parcial em `floatingChatQueries.ts`).
