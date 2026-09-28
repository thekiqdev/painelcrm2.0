# P1 — Auditoria do Bundle

**Data:** 2026-06-22  
**Comando:** `npm run analyze` (`ANALYZE=1 vite build`)  
**Artefato visual:** `dist/stats.html` (rollup-plugin-visualizer)

## Resumo executivo

| Métrica | Valor |
|---------|-------|
| Módulos transformados | 4.523 |
| CSS principal (`index-*.css`) | 322 KB (gzip 47 KB) |
| PDF worker (lazy, não no bootstrap) | 1.370 KB |
| Chunks > 500 KB (warning Vite) | 2 (`Settings`, `Projects`) |

O **caminho crítico autenticado** carrega ~1,2 MB de JS minificado antes de qualquer página de domínio: entry + vendor React + `AppLayout`.

## Top 20 chunks JS (minificado, produção)

| # | Arquivo | Tamanho | Gzip | Notas |
|---|---------|---------|------|-------|
| 1 | `Settings-*.js` | 667 KB | 92 KB | TipTap, formulários, muitas seções |
| 2 | `Projects-*.js` | 558 KB | 155 KB | `@dnd-kit`, Gantt, finance embed |
| 3 | `index-B0aWZDQw.js` | 479 KB | 116 KB | Vendor/shared app deps |
| 4 | `BarChart-*.js` | 370 KB | 102 KB | Recharts (financeiro/dashboard) |
| 5 | `index-1weHdESK.js` | 365 KB | 117 KB | **Entry bootstrap** (`App.tsx`, rotas, RQ) |
| 6 | `pdfWorker-*.js` | 347 KB | 104 KB | PDF.js worker (sob demanda) |
| 7 | `react-vendor-*.js` | 342 KB | 105 KB | React + react-dom |
| 8 | **`AppLayout-*.js`** | **306 KB** | **68 KB** | **Shell CRM — crítico** |
| 9 | `Agenda-*.js` | 268 KB | 39 KB | FullCalendar + views |
| 10 | `Chat-*.js` | 248 KB | 55 KB | Página chat + socket dedicado |
| 11 | `ChatKanbanPage-*.js` | 223 KB | 37 KB | Kanban + socket |
| 12 | `ClientProfile-*.js` | 215 KB | 32 KB | Perfil + socket próprio |
| 13 | `Leads-*.js` | 195 KB | 37 KB | Kanban leads |
| 14 | `ContractCreateForm-*.js` | 170 KB | 37 KB | Editor rich text |
| 15 | `ProjectVersionControlPanel-*.js` | 165 KB | 25 KB | Versionamento |
| 16 | `AcquisitionSignupFlow-*.js` | 161 KB | 27 KB | Fluxo público |
| 17 | `AcquisitionOperationalOnboarding-*.js` | 160 KB | 25 KB | Onboarding |
| 18 | `VirtualizedMessageItem-*.js` | 148 KB | 25 KB | Chat virtualização |
| 19 | `FinancialAccountsPayablePage-*.js` | 136 KB | 17 KB | Financeiro |
| 20 | `Dashboard-*.js` | 131 KB | 19 KB | Primeira página típica |

## Bootstrap inicial (não lazy)

Carregados antes da primeira rota protegida renderizar conteúdo:

```
index.html
  → main.tsx
  → App.tsx (entry index-1weHdESK + index-B0aWZDQw)
      → react-vendor
      → QueryClient, AuthProvider, ThemeProvider, Router
      → ~130 lazyWithReload() declarations (só factories, não código das páginas)
```

**Estimativa gzip do critical path:** ~117 + 116 + 105 ≈ **338 KB JS** + **47 KB CSS** ≈ **385 KB** comprimido (sem AppLayout/Dashboard).

Após login em `/dashboard`:

```
+ AppLayout (~68 KB gzip)
+ Dashboard (~19 KB gzip)
```

## Code splitting manual (`vite.config.ts`)

```ts
manualChunks:
  - socket.io-client → "socket.io" (41 KB / 13 KB gzip)
  - react-dom + react → "react-vendor"
  - react-router → "router" (31 KB / 11 KB gzip)
```

**Observação:** A maioria dos `node_modules` vai para os chunks `index-*`, não para vendors nomeados — oportunidade de extrair `recharts`, `@tiptap/*`, `@dnd-kit/*`.

## Fragmentação excessiva

- **~470 chunks** no `dist/assets/` (muitos < 1 KB: ícones lucide tree-shaken por rota).
- **Over-splitting:** cada ícone/utilitário vira chunk micro — aumenta requests HTTP/2 mas reduz cache hit em deploys frequentes.
- **Sub-suspense em cascata:** `App.tsx` → `AppLayout.lazy` → `Dashboard` lazy = 3 níveis de fallback.

## Dependências pesadas no bootstrap (via `App.tsx`)

| Biblioteca | No entry? | Onde deveria estar |
|------------|-----------|-------------------|
| `@tanstack/react-query` | Sim | OK (global) |
| `react-router-dom` | Sim | OK |
| `next-themes` | Sim | OK |
| `EntityDrawerContainer` | Sim | Avaliar lazy |
| `MetaPixelTrackingBridge` | Sim | Defer pós-idle |
| `ChatQueryPersistBridge` | Sim | Defer até auth+chat |
| `ChatRouteTimingListener` | Sim | Dev/metrics only? |

## Duplicações prováveis

- **date-fns** em múltiplos chunks (cada página importa funções distintas).
- **Recharts** em `BarChart` + páginas financeiras que importam charts diretamente.
- **socket.io-client** isolado em chunk próprio, mas **4 pontos de conexão** no runtime (ver `realtime-analysis.md`).

## Recomendações priorizadas

1. **P0 — AppLayout (306 KB):** lazy de `GlobalSearchPanelContent`, `FloatingChatProvider` internals, `CommandDialog`.
2. **P0 — Extrair vendors:** `recharts`, `@tiptap/*`, `pdfjs` para chunks nomeados no `manualChunks`.
3. **P1 — Settings/Projects:** já lazy por rota; evitar preload agressivo.
4. **P2 — Micro-chunks:** `experimentalMinChunkSize` ou consolidar ícones via barrel controlado.
5. **P2 — CSS 322 KB:** auditar Tailwind purge / classes duplicadas de landing no bundle CRM.

## Critério de aceite

| Meta | Estado atual (estimado) |
|------|-------------------------|
| FCP < 1s | ⚠️ Depende de rede; bootstrap ~385 KB gzip |
| Bundle inicial reduzido | AppLayout + entry são os maiores alvos |
