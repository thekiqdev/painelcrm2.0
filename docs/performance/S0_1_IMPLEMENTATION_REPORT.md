# S0.1 — Quick Wins de Performance — Relatório de Implementação

**Data:** 2026-06-15  
**Modo:** Implementação (sem alteração de regras de negócio, APIs, DB ou UX)

---

## Resumo executivo

Sprint S0.1 concluída. O chunk `AppLayout` saiu do caminho crítico de parse com **−34% gzip** (~68 KB → **44,8 KB**). `GlobalSearchPanelContent`, `FloatingChatBundle` e bridges de analytics/persist passam a carregar **após** o shell. Header e Sidebar receberam memoização parcial para reduzir trabalho em navegação.

---

## Arquivos alterados

### Novos

| Arquivo | Propósito |
|---------|-----------|
| `src/lib/scheduleIdleTask.ts` | Helper `requestIdleCallback` + fallback |
| `src/lib/devMountTiming.ts` | Logs `[perf:mount]` só em DEV |
| `src/components/PageContentSkeleton.tsx` | Fallback in-layout (sem full-screen spinner) |
| `src/components/layout/GlobalSearchPanelLazy.tsx` | Lazy do painel de busca global |
| `src/components/layout/HeaderRealtimeBridge.tsx` | Subscrição realtime isolada |
| `src/components/layout/HeaderProfileCluster.tsx` | Cluster perfil/tema/notificações memoizado |
| `src/features/floating-chat/floatingChatPending.ts` | Fila de ações antes do provider real |
| `src/features/floating-chat/floatingChatStub.ts` | Context stub com arm + enqueue |
| `src/features/floating-chat/FloatingChatBundle.tsx` | Chunk lazy (Provider + Widget) |
| `src/features/floating-chat/FloatingChatDeferred.tsx` | Adia bundle até idle/interação |

### Modificados

| Arquivo | Mudança |
|---------|---------|
| `src/layouts/AppLayout.tsx` | Nav `React.memo`, Header otimizado, lazy search/chat, mount logs |
| `src/App.tsx` | `PageContentSkeleton` em 58 rotas AppLayout, log mount App |
| `src/pages/Dashboard.tsx` | Log mount Dashboard (DEV) |
| `src/components/MetaPixelTrackingBridge.tsx` | Ativação em idle |
| `src/components/chat/ChatQueryPersistBridge.tsx` | Persist/restore em idle |
| `src/features/floating-chat/index.ts` | Export `FloatingChatDeferred` |

---

## Antes × Depois (build `npm run build:crm`)

| Métrica | Antes (auditoria S0) | Depois (S0.1) | Δ |
|---------|----------------------|---------------|---|
| `AppLayout` chunk (gzip) | ~68 KB | **44,80 KB** | **−34%** |
| `AppLayout` chunk (min) | ~306 KB | **180,51 KB** | **−41%** |
| `GlobalSearchPanelContent` | Dentro de AppLayout | **6,52 KB gzip** (chunk separado) | Fora do critical path |
| `FloatingChatBundle` | Dentro de AppLayout | **23,30 KB gzip** (chunk separado) | Fora do critical path |
| Entry `index-*` (gzip) | ~117 KB | **116,51 KB** | ~estável (esperado) |
| Bootstrap total (gzip) | ~385 KB | ~385 KB (entry + vendors + CSS) | Lazy não reduz entry; reduz parse do layout |

> **Nota:** O ganho perceptível vem do **parse/execução adiada** do layout pesado e overlays, não só do tamanho do entry.

---

## Partes implementadas

### Parte 1 — Header e Nav estáveis

- `Nav` envolvido em `React.memo` — não depende de `pathname` no corpo; `NavLink` atualiza estado ativo via router.
- `HeaderProfileCluster` extraído com `React.memo` — tema, sino e menu de perfil não re-renderizam quando só `pathname` muda (props de auth/badges inalteradas).
- `HeaderRealtimeBridge` — `useRealtimeEvents` isolado (componente null).
- Handlers de busca com `useCallback`.
- **Limitação intencional:** zona de busca e menu “Criar” ainda re-renderizam em navegação (dependem de `pathname`).

### Parte 2 — GlobalSearch lazy

- `GlobalSearchPanelLazy` com `React.lazy` + `Suspense`.
- Chunk carregado em: clique mobile, `mousedown` no input, `Ctrl/Cmd+K`, abertura do `CommandDialog`.
- `useDebouncedGlobalGroupedSearch` permanece no Header (leve até 2+ caracteres).

### Parte 3 — FloatingChat lazy

- `FloatingChatDeferred`: stub de contexto + fila de ações pendentes.
- Carga do bundle em `requestIdleCallback` (timeout 5s) ou primeira `pointerdown`/`keydown`.
- `Suspense` fallback mantém stub durante download do chunk.
- Widget removido do mount síncrono do `AppLayout`.

### Parte 4 — MetaPixel em idle

- `MetaPixelTrackingBridge` agenda `useMetaPixelTracking` via `scheduleIdleTask` (timeout 6s).

### Parte 5 — ChatQueryPersistBridge em idle

- Registro de sessão e `persistQueryClient` só após idle (timeout 5s).
- Comportamento de restore/persist inalterado.

### Parte 6 — useEffect pesados (classificação)

| Item | Prioridade | Ação S0.1 |
|------|------------|-----------|
| Nav prefetch (8 rotas) | P1 | Já em idle (S0) — mantido |
| MetaPixel fetch + init | P0 | ✅ Adiado idle |
| ChatQueryPersist IndexedDB | P0 | ✅ Adiado idle |
| Header Ctrl+K listener | P2 | Mantido (leve) |
| Header autofill hardening | P2 | Mantido |
| FloatingChat provider mount | P0 | ✅ Chunk lazy |
| `useDebouncedGlobalGroupedSearch` | P2 | Mantido (só com query ≥2) |

### Parte 7 — Suspense redundantes

- 58 rotas `<AppLayout><Suspense>` passaram de `RouteLoadingFallback` (full-screen) para `PageContentSkeleton` (área de conteúdo).
- Cascata restante: `App` → `AppLayout.lazy` (`AppShellLoadingFallback`) → `PageContentSkeleton` — **sem segundo full-screen** dentro do layout.
- Rotas auth/landing mantêm `LoadingFallback` full-screen (correto).

### Parte 8 — Providers pesados

| Provider | Mount pesado? | S0.1 |
|----------|---------------|------|
| `FloatingChatProvider` | Sim (instances, persist, socket) | ✅ Lazy via `FloatingChatDeferred` |
| `TenantBrandProvider` | Leve (brand fetch) | Global — mantido |
| `SidebarProvider` | Leve | Global — mantido |
| `MobileShellChromeProvider` | Leve | Mantido |
| `ChatNavUnreadProvider` | Médio (query unread) | Mantido (badge nav) |

### Parte 9 — Bundle crítico

Componentes removidos do parse inicial do `AppLayout`:

- `GlobalSearchPanelContent` → chunk `GlobalSearchPanelContent-*.js`
- `FloatingChatProvider` + `FloatingChatWidget` → `FloatingChatBundle-*.js`
- Wrapper/stub → `FloatingChatDeferred-*.js` (12,39 KB gzip)

### Parte 10 — Instrumentação DEV

Logs `[perf:mount]` em:

- `App` (`App.tsx`)
- `AppLayout` (`AppLayout.tsx`)
- `Header` (`AppLayout.tsx`)
- `Sidebar` (`AppLayout.tsx`)
- `Dashboard` (`Dashboard.tsx`)

Apenas quando `import.meta.env.DEV === true`.

---

## Componentes lazy adicionados

```txt
GlobalSearchPanelContent  →  GlobalSearchPanelLazy (dynamic import)
FloatingChatBundle        →  FloatingChatDeferred (dynamic import)
```

---

## Renders reduzidos (esperado)

| Componente | Antes | Depois |
|------------|-------|--------|
| `Nav` | Re-render com pai a cada navegação | `React.memo` — skip se hooks estáveis |
| `HeaderProfileCluster` | Re-render com Header | Skip se user/badges inalterados |
| `GlobalSearchPanelContent` | Montado com Header | Montado só após arm |
| `FloatingChatWidget` | Montado com AppLayout | Montado após idle/interação |

---

## Ganhos observados

1. **Build:** AppLayout −23 KB gzip; search + chat em chunks separados (~30 KB gzip combinados fora do layout).
2. **Shell:** skeleton in-layout elimina spinner full-screen em 58 rotas CRM.
3. **Bootstrap:** Meta Pixel e IndexedDB chat não competem com primeiro paint.
4. **DEV:** timestamps de mount para comparação antes/depois no console.

---

## Riscos remanescentes

| Risco | Mitigação |
|-------|-----------|
| Primeira abertura da busca com ~1 frame de “Carregando busca…” | Chunk pequeno (6,5 KB gzip); arm em foco/Ctrl+K |
| Ação de chat na busca antes do bundle | Fila `floatingChatPending` + flush no provider real |
| AppLayout ainda > 40 KB gzip (meta S0.6) | Próximo sprint: split `AppShell.tsx` / overlays |
| Entry bootstrap ~116 KB gzip inalterado | S0.2+ route-based code splitting no `App.tsx` |
| Header ainda re-renderiza parcialmente em rota | Aceitável; busca/create dependem de `pathname` |
| 4 sockets Socket.IO | Fora do escopo S0.1 (S0.4+) |

---

## Regressões

- `npm run build:crm` — **OK** (exit 0).
- Comportamento de UX preservado (mesmos fluxos de busca, chat flutuante, persist, pixel).
- Zero migrations, zero mudanças de API.

---

## Próximos passos (S0.2 — não iniciado)

Conforme `AUDIT_PERFORMANCE_MASTER_PLAN.md`: dedupe sockets, polling vs realtime, invalidações RQ amplas, split físico do AppLayout (< 40 KB gzip).

---

## Como validar localmente

```bash
npm run dev
# Console (DEV): [perf:mount] App @ …ms, AppLayout @ …ms, Header @ …ms, Sidebar @ …ms, Dashboard @ …ms

npm run build:crm
# Verificar chunks GlobalSearchPanelContent-*, FloatingChatBundle-*, AppLayout-*
```

Hard reload em `/dashboard` → shell skeleton → conteúdo sem segundo spinner full-screen.
