# AUDIT_PROJECTS_ROUTE_SPLIT — Plano de Split

**Modo:** READ ONLY (auditoria — sem implementação)  
**Data:** 2026-06-23  
**Build:** `npm run build:crm` (pós S0.2 + S0.3.3 Dashboard)  
**Entrada:** `src/pages/Projects.tsx` → chunk `Projects-*.js`

---

## Executive summary

A rota `/projects` carrega um **monólito síncrono** de ~2.846 linhas em `Projects.tsx` com **26+ imports estáticos** de views, tabs, modais e utilitários. O chunk principal mede **154,50 KB gzip** (557,53 KB min), mas o **custo real da navegação** inclui **8+ chunks satélite** que também disparam no primeiro paint da rota.

| Métrica | Valor |
|---------|-------|
| Chunk `Projects-*.js` | **154,50 KB gzip** |
| Árvore Projects (chunks dedicados) | **~359 KB gzip** (estimativa somada) |
| Meta proposta | **< 70 KB gzip** no chunk crítico |
| Ganho necessário | **~85 KB gzip** no chunk principal + adiar satélites |

**Achados críticos:**

1. **`xlsx` embutido no chunk Projects** (~35–45 KB gzip) via import estático de `importProjectTasksXlsx.ts` — usado só no handler de upload.
2. **TipTap (`index-CBGuRzT7.js`, 116,51 KB gzip)** carrega na rota via `SystemRichEditor` (TaskFormDialog, TaskSidePanel, ProjectSettingsDialog) — editor não é necessário no mount do catálogo.
3. **`TaskSidePanel` (~3.020 LOC)** no bundle principal — drawer pesado com editor, advanced fields e portal.
4. **`ClientDriveFileManager` + `@dnd-kit/core`** (12,13 + 14,50 KB gzip) importados estaticamente via `ProjectDriveWorkspace`, mesmo quando tab Documentos não está ativa.
5. **Sem Gantt, sem Recharts, sem Timeline dedicada** nesta rota; kanban de tarefas usa drag **pointer nativo** em `BoardView` (não `@dnd-kit`).

---

## 1. Estrutura da rota

### 1.1 Entry e lazy boundary

```tsx
// src/App.tsx
const Projects = lazyWithReload(() => import("./pages/Projects"));
const ProjectWizardPage = lazyWithReload(() => import("./pages/ProjectWizardPage"));
```

| Rota | Componente | Chunk gzip | No bundle Projects? |
|------|------------|------------|---------------------|
| `/projects`, `/projects/:id` | `Projects.tsx` | 154,50 KB | — |
| `/projects/new` | `ProjectWizardPage` | 9,34 KB | ❌ Rota separada |

### 1.2 Modos de `Projects.tsx`

| Modo | State | Subviews |
|------|-------|----------|
| **Catálogo** | `viewMode === "list"` | `ProjectsGridView` \| `ProjectsListView` \| `BoardView` (kanban de projetos) |
| **Detalhe** | `viewMode === "detail"` | `renderProjectDetail()` — header, versões, áreas, tabs |

### 1.3 Tabs no detalhe (`activeTab`, default `"board"`)

| Tab | Valor | Conteúdo | Projeto simples | Projeto c/ áreas | Projeto advanced |
|-----|-------|----------|-----------------|------------------|------------------|
| Etapas | `board` | `BoardView` | ✅ | ❌ (tarefas nas áreas) | ❌ |
| Tarefas | `list` | `TaskListView` | ✅ | ❌ | ❌ |
| Documentos | `files` | `ProjectDriveWorkspace` → `ClientDriveFileManager` | ✅ | ✅ | ✅ |
| Calendário | `calendar` | `CalendarView` (shadcn Calendar) | ✅ | ✅ | ✅ |
| Financeiro | `finance` | `ProjectFinance` | ✅ | ✅ | ✅ |

**Catálogo** (`projectsViewType`): `grid` (default implícito) \| `list` \| `kanban` — apenas **uma** subview montada por vez.

### 1.4 Componentes importados síncronamente em `Projects.tsx`

```
Views:     ProjectsGridView, ProjectsListView, BoardView, TaskListView, CalendarView
Painéis:   ProjectHeader, ProjectAreasSection, ProjectVersionControlPanel,
           ProjectDriveWorkspace, ProjectFinance, TaskSidePanel
Modais:    TaskDetailDialog, TaskFormDialog, NewListDialog, EditListDialog,
           ProjectSettingsDialog, SaveAsTemplateDialog, ProjectVersionDialog,
           MoveProjectTaskDialog, CopyProjectTaskDialog, ProjectPublishVersionDialog,
           ProjectDuplicateVersionDialog
Utils:     importProjectsCsv, importProjectTasksXlsx (→ xlsx), taskUnified mappers
```

### 1.5 Drawers e overlays

| UI | Componente | Montagem | Código no bundle inicial? |
|----|------------|----------|---------------------------|
| Create Project | Link → `/projects/new` | Rota separada | ❌ (9,34 KB gzip aparte) |
| Edit Project | `ProjectSettingsDialog` | `open={projectSettingsOpen}` | ✅ Síncrono |
| Finance | `ProjectFinance` (tab) | Tab + import estático | ✅ Síncrono |
| Upload Drive | `ProjectDriveWorkspace` | Tab files (guard parcial em advanced) | ✅ Síncrono (import chain) |
| Task Details | `TaskDetailDialog` | `open={taskDetailOpen}` | ✅ Síncrono |
| Task Full / Edit | `TaskSidePanel` | `open={!!fullViewTask}` | ✅ Síncrono (~3k LOC) |
| Import CSV/XLSX | `<Dialog>` inline + handlers | Sob demanda UX, **import xlsx no topo** | ✅ xlsx no chunk |
| Version Timeline | `ProjectVersionControlPanel` | Condicional `hasVersions()` | ✅ Chunk satélite 24,83 KB |
| Team filter (mobile) | Radix `Sheet` | Catálogo mobile | ✅ Leve |

**Nota:** Radix `Dialog`/`Sheet` com `open={false}` **não monta conteúdo pesado**, mas o **módulo JS já foi parseado** porque o import é estático no topo do arquivo.

---

## 2. Bundle breakdown

### 2.1 Chunks da árvore `/projects` (build evidência)

| Chunk | Gzip | Min | Disparo |
|-------|------|-----|---------|
| **`Projects-*.js`** | **154,50 KB** | 557,53 KB | Entry da rota |
| `index-CBGuRzT7.js` (TipTap) | 116,51 KB | 364,86 KB | `SystemRichEditor` |
| `ProjectVersionControlPanel-*.js` | 24,83 KB | 165,22 KB | Import estático |
| `core.esm-*.js` (@dnd-kit/core) | 14,50 KB | 43,59 KB | `ClientDriveFileManager` |
| `taskUnified-*.js` | 12,54 KB | 75,33 KB | `BoardView` → `UnifiedTaskCard`, `TaskFormDialog` |
| `ClientDriveFileManager-*.js` | 12,13 KB | 59,10 KB | `ProjectDriveWorkspace` |
| `finance-*.js` | 11,88 KB | 51,44 KB | `ProjectFinance` |
| `calendar-CbdOwu2G.js` | 11,04 KB | 34,75 KB | Date pickers / Calendar UI |
| `SystemRichEditor-*.js` | 1,74 KB | 7,89 KB | Wrapper TipTap |
| **Soma satélites + Projects** | **~359 KB** | — | Primeira visita à rota |

Imports confirmados no header de `Projects-*.js` (build):

```
ProjectVersionControlPanel, taskUnified, ClientDriveFileManager, SystemRichEditor,
core.esm (@dnd-kit), calendar, finance, … + xlsx inlined (codepage tables no chunk)
```

### 2.2 Breakdown estimado **dentro** do chunk `Projects-*.js` (154 KB)

Estimativas por análise de LOC, imports e assinaturas no bundle minificado (`Mo=1252`, codepages xlsx).

| Componente / módulo | Gzip est. | Dependências |
|---------------------|-----------|--------------|
| **`xlsx` (import estático)** | **~38–45 KB** | `importProjectTasksXlsx.ts` |
| **`Projects.tsx` (orquestração)** | **~28–35 KB** | RQ, router, services, ~2.846 LOC handlers |
| **`TaskSidePanel`** | **~22–28 KB** | TipTap (chunk aparte), TaskAdvancedFields, portal |
| **`BoardView` + `TaskListView`** | **~18–24 KB** | `UnifiedTaskCard` → chunk `taskUnified` |
| **`ProjectSettingsDialog`** | **~10–14 KB** | TipTap, tabs, membros |
| **Dialogs versão / tarefa / listas** | **~8–12 KB** | 8 modais síncronos |
| **`ProjectAreasSection` + `ProjectHeader`** | **~8–10 KB** | UI + CRUD áreas |
| **Catálogo (`GridView`, `ListView`)** | **~6–8 KB** | Leve |
| **`CalendarView`** | **~3–4 KB** | shadcn Calendar (chunk shared) |
| **`TaskDetailDialog`** | **~5–7 KB** | Textarea, calendar popover |
| **`importProjectsCsv`** | **~2–3 KB** | Parser CSV puro |
| **Demais UI/helpers** | **~8–12 KB** | sanitize, date-fns parcial, collapsible |

### 2.3 Bibliotecas investigadas (Gantt, DnD, Charts…)

| Biblioteca | Presente na rota Projects? | Evidência |
|------------|------------------------------|-----------|
| **Gantt** | ❌ Não | Nenhum import em `src/components/projects/` |
| **Recharts / Charts** | ❌ Não | Sem imports em projects |
| **Timeline** | ❌ Componente dedicado | Release notes em `ProjectVersionSummary` (texto) |
| **Kanban (tarefas)** | ✅ Custom | `BoardView` — pointer events, sem `@dnd-kit` |
| **Kanban (catálogo)** | ✅ | `BoardView` com `isProjectView` |
| **@dnd-kit** | ✅ Tab Documentos | `ClientDriveFileManager` → `core.esm` 14,50 KB |
| **Calendar** | ✅ | `CalendarView` + date pickers em forms |
| **TipTap / Rich Editor** | ✅ | `SystemRichEditor` → 116 KB gzip satélite |
| **File Manager** | ✅ | `ClientDriveFileManager` 12,13 KB |
| **xlsx** | ✅ | Inlined no chunk Projects |

---

## 3. Tabs — mount vs lazy

| Tab / subview | Carrega no mount? | Pode ser lazy? | Notas |
|---------------|-------------------|----------------|-------|
| Catálogo Grid | ✅ Se `projectsViewType=grid` | ✅ P1 | Default comum |
| Catálogo List | ❌ Só se user escolhe | ✅ P0 | `import()` sob demanda |
| Catálogo Kanban | ❌ Só se user escolhe | ✅ P0 | `BoardView` pesado |
| Detalhe — board | ✅ Default `activeTab=board` | ⚠️ P1 | Critical path simple project |
| Detalhe — list | ⚠️ Radix `TabsContent` monta | ✅ P0 | Lazy tab split |
| Detalhe — files | ⚠️ Import estático sempre | ✅ P0 | Guard `activeTab==="files"` só em advanced |
| Detalhe — calendar | ⚠️ Parcial advanced | ✅ P0 | Guard `activeTab !== "calendar"` em advanced |
| Detalhe — finance | ⚠️ Parcial advanced | ✅ P0 | `ProjectFinance` + chunk finance 11,88 KB |
| Áreas (release) | ✅ Se `hasAreas()` | P2 | Navega para sub-rota de área |

**Mount inicial típico (usuário abre `/projects`):**

- Catálogo: `ProjectsGridView` + **todo** o JS de modais/drawers/xlsx/tiptap satélite.
- Detalhe direto (`/projects/:id`): `BoardView` + versões + tabs shell + mesmos modais.

---

## 4. Drawers e modais — bundle inicial

| Modal / Drawer | Import | Bundle inicial | Lazy candidato |
|----------------|--------|----------------|----------------|
| Create Project | Rota `/projects/new` | ❌ Fora | Já OK |
| Edit Project (`ProjectSettingsDialog`) | Síncrono L33 | ✅ | **P0** |
| Finance (tab) | Síncrono L32 | ✅ | **P0** |
| Upload / Drive | Síncrono L43 | ✅ | **P0** |
| Task Details (`TaskDetailDialog`) | Síncrono L19 | ✅ | **P0** |
| Task Side Panel | Síncrono L54 | ✅ | **P0** |
| Task Create (`TaskFormDialog`) | Síncrono L20 | ✅ (taskUnified) | **P0** |
| Import CSV dialog | Inline Projects | ✅ | P1 (CSV leve) |
| Import XLSX | Inline + **xlsx top-level** | ✅ **xlsx ~40KB** | **P0** |
| Version dialogs (×4) | Síncrono L36–40 | ✅ | **P0** |
| Version Control Panel | Síncrono L42 | ✅ satélite 24,83 KB | **P0** |

---

## 5. Dependências pesadas (> 10 KB gzip) na rota Projects

| Biblioteca | Gzip | Uso na rota Projects |
|------------|------|----------------------|
| **TipTap** (`index-CBGuRzT7.js`) | 116,51 KB | `TaskSidePanel`, `TaskFormDialog`, `ProjectSettingsDialog` |
| **xlsx** (inlined) | ~38–45 KB (est.) | `prepareTasksFromProjectTasksXlsx` |
| **Chunk Projects** (app code) | 154,50 KB | Orquestrador + painéis inlined |
| **@dnd-kit/core** | 14,50 KB | `ClientDriveFileManager` (tab Documentos) |
| **taskUnified chunk** | 12,54 KB | Cards, form create, advanced fields |
| **ClientDriveFileManager** | 12,13 KB | Google Drive browser |
| **finance module chunk** | 11,88 KB | `ProjectFinance` |
| **react-day-picker / calendar** | 11,04 KB | Calendários em views e forms |

---

## 6. Lazy candidates

### P0 — Lazy imediato (alto impacto, baixo risco)

| Alvo | Ganho est. | Ação |
|------|------------|------|
| **`importProjectTasksXlsx` / `xlsx`** | **~38–45 KB** no chunk Projects | `import()` no `handleTasksXlsxChange` |
| **`TaskSidePanel`** | **~22–28 KB** + adia TipTap | `lazy(() => import('@/components/tasks/TaskSidePanel'))` + Suspense |
| **`ProjectSettingsDialog`** | **~10–14 KB** + TipTap | Lazy on `projectSettingsOpen` |
| **`ProjectDriveWorkspace`** | **~26 KB** (drive + dnd-kit) | Lazy tab `files` |
| **`ProjectFinance`** | **~12 KB** | Lazy tab `finance` |
| **`ProjectVersionControlPanel` + dialogs versão** | **~30 KB** | Lazy quando `hasVersions()` && projeto aberto |
| **`TaskFormDialog` / `TaskDetailDialog`** | **~12–15 KB** + TipTap | Lazy on first open |
| **`CalendarView`** | **~3 KB** + calendar chunk compartilhado | Lazy tab `calendar` |

### P1 — Lazy com baixo risco

| Alvo | Ganho est. | Ação |
|------|------------|------|
| Catálogo `BoardView` / `ProjectsListView` | **~12–18 KB** | Lazy por `projectsViewType` |
| `BoardView` vs `TaskListView` (tabs) | **~10–15 KB** | Tab-level `React.lazy` |
| `SaveAsTemplateDialog`, move/copy task dialogs | **~5–8 KB** | Lazy on action |
| `importProjectsCsv` | **~2–3 KB** | Dynamic import no handler CSV |

### P2 — Exige refactor

| Alvo | Motivo |
|------|--------|
| **`Projects.tsx` monólito (2.846 LOC)** | Extrair `ProjectsCatalog`, `ProjectDetail`, hooks (`useProjectTasks`, `useProjectVersions`) |
| **`taskUnified` chunk compartilhado com `/tasks`** | Split `UnifiedTaskCard` vs `TaskFormDialog` para não puxar form no board |
| **TipTap shared 116 KB** | Chunk manual `editor-vendor` + lazy único; considerar editor leve para descrições curtas |
| **Projetos com áreas** | Board/list vivem em sub-rota `/projects/:id/areas/:areaId` — lazy natural por navegação |
| **Prefetch sidebar** | Evitar prefetch de Projects até hover/intent |

---

## 7. Top responsáveis pelos 154 KB

| # | Responsável | Gzip (chunk Projects ou inlined) | % do chunk |
|---|-------------|----------------------------------|------------|
| 1 | **xlsx** (import estático) | ~38–45 KB | ~25–29% |
| 2 | **Projects.tsx** handlers/state | ~28–35 KB | ~18–23% |
| 3 | **TaskSidePanel** | ~22–28 KB | ~14–18% |
| 4 | **BoardView + TaskListView** | ~18–24 KB | ~12–16% |
| 5 | **ProjectSettingsDialog** | ~10–14 KB | ~6–9% |
| 6 | **Dialogs versão/lista/tarefa** | ~8–12 KB | ~5–8% |
| 7 | **ProjectAreasSection + Header** | ~8–10 KB | ~5–6% |
| 8 | **Demais** | ~8–15 KB | ~5–10% |

**Fora do chunk 154 KB mas no critical path da rota:**

| # | Responsável | Gzip |
|---|-------------|------|
| A | **TipTap** | 116,51 KB |
| B | **ProjectVersionControlPanel** | 24,83 KB |
| C | **ClientDrive + dnd-kit** | 26,63 KB |
| D | **taskUnified** | 12,54 KB |
| E | **finance + calendar** | ~23 KB |

---

## 8. Ordem ideal de lazy loading (S0.3.1 sugerido)

Ordem por **impacto × facilidade**, espelhando o sucesso de S0.3.3 (Dashboard charts):

| Fase | Escopo | Ganho acumulado est. (chunk Projects) | Risco |
|------|--------|---------------------------------------|-------|
| **1** | Dynamic `import('xlsx')` no upload XLSX | **−40 KB** → ~115 KB | Baixo |
| **2** | Lazy `TaskSidePanel` + `TaskFormDialog` + `TaskDetailDialog` | **−25 KB** → ~90 KB; adia TipTap 116 KB | Baixo |
| **3** | Lazy tabs: `ProjectDriveWorkspace`, `ProjectFinance`, `CalendarView` | **−5 KB** chunk + adia ~50 KB satélite | Baixo |
| **4** | Lazy `ProjectSettingsDialog` + version dialogs + `ProjectVersionControlPanel` | **−15 KB** chunk + 25 KB satélite | Médio |
| **5** | Lazy catálogo views (`ListView`, kanban `BoardView`) | **−12 KB** → **~63–68 KB** | Baixo |
| **6** | Refactor `Projects.tsx` em sub-módulos (P2) | Manutenção + prefetch fino | Médio |

---

## 9. Meta de chunk final

| Cenário | Chunk `Projects-*.js` | TipTap / satélites | Notas |
|---------|----------------------|-------------------|-------|
| **Hoje** | 154,50 KB | +~205 KB gzip paralelo | Monólito + TipTap no path |
| **Após fases 1–4** | ~85–95 KB | TipTap lazy (~116 KB fora do path inicial) | Ainda acima da meta |
| **Após fases 1–5** | **~63–70 KB** ✅ | Satélites on-demand | **Meta < 70 KB** |
| **Stretch (P2)** | **~45–55 KB** | Shell + grid only | Requer split arquitetural |

**Definição de sucesso:** usuário abre `/projects` (catálogo grid) → baixa **≤ 70 KB gzip** do chunk `Projects-*` + chunks compartilhados já cacheados (router, UI). TipTap, xlsx, Drive e Finance só após interação explícita.

---

## 10. Referências de código

Imports síncronos (raiz do problema):

```13:78:src/pages/Projects.tsx
// Importações de componentes
import { ProjectsGridView } from "@/components/projects/ProjectsGridView";
import { ProjectsListView } from "@/components/projects/ProjectsListView";
import { BoardView } from "@/components/projects/BoardView";
// … 20+ imports adicionais incluindo ProjectFinance, TaskSidePanel, ProjectDriveWorkspace
import {
  prepareTasksFromProjectTasksXlsx,
} from "@/utils/importProjectTasksXlsx";
```

xlsx no topo do utilitário (puxado para o chunk Projects):

```1:3:src/utils/importProjectTasksXlsx.ts
import * as XLSX from "xlsx";
import type { Member } from "@/services/members";
```

Guard parcial de tab files (import ainda estático):

```2206:2216:src/pages/Projects.tsx
<TabsContent value="files">
  {isAdvancedProject ? (
    selectedProject.client_id ? (
      activeTab === "files" ? (
        <ProjectDriveWorkspace … />
      ) : null
```

Create project já fora do monólito:

```68:69:src/App.tsx
const Projects = lazyWithReload(() => import("./pages/Projects"));
const ProjectWizardPage = lazyWithReload(() => import("./pages/ProjectWizardPage"));
```

---

## 11. Test plan (pós-implementação futura)

- [ ] `/projects` catálogo: Network → `Projects-*.js` ≤ 70 KB gzip
- [ ] Abrir projeto simples: tab Etapas (board) funciona; list/files/calendar/finance lazy OK
- [ ] Import XLSX: chunk xlsx só após selecionar arquivo
- [ ] Task side panel: TipTap carrega ao abrir tarefa completa
- [ ] Projeto advanced + versões: painel versões lazy após abrir detalhe
- [ ] `/projects/new`: continua rota separada (~9 KB gzip)
- [ ] Regressão drag board (pointer) e Drive (dnd-kit)

---

## 12. Relacionados

- `docs/performance/PERFORMANCE_FORENSICS_V2.md` — Projects P0 (154 KB)
- `docs/performance/PERFORMANCE_REMEDIATION_PLAN_V2.md` — S0.3.1 Projects split
- `docs/performance/S0_3_3_DASHBOARD_CHARTS_LAZY.md` — padrão de referência (lazy + Suspense)
