# S0.3.1-A — Projects Critical Path Reduction — Relatório

**Data:** 2026-06-23  
**Base:** `PROJECTS_SPLIT_PLAN.md` (P0 fases 1–3)  
**Escopo:** Redução do chunk crítico `/projects` — sem refactor arquitetural, sem alteração de APIs/RQ/regras de negócio

---

## Objetivo

Executar itens P0 de maior ROI:

1. **XLSX on demand** — remover `xlsx` do critical path
2. **Lazy dialogs** — TaskSidePanel, TaskFormDialog, TaskDetailDialog, ProjectSettingsDialog
3. **Lazy version components** — ProjectVersionControlPanel + dialogs de versão/template

---

## Implementação

### Fase 1 — XLSX on demand

**Arquivo:** `src/utils/importProjectTasksXlsx.ts`

- Removido `import * as XLSX from "xlsx"` do topo do módulo
- `prepareTasksFromProjectTasksXlsx` passou a ser `async` com `const XLSX = await import("xlsx")` dentro da função
- `prepareTasksFromProjectTasksCsv` permanece síncrono (sem xlsx)

**Arquivo:** `src/pages/Projects.tsx`

- `handleTasksXlsxChange` usa `await prepareTasksFromProjectTasksXlsx(...)` no fluxo de ficheiro `.xlsx/.xls`

### Fase 2 — Lazy dialogs

**Arquivo:** `src/pages/Projects.tsx`

| Componente | Lazy import | Montagem condicional |
|------------|-------------|----------------------|
| `TaskFormDialog` | `@/components/tasks` | `selectedProject && selectedListId && newTaskDialogOpen` |
| `TaskDetailDialog` | `@/components/projects/TaskDetailDialog` | `taskDetailOpen` |
| `TaskSidePanel` | `@/components/tasks` | `fullViewTask` |
| `ProjectSettingsDialog` | `@/components/projects/ProjectSettingsDialog` | `projectSettingsOpen` |

Todos envolvidos em `<Suspense fallback={null}>`.

### Fase 3 — Lazy version components

| Componente | Montagem condicional |
|------------|----------------------|
| `ProjectVersionControlPanel` | `hasVersions()` dentro de `renderProjectDetail()` + Suspense |
| `ProjectVersionDialog` | `versionDialogOpen` |
| `ProjectPublishVersionDialog` | `publishVersionOpen` |
| `ProjectDuplicateVersionDialog` | `duplicateVersionOpen` |
| `SaveAsTemplateDialog` | `saveAsTemplateOpen` |

**Fora do escopo (inalterado):** Drive, Finance, Calendar, refactor de `Projects.tsx`, split `taskUnified`, TipTap vendor, RQ, realtime.

---

## Antes × Depois

Build: `npm run build:crm`

| Chunk | Antes (gzip / min) | Depois (gzip / min) | Δ gzip |
|-------|-------------------|---------------------|--------|
| **`Projects-*.js`** | **154,50 KB** / 557,53 KB | **34,38 KB** / 176,83 KB | **−120,12 KB (−78%)** |
| `xlsx-*.js` | *(inlined no Projects)* | **143,20 KB** / 429,31 KB | Fora do critical path |
| `ProjectVersionControlPanel-*.js` | 24,83 KB / 165,22 KB | **5,49 KB** / 34,42 KB | Lazy (só detalhe c/ versões) |
| `taskUnified-*.js` | 12,54 KB / 75,33 KB | **4,43 KB** / 21,75 KB | Só mappers/cards no path |
| `TaskFormDialog-*.js` | *(no Projects/taskUnified)* | **8,81 KB** / 53,90 KB | Novo chunk lazy |
| `TaskSidePanel-*.js` | *(no Projects)* | **6,75 KB** / 38,64 KB | Novo chunk lazy |
| `ProjectSettingsDialog-*.js` | *(no Projects)* | **6,54 KB** / 43,06 KB | Novo chunk lazy |
| `TaskDetailDialog-*.js` | *(no Projects)* | **3,76 KB** / 20,39 KB | Novo chunk lazy |
| `SaveAsTemplateDialog-*.js` | *(no Projects)* | **2,63 KB** / 11,51 KB | Novo chunk lazy |
| `ProjectVersionDialog-*.js` | *(no Projects)* | **2,13 KB** / 9,21 KB | Novo chunk lazy |
| `ProjectPublishVersionDialog-*.js` | — | **1,56 KB** / 6,98 KB | Novo chunk lazy |
| `ProjectDuplicateVersionDialog-*.js` | — | **1,17 KB** / 5,23 KB | Novo chunk lazy |
| `SystemRichEditor-*.js` | 1,74 KB (path imediato) | 1,75 KB | Adiado até abrir dialog c/ editor |
| `index-CBGuRzT7.js` (TipTap) | ~116 KB (path imediato) | Fora do mount catálogo | Adiado com dialogs lazy |

### Meta vs resultado

| Meta | Resultado |
|------|-----------|
| Chunk Projects **< 70 KB gzip** | **34,38 KB gzip** ✅ |

---

## Ganho estimado

| Métrica | Valor |
|---------|-------|
| **Redução chunk Projects** | **−120 KB gzip** (154,5 → 34,4) |
| **xlsx removido do critical path** | ~143 KB gzip (carrega só no upload) |
| **TipTap removido do mount catálogo** | ~116 KB gzip (carrega com dialogs) |
| **Chunks lazy criados** | 9 novos chunks nomeados |
| **Componentes lazy adicionados** | 9 (`TaskFormDialog`, `TaskSidePanel`, `TaskDetailDialog`, `ProjectSettingsDialog`, `ProjectVersionControlPanel`, `SaveAsTemplateDialog`, `ProjectVersionDialog`, `ProjectPublishVersionDialog`, `ProjectDuplicateVersionDialog`) |

**Critical path típico** (abrir `/projects` catálogo grid):

- **Antes:** ~154 KB Projects + ~117 KB TipTap + satélites ≈ **270+ KB gzip** parse inicial
- **Depois:** **~34 KB** Projects + `projectVersionSelection` (~8,5 KB) + `taskUnified` reduzido (~4,4 KB) ≈ **~47 KB gzip** antes de interação

---

## Validação

| Check | Status |
|-------|--------|
| `npm run build:crm` | ✅ Exit 0 |
| ESLint ficheiros alterados | ⚠️ 2 erros `no-explicit-any` pré-existentes em `Projects.tsx` (L1333, L1523); 7 warnings hooks pré-existentes — **nenhum novo erro introduzido** |
| Dialogs lazy (mount condicional) | ✅ Implementado |
| Upload XLSX (dynamic import) | ✅ `xlsx-*.js` chunk separado confirmado no build |

### Testes manuais recomendados

- [ ] `/projects` — catálogo carrega sem erros de Suspense
- [ ] Criar tarefa → `TaskFormDialog` abre após lazy load
- [ ] Detalhe tarefa → `TaskDetailDialog` / `TaskSidePanel`
- [ ] Configurações projeto → `ProjectSettingsDialog`
- [ ] Projeto com versões → painel versões + dialogs publish/duplicate/edit
- [ ] Import `.xlsx` de tarefas → sucesso + chunk `xlsx` no Network

---

## Regressões / riscos

| Risco | Severidade | Mitigação |
|-------|------------|-----------|
| **Flash ao abrir dialog** (`Suspense fallback={null}`) | Baixa | Primeira abertura pode ter ~100–300 ms até chunk; UX igual após load |
| **TaskFormDialog desmonta ao fechar** | Baixa | Estado `newTaskDialogOpen` remonta dialog; formulário reinicia (comportamento Radix equivalente) |
| **Import XLSX async** | Baixa | Handler já era `async`; `await` adicionado sem mudar fluxo de negócio |
| **ProjectVersionControlPanel lazy no detalhe** | Baixa | Breve delay ao abrir projeto com versões; painel aparece após chunk |
| **TipTap ainda pesado quando editor abre** | Média | Fora do escopo S0.3.1-A; próximo sprint (vendor split) |
| **Drive / Finance / Calendar ainda no chunk** | Média | Fora do escopo; ~20–35 KB gzip adicionais possíveis em S0.3.1-B |
| **`ClientDriveFileManager` + dnd-kit no import estático** | Média | Permanece via `ProjectDriveWorkspace`; não afeta meta < 70 KB já atingida |

---

## Ficheiros alterados

| Ficheiro | Alteração |
|----------|-----------|
| `src/utils/importProjectTasksXlsx.ts` | Dynamic import xlsx; função async |
| `src/pages/Projects.tsx` | `lazy` + `Suspense` + mount condicional (9 componentes) |

---

## Relacionados

- `docs/performance/PROJECTS_SPLIT_PLAN.md` — auditoria origem
- `docs/performance/S0_3_3_DASHBOARD_CHARTS_LAZY.md` — padrão lazy + Suspense de referência
