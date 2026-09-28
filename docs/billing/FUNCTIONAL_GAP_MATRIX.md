# Functional Gap Matrix — Sprint 5.0-22A

Classificação de todos os gaps funcionais entre Aggregate, Adapter, Store e UI React.

---

## Matriz de regressão funcional (Golden Dataset × superfície)

| Cenário | History | Calendar | Sidebar | NextInvoice | Alerts UI | Generate | Veredicto |
|---------|---------|----------|---------|-------------|-----------|----------|-----------|
| 36 cenários estáveis | ✅ | ✅ | ✅ | ✅ | ✅ legado | ✅ | PASS |
| `charge-early-generated` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS (snapshot cutover) |
| `cancelled-official` | ✅ cancelado | ✅ | ✅ | ✅ | ✅ | ✅ | PASS (status corrigido) |
| `cancelled-legacy` | ✅ cancelado | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| **`cycle-skipped`** | **❌ 0 rows** | ✅ projeções | ✅ | ✅ | ✅ | N/A | **FAIL** |
| `subscription-paused` | ✅ | ✅ | ✅ | ✅ | ⚠️ legado only | ✅ | PASS UI / diverge aggregate |
| `subscription-cancelled` | ✅ | ✅ | ✅ | ✅ | ⚠️ lifecycle | ✅ | PASS UI / diverge aggregate |

**Testes automatizados:** 723/723 green — gaps são semânticos/arquiteturais, não crashes.

---

## Gaps detalhados

### GAP-01 — `cycle_skipped` invisível no histórico

| Atributo | Valor |
|----------|-------|
| **Severidade** | P0 — funcional |
| **Local** | `billingViewAdapter.ts` → `mapAggregateEventType('cycle_skipped')` → null |
| **Evidência** | Snapshot `cycle-skipped.json`: `history.rowCount: 0` |
| **Impacto UX** | Usuário não vê ciclo ignorado no histórico financeiro |
| **Aggregate** | Produz evento + linha em `aggregate.history` |
| **UI** | Linha ausente |
| **Correção sugerida (5.0-22B)** | Mapear `cycle_skipped` → tipo legado ou consumir `aggregate.history` diretamente |
| **Bloqueia 5.0-23** | **Sim** |

### GAP-02 — Alerts não wired ao Aggregate

| Atributo | Valor |
|----------|-------|
| **Severidade** | P1 — bloqueia remoção legado |
| **Local** | `FinancialSummarySidebar`, `FinancialSmartScroll` |
| **Código** | `buildFinancialAlerts(detail)` → lê `detail.timeline` |
| **Impacto UX** | Alerts funcionam (via legado); divergem do aggregate em 8 cenários lifecycle |
| **Shadow** | alertsParity 90% — 8 divergências intencionais 4.2R |
| **Correção sugerida** | Substituir por `aggregate.alerts` + humanizer |
| **Bloqueia 5.0-23** | **Sim** |

### GAP-03 — Capabilities não wired ao Aggregate

| Atributo | Valor |
|----------|-------|
| **Severidade** | P1 |
| **Local** | `getHistoryRows`, `UpcomingPaymentsList`, `invoiceCapabilities` |
| **Código** | `cycleSupportsManualGenerate(detail, cycleId)` |
| **Impacto UX** | Generate buttons funcionam hoje; dependem de `cycles_raw` |
| **Shadow** | capabilitiesParity 100% — valores batem, wiring diferente |
| **Bloqueia 5.0-23** | **Sim** |

### GAP-04 — Competência Next Invoice via timeline

| Atributo | Valor |
|----------|-------|
| **Severidade** | P1 |
| **Local** | `subscriptionFinancialEvents.ts` → `resolveNextChargePresentationFromStore` |
| **Código** | `detail.timeline.find(r => r.cycle_id === firstCycle.id)` |
| **Impacto UX** | Label de competência pode divergir se timeline desatualizada vs cycles |
| **Shadow** | nextInvoiceParity 100% nos 40 cenários |
| **Bloqueia 5.0-23** | **Sim** (timeline será removida) |

### GAP-05 — Header financeiro via timeline

| Atributo | Valor |
|----------|-------|
| **Severidade** | P2 |
| **Local** | `FinancialHeader` → `buildFinancialHeaderData(detail)` |
| **Impacto UX** | KPIs de header (último pagamento, próximo recebimento) funcionam |
| **Bloqueia 5.0-23** | Parcial — header quebraria sem substituto |

### GAP-06 — Technical accordion via detail raw

| Atributo | Valor |
|----------|-------|
| **Severidade** | P2 |
| **Local** | `FinancialTechnicalAccordion` |
| **Impacto UX** | Diagnóstico técnico funcional |
| **Bloqueia 5.0-23** | Parcial |

### GAP-07 — Código morto / não montado

| Atributo | Valor |
|----------|-------|
| **Severidade** | P3 |
| **Itens** | `SubscriptionRenewalActionsCard` (órfão), 7 componentes exportados não montados |
| **Impacto UX** | Nenhum em produção |
| **Bloqueia 5.0-23** | Não — mas aumenta risco de reintrodução acidental |

### GAP-08 — Dedupe history: cycleKey vs cycleId

| Atributo | Valor |
|----------|-------|
| **Severidade** | P2 — edge case |
| **Local** | store `getHistoryRows` dedupe por `cycleKey`; aggregate por `cycleId` |
| **Impacto UX** | Potencial linha duplicada se mesmo cycleId com competências diferentes |
| **Shadow** | historyParity 100% nos 40 cenários |
| **Bloqueia 5.0-23** | Monitorar |

---

## Matriz Adapter descarta informação

| Informação Aggregate | Descartada no adapter? | Impacto UI |
|---------------------|------------------------|------------|
| `cycle_skipped` event | ✅ total | Histórico vazio |
| `cycle_pending/queued/processing` granularity | ✅ colapsado | Status menos preciso |
| `metadata.jobId` | ✅ | Technical accordion usa detail.jobs |
| `metadata.periodEnd` | ✅ | Competência parcial |
| Projected `cycleId` | ✅ forçado null | Generate no calendário projetado = false |
| `aggregate.status` on event | ✅ | Recomputado por helpers |
| `aggregate.history` rows | ✅ não adaptadas | Store recomputa |
| `aggregate.alerts` | ✅ não adaptadas | Legado paralelo |
| `aggregate.capabilities` | ✅ não adaptadas | Legado paralelo |

---

## Functional Regression Matrix — botões de ação

| Botão | Aparece quando deveria? | Desaparece quando deveria? | Fonte | Gap? |
|-------|-------------------------|----------------------------|-------|------|
| Gerar (NextInvoiceCard) | ✅ active + cycle + no invoice | ✅ projected/paused | store + detail.status | wiring legado |
| Gerar (History row) | ✅ canGenerateNow | ✅ projected | store → cycles_raw | GAP-03 |
| Gerar (Calendar popover) | ✅ supportsGenerate | ✅ projected | invoiceCapabilities | wiring legado |
| Gerar (Sidebar alert) | ✅ billing_missing | ✅ | buildFinancialAlerts | GAP-02 |
| Gerar (FAB) | ✅ showRenewalGenerate | ✅ | page logic | OK |
| Reprocessar | ✅ failed invoice | ✅ paid | invoiceCapabilities | OK |
| Cancelar assinatura | ✅ permissão | ✅ | API direta | OK |

---

## Sprint de remediação sugerida (pré-5.0-23)

| Ordem | Sprint | Escopo |
|-------|--------|--------|
| 1 | **5.0-22B** | GAP-01 adapter `cycle_skipped`; wire alerts → aggregate |
| 2 | **5.0-22C** | Wire capabilities + next invoice competence |
| 3 | **5.0-23** | Remoção definitiva do legado |
