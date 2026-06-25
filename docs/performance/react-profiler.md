# P4 — React Profiler (análise estática)

> Profiler DevTools não foi executado em CI; achados baseados em estrutura de componentes, tamanho de chunks e padrões de hooks.

## Páginas auditadas

| Página | Chunk gzip | Risco render |
|--------|------------|--------------|
| Dashboard | 19 KB | Médio — múltiplos cards + charts |
| Leads | 37 KB | **Alto** — kanban DnD, muitos cards |
| Clients | 22 KB | Alto — lista virtualizada + filtros |
| Projects | 155 KB | **Muito alto** — DnD + Gantt |
| Financeiro | 12–102 KB | Alto — Recharts |
| Chat | 55 KB | **Muito alto** — lista virtualizada + socket |
| Faturas | 7–20 KB | Médio |
| AppLayout | 68 KB | **Alto** — sempre montado |

## Componentes com render excessivo (suspeitos)

| Componente | Motivo |
|------------|--------|
| `AppLayout` Header | 8+ `useState`, reset em `pathname`, busca global |
| `AppLayout` Nav | 15× `useFeatureFlag`, permissions |
| `FloatingChatProvider` | `setPanels` frequente, pulse interval |
| `Leads.tsx` | Kanban drag → state em board inteiro |
| `Chat.tsx` | ~7k LOC, estado local massivo (não RQ) |
| `Dashboard.tsx` | Vários widgets independentes sem memo |

## Componentes com custo alto (CPU)

| Componente | Custo |
|------------|-------|
| `VirtualizedMessageItem` | 148 KB chunk, render por mensagem |
| `BarChart` / Recharts | Layout + animações |
| `Agenda` FullCalendar | 268 KB, recálculo de grid |
| `GlobalSearchPanelContent` | Agrupa resultados em cada query |
| `ProjectVersionControlPanel` | Diff/histórico |

## useEffect redundantes

| Local | Issue |
|-------|-------|
| `Header` L666-678 | Reset completo busca em **toda** navegação |
| `Chat.tsx` socket effect | Early return se connected — listeners stale |
| `ClientProfile.tsx` | Socket duplicado + mesmo pattern |
| `useChatNavUnreadCount` | `refresh` on mount + interval + events *(dedup instâncias S0)* |
| `Nav` prefetch | Era `setTimeout` fixo — migrado idle *(S0)* |

## Long tasks prováveis (>200ms)

1. **Parse + eval** bootstrap JS (~340 KB gzip) no cold load
2. **AppLayout** first render (Radix sidebar + header)
3. **Leads/Projects** mount com DnD sensors
4. **Chat** hydrate conversas + scroll virtual
5. **Recharts** primeiro paint em dashboard/financeiro

## Como validar (manual)

1. Chrome DevTools → Performance → gravar navegação `/login` → `/dashboard`
2. React Profiler → gravar troca `/dashboard` → `/leads` → `/chat`
3. Marcar tasks > 200ms na timeline
4. Comparar com baseline pós-fixes S0

## Metas

| Métrica | Ação |
|---------|------|
| Long tasks < 200ms | Reduzir AppLayout + defer third-party |
| Renders/navigation | Memo Nav/Header, split contexts |
