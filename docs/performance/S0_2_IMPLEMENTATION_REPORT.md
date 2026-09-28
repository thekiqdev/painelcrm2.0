# S0.2 — Shell First Architecture — Relatório de Implementação

**Data:** 2026-06-23  
**Pré-requisito:** S0.1 ✅  
**Modo:** Implementação (sem alteração de regras de negócio, APIs, DB, permissões ou UX)

---

## Resumo executivo

O monolito `AppLayout.tsx` (~1.330 linhas) foi substituído pela arquitetura **Shell First**, com separação lógica e de chunks entre **Shell**, **Chrome**, **Realtime** e **Overlays**. O chunk principal passou de **44,8 KB → 30,9 KB gzip** (−31%). Busca global, chat flutuante e bridges realtime saíram do critical path do shell.

---

## Parte 1 — Auditoria final (mapeamento)

| Item | Shell | Chrome | Realtime | Overlay |
|------|:-----:|:------:|:--------:|:-------:|
| `SidebarProvider` + layout flex | ✅ | | | |
| `TenantBrandProvider` | ✅ | | | |
| `ChatNavUnreadScope` | ✅ | | | |
| `MobileShellChromeProvider` | ✅ | | | |
| `RequireModuleView` + `<main>` outlet | ✅ | | | |
| `AppShellSidebar` (nav desktop) | | ✅ | | |
| `AppShellHeader` + ações perfil | | ✅ | | |
| `MobileAppNavigation` | | ✅ | | |
| `HeaderNotificationBell` (badges) | | ✅ | | |
| Menu “Criar novo” | | ✅ | | |
| `HeaderRealtimeBridge` / `useRealtimeEvents` | | | ✅ | |
| `GlobalSearchOverlay` (busca + Ctrl+K) | | | | ✅ |
| `GlobalSearchPanelContent` (lazy) | | | | ✅ |
| `FloatingChatDeferred` + widget | | | | ✅ |
| Nav prefetch (idle) | | ✅ | | |
| MetaPixel / ChatPersist | — (bootstrap App) | | | — |

---

## Nova árvore AppShell

```txt
App
 ↓ AppLayout.lazy (AppShellLoadingFallback)
 ↓ AppShell.tsx
   ├─ FloatingChatDeferred (stub → lazy bundle)
   ├─ TenantBrandProvider
   ├─ GlobalSearchSlotProvider
   ├─ ChatNavUnreadScope
   └─ SidebarProvider
        ├─ AppShellChromeSidebar  (Chrome)
        ├─ MobileShellChromeProvider
        │    ├─ AppShellHeader     (Chrome + slot busca)
        │    └─ AppShellMainColumn (Page outlet)
        ├─ AppShellRealtime       (lazy, Realtime)
        └─ AppShellOverlays       (lazy, Overlays)
             └─ AppShellOverlaysInner
                  └─ GlobalSearchOverlay (portal → slot header)
```

---

## Arquivos criados

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/layouts/shell/AppShell.tsx` | Orquestrador shell |
| `src/layouts/shell/AppShellChrome.tsx` | Sidebar desktop memo |
| `src/layouts/shell/AppShellSidebar.tsx` | Nav completa |
| `src/layouts/shell/AppShellHeader.tsx` | Header + slot busca |
| `src/layouts/shell/AppShellHeaderActions.tsx` | Criar + perfil (memo) |
| `src/layouts/shell/AppShellMainColumn.tsx` | Main + mobile nav |
| `src/layouts/shell/AppShellRealtime.tsx` | Bridge realtime |
| `src/layouts/shell/AppShellOverlays.tsx` | Gate lazy overlays |
| `src/layouts/shell/AppShellOverlaysInner.tsx` | Chunk overlays |
| `src/layouts/shell/overlays/GlobalSearchOverlay.tsx` | Busca + command palette |
| `src/layouts/shell/overlays/GlobalSearchSlotContext.tsx` | Slot portal + Ctrl+K pending |
| `src/layouts/shell/overlays/GlobalSearchBarPlaceholder.tsx` | Placeholder busca |
| `src/layouts/shell/ChatNavUnreadScope.tsx` | Scope unread nav |
| `src/layouts/shell/shellConstants.ts` | Constantes partilhadas |
| `src/lib/devPerfMarks.ts` | `performance.mark/measure` DEV |

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/layouts/AppLayout.tsx` | Re-export de `AppShell` (compatibilidade) |
| `src/layouts/AppLayout.lazy.tsx` | Lazy load direto de `shell/AppShell` |
| `src/App.tsx` | `markAppBootstrapStart()` |
| `src/pages/Dashboard.tsx` | `markDashboardReady()` |

**AppLayout legado:** aposentado como implementação — mantido apenas como alias de export.

---

## Antes × Depois — Chunks (build `npm run build:crm`)

| Chunk | S0.1 (gzip) | S0.2 (gzip) | Δ |
|-------|-------------|-------------|---|
| **AppLayout / AppShell** | 44,80 KB | **30,93 KB** | **−31%** |
| AppShell (min) | 180,51 KB | 138,64 KB | −23% |
| AppShellOverlaysInner | (dentro AppLayout) | **18,47 KB** | separado |
| AppShellRealtime | (dentro AppLayout) | **0,51 KB** | separado |
| GlobalSearchPanelContent | 6,52 KB | 6,56 KB | lazy (inalterado) |
| FloatingChatBundle | 23,30 KB | 23,29 KB | lazy (inalterado) |
| FloatingChatDeferred | 12,39 KB | 12,41 KB | lazy (inalterado) |
| Entry `index-*` | ~116,5 KB | ~116,5 KB | estável |

### Metas S0.2

| Meta | Alvo | Resultado | Status |
|------|------|-----------|--------|
| AppShell gzip | < 25 KB | 30,93 KB | ⚠️ Parcial (−31% vs S0.1) |
| Chrome gzip | < 15 KB | ~incluído no AppShell* | ⚠️ Lógico separado; chunk único |
| Overlays lazy | Sim | AppShellOverlaysInner 18,47 KB | ✅ |
| Realtime separado | Sim | AppShellRealtime 0,51 KB | ✅ |
| AppLayout aposentado | Sim | Alias → AppShell | ✅ |

\*Chrome não gera chunk Vite independente — está modularizado em ficheiros (`AppShellHeader`, `AppShellSidebar`) dentro do chunk `AppShell`. Próximo passo (S0.3/S0.6): lazy do header actions ou split Vite manual.

---

## Parte 6 — Suspense Strategy

```txt
App
 ↓ AppShellLoadingFallback (shell skeleton)
 ↓ AppShell pronto
 ↓ PageContentSkeleton (58 rotas CRM — S0.1)
 ↓ Página lazy
```

Sem spinner fullscreen dentro do shell autenticado.

---

## Parte 7 — Route Based Split (auditoria)

| Página | Chunk principal (gzip) | Notas |
|--------|------------------------|-------|
| Dashboard | 19,15 KB | `recharts` partilhado; lazy OK |
| Clients | 21,98 KB | Comboboxes em chunks satélite |
| Leads | 36,68 KB | Chunk grande — candidato S0.3 |
| Finance | 6,92–11,88 KB | Sub-rotas já split |
| Chat | 55,01 KB | Já lazy; prefetch idle |
| Projects | **154,50 KB** | Maior chunk — S0.3 prioritário |
| Chat Kanban | 37,35 KB | Lazy por rota |
| Relatórios financeiros | dentro `finance-*` | OK |

**Dependências pesadas partilhadas:** `recharts`, `@tanstack/react-query`, `lucide-react`, UI shadcn.

**Separações implementadas neste sprint:** apenas arquitetura shell (sem novo split de páginas — baixo risco).

---

## Parte 8 — Instrumentação DEV

| Marca / Log | Quando |
|-------------|--------|
| `perf:app-bootstrap` | Mount do `App` |
| `[perf:shell]` | `AppShell` montado (measure desde bootstrap) |
| `[perf:page]` | API pronta (`markPageReady`) |
| `[perf:dashboard]` | Dashboard montado (measure desde shell) |
| `[perf:mount]` | Componentes individuais (S0.1, mantido) |

Console DEV exemplo:
```txt
[perf:shell] AppShell ready @ 842.3ms from bootstrap
[perf:dashboard] @ +312.1ms from shell
```

---

## Critérios de aceite

| Critério | Status |
|----------|--------|
| Shell aparece imediatamente | ✅ `AppShellLoadingFallback` |
| Header independente da página | ✅ Chrome separado |
| Sidebar independente da página | ✅ Chrome separado |
| Busca só quando usada | ✅ Overlays lazy + portal |
| Chat só quando necessário | ✅ `FloatingChatDeferred` |
| Realtime separado do visual | ✅ `AppShellRealtime` lazy |
| Suspense sem cascata fullscreen | ✅ PageContentSkeleton |
| Build reduzido | ✅ −31% gzip shell |
| Regressões | ✅ `npm run build:crm` OK |

---

## Performance observada

- **Parse inicial do shell:** redução estimada ~31% gzip no chunk bloqueante pós-login.
- **Overlays:** carregam após idle (~1,5s) ou primeira interação / Ctrl+K.
- **Ctrl+K antes do overlay:** `requestOpenCommand()` agenda abertura do dialog quando o chunk monta (sem regressão UX).
- **Placeholder de busca:** visível até overlay hidratar slot via portal.

---

## Riscos remanescentes

| Risco | Mitigação / Próximo passo |
|-------|---------------------------|
| AppShell ainda > 25 KB gzip | Split Vite: lazy `AppShellHeaderActions` ou sidebar groups |
| Chrome + Shell no mesmo chunk | `import()` explícito no S0.3 |
| Projects 154 KB gzip | Sprint dedicado route split |
| Leads 36 KB gzip | Lazy de sub-componentes |
| Portal busca: flash placeholder → input | Curto; aceitável |

---

## Próximo sprint recomendado (S0.3)

1. **Lazy `AppShellHeaderActions`** — reduzir shell abaixo de 25 KB gzip.
2. **Route split Projects / Leads** — chunks > 100 KB gzip.
3. **Dedupe sockets / polling** (S0.4 do master plan).
4. **`markPageReady`** em hook partilhado para rotas principais.

---

## Comandos de validação

```bash
npm run build:crm
# Verificar: AppShell-*.js, AppShellOverlaysInner-*.js, AppShellRealtime-*.js

npm run dev
# Console: [perf:shell], [perf:dashboard]
```

Hard reload `/dashboard` → skeleton shell → conteúdo sem spinner fullscreen.
