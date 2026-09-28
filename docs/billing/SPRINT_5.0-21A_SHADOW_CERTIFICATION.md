# Billing Shadow Certification Report — Sprint 5.0-21A

**Mode:** CERTIFICATION (read-only sobre resultados)  
**Date:** 2026-07-03  
**Branch:** `feature/billing-shadow-certification`  
**Runtime:** Sprint 5.0-21 Shadow Mode  
**Dataset:** Golden Dataset (40 cenários)  
**Artefato JSON:** `tests/billing/shadow/reports/shadow-certification-report.json`

**Rules obeyed:** nenhuma correção de divergência; nenhum motor alterado; nenhum snapshot visual mascarado.

---

## 1. Objetivo

Certificar a **equivalência funcional** entre `BillingAggregate` e `FinancialEventStore`, registrar todas as divergências com evidência objetiva e emitir recomendação formal sobre aptidão para Cutover / Sprint 5.0-21B.

---

## 2. Método

Para cada cenário Golden:

1. Instanciar `FinancialEventStore` **diretamente** (sem side-effect do Shadow).
2. Executar `buildBillingAggregateFromDetail(detail, today)`.
3. Comparar superfícies obrigatórias com checks objetivos (contagem, IDs, ordem, flags, presença).
4. Classificar cada falha: `structural` | `semantic` | `ordering` | `data` | `behavior`.

Implementação: `src/lib/billingShadow/shadowCertification.ts`  
Execução automatizada: `tests/billing/shadow/shadowCertification.test.ts`

---

## 3. Parity Score (métricas oficiais)

| Métrica | Valor |
|---------|-------|
| `legacyExecutionMs` (soma 40 cenários) | **23.69 ms** |
| `aggregateExecutionMs` (soma 40 cenários) | **4.02 ms** |
| `historyParityPercent` | **91.7%** |
| `calendarParityPercent` | **45.6%** |
| `sidebarParityPercent` | **63.4%** |
| `nextInvoiceParityPercent` | **73.3%** |
| `alertsParityPercent` | **8.8%** |
| `capabilitiesParityPercent` | **95.8%** |
| `eventsParityPercent` | **90.0%** |
| **`overallParityPercent`** | **73.0%** |

**Cutover recommendation (automática):** `READY_WITH_CORRECTIONS` (≥70% e &lt;99%).

---

## 4. Performance Comparison

| Motor | Tempo total (40 cenários) | Observação |
|-------|---------------------------|------------|
| Legacy (`FinancialEventStore`) | 23.69 ms | Inclui projeções UX e builders legados |
| Aggregate (`buildBillingAggregateFromDetail`) | 4.02 ms | Pipeline puro, sem projeções |

O Aggregate é **mais rápido** neste dataset (~5.9×). Performance **não** é bloqueio para Shadow; divergências semânticas/estruturais são.

---

## 5. Tabelas de paridade por superfície

### History Parity — **91.7%**

| Check | Resultado dominante |
|-------|---------------------|
| `count` | Quase sempre igual (1 divergência) |
| `cycleIds` (conjunto) | Quase sempre igual (1 divergência) |
| `order` | **8 divergências** — legado ordena por `dueYmd` desc; Aggregate por `occurredAt` asc |

**Classificação principal:** `ordering` (ordem), `semantic`/`data` (casos edge invoice_only / sem ciclo).

### Calendar Parity — **45.6%**

| Check | Resultado dominante |
|-------|---------------------|
| `realCount` | 4 divergências (edge cases) |
| `totalCount` | **40/40 divergem** — legado inclui projeções |
| `realCycleIds` | 4 divergências |
| `projectedCount` | **39/40 divergem** — Aggregate = 0 projeções |

**Classificação principal:** `structural` — Aggregate não implementa projeção UX (conforme 5.0-14/16).

### Sidebar Parity — **63.4%**

| Check | Resultado dominante |
|-------|---------------------|
| `shape` | **40/40 divergem** — modelos incompatíveis |
| `subscriptionStatus` | Passa (espelha subscription) |
| `eventCount` | 4 divergências (quando realEvents ≠ events do Aggregate) |

**Classificação principal:** `structural` (shape), `semantic` (eventCount).

### NextInvoice Parity — **73.3%**

| Check | Resultado dominante |
|-------|---------------------|
| `cycleId` | **8 divergências** — critérios diferentes |
| `presence` | **9 divergências** — legado pode ser projeção sem `cycleId` |
| `isProjected` | **15 divergências** — Aggregate nunca é projetado |

**Classificação principal:** `semantic` + `structural`.

**Evidência de critério:**

| Motor | Critério |
|-------|----------|
| Legacy | `resolveFirstEligibleCycle` / projeção futura |
| Aggregate | Evento com **menor** `occurredAt` (mais antigo) |

### Alerts Parity — **8.8%**

| Check | Resultado dominante |
|-------|---------------------|
| `kinds` | **40/40 divergem** — taxonomias distintas |
| `count` | **33 divergências** |

| Legado (`buildFinancialAlerts`) | Aggregate (`buildAlertsFromAggregate`) |
|--------------------------------|----------------------------------------|
| `billing_missing`, `client_overdue`, `gateway_failed` | `no_events`, `subscription_status`, `invoice_failed`, `cycle_cancelled`, `next_invoice` |

**Classificação principal:** `structural`.

### Capabilities Parity — **95.8%**

| Check | Resultado dominante |
|-------|---------------------|
| `canGenerate` | **1 divergência** |
| `generateCycleIds` | **2 divergências** |
| `cycleSupportsManualGenerate_first` | **2 divergências** |

**Classificação principal:** `behavior` — alta paridade, gaps pontuais.

### Events Parity — **90.0%**

| Check | Resultado dominante |
|-------|---------------------|
| `count` (realEvents vs events) | **4 divergências** |
| `cycleIds` | **4 divergências** |

Casos típicos: `invoice_only` / lifecycle — legado pode emitir eventos sem ciclo; Aggregate só emite a partir de `cycles`.

### Subscription / Cycles

| Superfície | Paridade observada |
|------------|-------------------|
| subscription | **100%** nos checks (id + status) |
| cycles | **100%** (count + ids vs `cycles_raw`) |

---

## 6. Shadow Divergence Matrix (resumo)

| Superfície | # Divergências | Classes dominantes |
|------------|----------------|--------------------|
| calendar | 87 | structural |
| alerts | 73 | structural |
| sidebar | 44 | structural |
| nextInvoice | 32 | semantic, structural |
| history | 10 | ordering, semantic |
| events | 8 | semantic |
| capabilities | 5 | behavior |
| **Total** | **259** | — |

### Root Cause Classification

| Classe | Quantidade | Significado |
|--------|------------|-------------|
| `structural` | **178** | Modelos/camadas diferentes por design (projeções, taxonomia, shape) |
| `semantic` | **67** | Mesma intenção, critério diferente (NextInvoice, contagens edge) |
| `ordering` | **8** | Mesmos itens, ordem distinta (History) |
| `behavior` | **5** | Flags de ação (Generate) divergem pontualmente |
| `data` | **1** | Identidade/dados pontuais |

---

## 7. Lista completa de divergências (por campo)

| Campo | Ocorrências | Classe | Evidência |
|-------|-------------|--------|-----------|
| `calendar.totalCount` | 40 | structural | Legado inclui projeções |
| `calendar.projectedCount` | 39 | structural | Aggregate = 0 projeções |
| `sidebar.shape` | 40 | structural | Campos UX legado ≠ resumo Aggregate |
| `alerts.kinds` | 40 | structural | Taxonomias incompatíveis |
| `alerts.count` | 33 | semantic | Contagens diferentes |
| `nextInvoice.isProjected` | 15 | structural | Aggregate sem projeção |
| `nextInvoice.presence` | 9 | semantic | Legado pode ser só projeção |
| `nextInvoice.cycleId` | 8 | semantic | First-eligible vs earliest event |
| `history.order` | 8 | ordering | due desc vs occurredAt asc |
| `events.count` / `cycleIds` | 4+4 | semantic | invoice_only / sem ciclo |
| `calendar.realCount` / `realCycleIds` | 4+4 | semantic | Edge cases |
| `sidebar.eventCount` | 4 | semantic | realEvents ≠ events |
| `history.count` / `cycleIds` | 1+1 | data/semantic | Edge |
| `capabilities.*` | 5 | behavior | Generate pontual |

Matriz completa (259 linhas): `tests/billing/shadow/reports/shadow-certification-report.json` → `divergenceMatrix`.

---

## 8. Conclusão sobre aptidão para Cutover

### Status: **NOT READY FOR CUTOVER**

### Recomendação formal: **READY_WITH_CORRECTIONS → Sprint 5.0-21B**

O Aggregate está **estruturalmente isolado e operacional** (Shadow Runtime 5.0-21), mas a **paridade funcional global é 73%**, insuficiente para substituir o `FinancialEventStore` na UI.

### Bloqueadores para Cutover (priorizados)

1. **Projeções de calendário** (estrutural) — maior volume de divergências.  
2. **Taxonomia de Alerts** (estrutural) — modelos incompatíveis.  
3. **Shape da Sidebar** (estrutural) — não é o mesmo contrato UX.  
4. **Critério de NextInvoice** (semântico) — earliest event ≠ first eligible / projeção.  
5. **Ordenação do History** (ordering) — fácil de alinhar em 5.0-21B.  
6. **Generate pontual** (behavior) — poucos casos, alta prioridade de UX.

### O que já está forte

- Subscription / Cycles: **100%** nos checks de identidade.  
- Capabilities (Generate): **95.8%**.  
- History (conteúdo): **91.7%** (ordem é o principal gap).  
- Events reais: **90%**.  
- Performance do Aggregate: superior no dataset.

### Continuidade

| Próxima sprint | Objetivo |
|----------------|----------|
| **5.0-21B — Billing Shadow Corrections** | Corrigir **exclusivamente** as divergências deste laudo, sem novas features nem mudança de arquitetura. Priorizar: History order, NextInvoice criterion, Generate edge cases; depois decidir se projeções/alerts/sidebar entram no Aggregate ou em adaptadores de view. |

**Cutover (UI no Aggregate) permanece proibido** até nova certificação com `overallParityPercent ≥ 99%` nas superfícies consumidas pela UI.

---

## 9. Definition of Done — 5.0-21A

| Item | Status |
|------|--------|
| Todas as superfícies comparadas | ✅ |
| Todas as divergências documentadas | ✅ (259) |
| Nenhuma divergência sem evidência | ✅ |
| Paridade percentual calculada | ✅ |
| Performance comparada | ✅ |
| Relatório final emitido | ✅ |
| Recomendação formal 5.0-21B | ✅ **Prosseguir com correções** |

---

*Sprint 5.0-21A — nenhum motor de negócio foi alterado. Este documento é o laudo oficial de equivalência Shadow Mode.*
