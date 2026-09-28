# Sprint 5.0-22A — Billing UI Functional Certification Report

**Modo:** CERTIFICATION (END-TO-END UI) — somente leitura  
**Branch sugerida:** `feature/billing-ui-functional-certification`  
**Pré-requisito:** Sprint 5.0-22 (Cutover)  
**Data:** 2026-07-04  
**Auditor:** investigação automatizada + revisão de código

---

## Parecer executivo

| Item | Resultado |
|------|-----------|
| **Experiência visual montada funciona?** | **SIM** — `SubscriptionDetail` renderiza sem regressão detectada nos testes |
| **BillingAggregate abastece a UI?** | **PARCIAL** — apenas `events` + projeções de `calendar` cruzam o adapter |
| **UI utiliza 100% do Aggregate?** | **NÃO** — 6 de 9 superfícies certificadas não são lidas diretamente pelo React |
| **Pronto para Sprint 5.0-23 (remoção legado)?** | **NÃO** — ver gaps P0/P1 abaixo |
| **Veredicto formal** | **FAIL CONDICIONAL** |

### Recomendação

Não iniciar **5.0-23 Billing Legacy Removal** até resolver os gaps **P0** e **P1**. A UI está operacional pós-cutover (723 testes billing green), mas a remoção do motor legado quebraria alertas, elegibilidade de geração, competência da próxima cobrança e visibilidade de ciclos ignorados.

Rollback imediato (`VITE_BILLING_USE_AGGREGATE=false`) permanece válido e testado.

---

## Evidências de teste

| Suíte | Resultado | Observação |
|-------|-----------|------------|
| `npm run test:billing` | **723/723 green** | Inclui cutover, certification, shadow, regressions |
| Certification Suite (Golden 40) | **168/168 green** | Snapshots atualizados no cutover 5.0-22 |
| Shadow Certification | **99.2% overall** | 8 divergências de alerts (lifecycle) — intencionais 4.2R |
| Testes E2E Billing | *não executados nesta sprint* | Recomendado antes de 5.0-23 |

---

## Respostas às perguntas obrigatórias

| # | Pergunta | Resposta |
|---|----------|----------|
| 1 | Componente React esperando campos inexistentes? | **Não** — store API inalterada; nenhum runtime error detectado |
| 2 | Campo do Aggregate que nunca chega à UI? | **Sim** — `alerts`, `capabilities`, `history`, `sidebar`, `nextInvoice`, `invoices`, `cycles` (ver matriz) |
| 3 | Campo esperado pela UI que o Aggregate não produz? | **Não estruturalmente** — gaps são de *wiring*, não de modelo |
| 4 | Adapter descartando informações? | **Sim** — `cycle_skipped` descartado; granularidade de ciclo colapsada; metadados (`jobId`, `periodEnd`) |
| 5 | Botão usando lógica antiga? | **Sim** — generate/retry via `cycleSupportsManualGenerate(detail)` + `invoiceCapabilities` legado |
| 6 | Calendário usando projeções antigas? | **Não** — projeções vêm de `aggregate.calendar` via adapter |
| 7 | Hook React dependente do legado? | **Sim** — sidebar/alerts usam `buildFinancialAlerts(detail)` paralelo ao store |
| 8 | Funcionalidade visual quebrada pós-cutover? | **1 gap funcional confirmado** — histórico vazio em `cycle-skipped` |
| 9 | Inconsistência Aggregate vs tela? | **Sim em alerts** (UI = legado); **sim em history** (`cycle_skipped`) |
| 10 | UI utiliza 100% do Aggregate? | **Não** — cutover fino (events-only) |

---

## Auditoria por módulo (mandatoryAudit)

### 1. Generate Next Invoice

| Pergunta | Resposta |
|----------|----------|
| Botão aparece quando deveria? | **Sim** — `NextInvoiceCard`, `HistoryRowChargeAction`, `InvoiceDirectActions`, FAB |
| Desaparece quando não deveria? | **Sim** — condições `active`, `!isProjected`, `cycleId` / `canGenerateNow` |
| Depende de `canGenerate`? | **Sim** — `row.canGenerateNow` de `store.filterHistory` → `getHistoryRows` |
| Depende de `resolveInvoiceCapabilities` legado? | **Sim** — `InvoiceDirectActions` → `subscriptionActionExperience` → `invoiceCapabilities` |
| Depende de `cycleSupportsManualGenerate` legado? | **Sim** — em `getHistoryRows` e `UpcomingPaymentsList` (não montado) |
| Aggregate fornece dados necessários? | **Parcial** — `aggregate.capabilities.canGenerate` existe mas **não é consumido** |

**Risco:** elegibilidade de geração ainda lê `detail.cycles_raw`, não `aggregate.capabilities`.

### 2. Calendar

| Pergunta | Resposta |
|----------|----------|
| Próxima cobrança aparece? | **Sim** — via eventos reais + projeções no store |
| Eventos projetados aparecem? | **Sim** — `aggregate.calendar.filter(isProjected)` → adapter |
| Eventos pagos aparecem? | **Sim** — `payment` mapeado |
| Eventos cancelados aparecem? | **Sim** — `cycle_cancelled` → `invoice_cancelled` |
| Diferença Aggregate.calendar vs React? | **Parcial** — reals fluem via `events`; metadados de calendário não chegam à UI |

### 3. History

| Pergunta | Resposta |
|----------|----------|
| Todos os eventos aparecem? | **Não** — `cycle_skipped` ausente (adapter descarta) |
| Deduplicação incorreta? | **Possível edge** — store dedupe por `cycleKey`; aggregate por `cycleId` |
| Ordenação correta? | **Sim** — `dueYmd` desc |
| Algum evento desapareceu? | **Sim** — cenário `cycle-skipped`: 0 linhas (snapshot certificado) |

### 4. Sidebar

| Pergunta | Resposta |
|----------|----------|
| Saldo aberto correto? | **Sim** — derivado de `realEvents` adaptados; shadow 100% |
| Último pagamento correto? | **Sim** |
| Próxima cobrança correta? | **Sim** — via `getSidebarSummary` + `resolveNextChargePresentationFromStore` |
| KPIs corretos? | **Sim** — `RecurringRevenueCard` via `getKpiCards()` |

**Nota:** valores numéricos batem com aggregate (shadow 100%); implementação recomputa, não lê `aggregate.sidebar`.

### 5. Alerts

| Pergunta | Resposta |
|----------|----------|
| Todos os alerts aparecem? | **Alerts legados sim** — UI não usa `aggregate.alerts` |
| Alerta faltando? | **Depende da fonte** — aggregate omite lifecycle (intencional 4.2R); legado exibe `client_overdue` em paused |
| Alerta legado ainda utilizado? | **Sim** — `buildFinancialAlerts(detail)` em `FinancialSummarySidebar`, `FinancialSmartScroll` |

**Gap crítico para 5.0-23:** remover legado sem migrar alerts quebra sidebar.

### 6. Capabilities

| Pergunta | Resposta |
|----------|----------|
| `canGenerate` consumido? | **Via legado** — `cycleSupportsManualGenerate(detail)`, não `aggregate.capabilities` |
| `canRetry` consumido? | **Via legado** — `invoiceCapabilities` |
| `canRefund` / `canPause` / `canResume` | **Via legado** — settings/actions panel, não aggregate |
| Componente com lógica antiga? | **Sim** — todos os botões de invoice action |

---

## Gaps funcionais classificados

| ID | Severidade | Superfície | Descrição | Bloqueia 5.0-23? |
|----|------------|------------|-----------|------------------|
| GAP-01 | **P0** | History / Adapter | `cycle_skipped` descartado no adapter — ciclo ignorado invisível | **Sim** |
| GAP-02 | **P1** | Alerts | UI usa `buildFinancialAlerts(detail.timeline)`; `aggregate.alerts` nunca wired | **Sim** |
| GAP-03 | **P1** | Capabilities / Generate | `aggregate.capabilities` não consumido; elegibilidade via `cycles_raw` | **Sim** |
| GAP-04 | **P1** | Next Invoice | Competência via `detail.timeline.find(cycle_id)` no resolver legado | **Sim** |
| GAP-05 | **P2** | Header | `buildFinancialHeaderData(detail)` lê timeline diretamente | Parcial |
| GAP-06 | **P2** | Technical | `buildTechnicalDiagnostics(detail)` — jobs/cycles_raw | Parcial |
| GAP-07 | **P3** | Código morto | `SubscriptionRenewalActionsCard` órfão; 7 componentes exportados não montados | Não |
| GAP-08 | **P3** | Experience layer | `SubscriptionFinancialHistory/Calendar` legados no repo | Não (desmontados) |

---

## Componentes montados em produção (`SubscriptionDetail`)

```
FinancialEventStoreProvider
├── FinancialHeader          (detail — legacy header builder)
├── FinancialSmartScroll     (store.events + buildFinancialAlerts)
├── RecurringRevenueCard     (store.getKpiCards)
├── NextInvoiceCard          (store + resolveNextChargePresentationFromStore)
├── FinancialCalendar        (store calendar methods)
├── FinancialSummarySidebar  (store + buildFinancialAlerts)
├── FinancialHistory         (store.filterHistory)
├── FinancialInsights        (store.getInsights)
├── FinancialTechnicalAccordion (store.events + buildTechnicalDiagnostics)
├── SubscriptionActionsPanel (generate/cancel — page handlers)
└── SubscriptionSettingsActions (cancel/pause/resume)
```

---

## Definition of Done — checklist

| Critério | Status |
|----------|--------|
| Toda funcionalidade visual auditada | ✅ |
| Todos os componentes React mapeados | ✅ |
| Todos os adapters auditados | ✅ |
| Todos os gaps documentados | ✅ |
| Dependências residuais do legado identificadas | ✅ |
| Parecer formal emitido | ✅ |
| Recomendação para 5.0-23 | ✅ **NÃO PROSSEGUIR** sem sprint de remediação |

---

## Documentos relacionados

- [UI_COMPONENT_DEPENDENCY_MATRIX.md](./UI_COMPONENT_DEPENDENCY_MATRIX.md)
- [AGGREGATE_UI_MAPPING.md](./AGGREGATE_UI_MAPPING.md)
- [FUNCTIONAL_GAP_MATRIX.md](./FUNCTIONAL_GAP_MATRIX.md)
- [LEGACY_UI_DEPENDENCIES.md](./LEGACY_UI_DEPENDENCIES.md)
- [SPRINT_5.0-22_BILLING_CUTOVER.md](./SPRINT_5.0-22_BILLING_CUTOVER.md)
