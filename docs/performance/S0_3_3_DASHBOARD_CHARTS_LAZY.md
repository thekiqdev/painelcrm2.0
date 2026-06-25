# S0.3.3 — Dashboard Charts Lazy — Relatório de Implementação

**Data:** 2026-06-23  
**Base:** `PERFORMANCE_FORENSICS_V2.md`, `PERFORMANCE_REMEDIATION_PLAN_V2.md`  
**Escopo:** Apenas `/dashboard` — sem alteração de APIs, RQ, realtime ou regras de negócio

---

## Objetivo

Remover **Recharts** do caminho crítico de parse/execução do chunk `Dashboard`, carregando o gráfico de receita apenas após o shell da página (KPIs + card) estar visível.

---

## Implementação

### Componentes criados

| Arquivo | Função |
|---------|--------|
| `src/components/dashboard/DashboardRevenueChart.tsx` | BarChart Recharts (chunk lazy) |
| `src/components/dashboard/DashboardRevenueChartSkeleton.tsx` | Skeleton local no `Suspense` fallback |
| `src/components/dashboard/dashboardChartTypes.ts` | Tipo `DashboardRevenueChartRow` |
| `src/components/dashboard/dashboardChartFormat.ts` | `formatDashboardCurrency` (tooltip) |

### Alteração principal

`src/pages/Dashboard.tsx`:

- Removido import síncrono de `recharts`
- Adicionado `lazy(() => import('@/components/dashboard/DashboardRevenueChart'))`
- Gráfico envolvido em `<Suspense fallback={<DashboardRevenueChartSkeleton />}>`
- Card header (título, período, switches) permanece síncrono — KPIs acima do gráfico inalterados

### Gráficos identificados no Dashboard

| Gráfico | Biblioteca | Tratamento |
|---------|------------|------------|
| Receita realizada vs prevista (BarChart empilhado) | `recharts` | ✅ Lazy `DashboardRevenueChart` |

**Nota:** Único uso de Recharts em `Dashboard.tsx`. Demais blocos (contas a pagar, KPIs, listas) não usam charts.

---

## Chunks — Antes × Depois

Build: `npm run build:crm` (pós-implementação vs forensics V2)

| Chunk | Antes (gzip / min) | Depois (gzip / min) | Δ |
|-------|-------------------|---------------------|---|
| `Dashboard-*.js` | 19,15 KB / 131,34 KB | **19,00 KB** / **130,31 KB** | ~−0,15 KB gzip |
| `BarChart-*.js` (recharts) | 101,98 KB / 370,46 KB | **101,98 KB** / 370,46 KB | chunk mantido (shared) |
| `DashboardRevenueChart-*.js` | — (embutido no Dashboard) | **1,06 KB** / 3,58 KB | **novo chunk lazy** |

### Caminho crítico na 1ª visita ao Dashboard

| Fase | Antes | Depois |
|------|-------|--------|
| Parse inicial da rota | `Dashboard` + **`BarChart`** (~121 KB gzip) | **`Dashboard` only** (~19 KB gzip) |
| Após paint KPIs | Gráfico junto | Skeleton → lazy fetch |
| Segundo chunk | — | `DashboardRevenueChart` + `BarChart` (~103 KB gzip) |

**Impacto estimado:** **~102 KB gzip** removidos do critical path de parse/network inicial da rota (Recharts adiado até após primeiro paint dos KPIs).

---

## Comportamento UX

1. Utilizador abre `/dashboard`
2. Query `dashboard-overview` + KPIs renderizam (inalterado)
3. Card «Receita realizada vs prevista» mostra header + switches
4. Área do gráfico: skeleton animado (~1 frame de Suspense)
5. Chunk lazy carrega → gráfico idêntico ao anterior (mesmas cores, tooltip, séries)

Sem alteração visual no gráfico final. Mensagem «Ative ao menos uma série…» preservada quando ambos switches off.

---

## Validação executada

| Verificação | Resultado |
|-------------|-----------|
| `npm run build:crm` | ✅ Exit 0 |
| `recharts` ausente em `Dashboard.tsx` | ✅ Grep zero matches |
| Linter `Dashboard.tsx`, `DashboardRevenueChart.tsx` | ✅ Sem erros |
| APIs / React Query | ✅ Inalterados (`useQuery` overview L75-78) |
| Realtime | ✅ Não tocado |

### Validação manual recomendada

- [ ] `/dashboard` com billing visível — gráfico empilhado OK
- [ ] Toggle «Receita realizada» / «Receita prevista»
- [ ] Troca de período (Este mês / Mês passado / Ano atual)
- [ ] Tooltip hover nas barras
- [ ] Dark mode cores emerald

---

## Riscos remanescentes

| Risco | Mitigação |
|-------|-----------|
| Flash skeleton breve | Dimensões fixas `h-80` — mínimo layout shift |
| `showBillingDash` false | Gráfico não monta — chunk não carrega ✅ |
| Outras rotas ainda puxam `BarChart` | SubscriptionsCharts, finance reports — fora escopo S0.3.3 |

---

## Próximo passo (S0.3)

- Projects view-based split (P0 — 154 KB gzip)
- Settings section split (P0 — 92 KB gzip)

---

*Implementação concluída — S0.3.3.*
