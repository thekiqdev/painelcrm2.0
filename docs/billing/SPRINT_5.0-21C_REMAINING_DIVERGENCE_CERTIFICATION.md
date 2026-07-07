# Sprint 5.0-21C — Billing Remaining Divergence Certification

**Modo:** CERTIFICATION (read-only)  
**Branch de referência:** `feature/billing-final-divergence-certification`  
**Baseline:** Sprint 5.0-21B (`overallParityPercent` 95,7%, **43 divergências**)  
**Fonte:** `tests/billing/shadow/reports/shadow-certification-report.json` (40 cenários Golden, `todayYmd = 2026-06-30`)  
**Status:** Concluída

---

## Sumário executivo

As **43 divergências remanescentes** concentram-se em **4 causas raiz**. Nenhuma invalida a arquitetura congelada na Sprint **4.2R**. Todas são resolvíveis **dentro do pipeline atual do `BillingAggregate`** (stages imutáveis, ingress isolado, zero timeline como decisor).

| Veredito | Conclusão |
|--------|-----------|
| Arquitetura 4.2R | **Válida** — gaps são de conformidade de implementação/ingress, não de desenho |
| Bloqueador estrutural para Cutover | **Não identificado** |
| Pré-requisito crítico | **`invoices[]` no payload** (já previsto em 4.2R, hoje ausente na API) |
| Recomendação Cutover | **`READY_WITH_CORRECTIONS`** → fechar gaps em sprint pré-5.0-22, depois **`READY`** |

---

## Métricas baseline (5.0-21B)

| Superfície | Paridade | Divergências |
|------------|----------|--------------|
| history | 100% | 0 |
| nextInvoice | 100% | 0 |
| capabilities | 100% | 0 |
| events | 92,5% | 6 |
| calendar | 94,4% | 9 |
| sidebar | 93,8% | 10 |
| alerts | 77,5% | 18 |
| **overall** | **95,7%** | **43** |

---

## Respostas às perguntas obrigatórias

| # | Pergunta | Resposta |
|---|----------|----------|
| 1 | Cada divergência pode ser corrigida sem alterar a arquitetura do Aggregate? | **Sim — 43/43.** Correções ficam em `financialEventSnapshot`, `alertsSnapshot`, `sidebarSnapshot` e enriquecimento de ingress. Pipeline e isolamento permanecem. |
| 2 | Alguma exige mudar 1 ciclo → 1 evento para 1 ciclo → N eventos? | **Sim — 20 divergências (RC-2).** A constituição 4.2R já exige **≥1 evento real por ciclo** (§6.2); N>1 é permitido. O modelo 1:1 atual é simplificação de implementação, não contrato arquitetural. |
| 3 | Alguma exige utilizar `detail.timeline`? | **Não — 0/43.** Legacy usa timeline; Aggregate **não deve** adotá-la (§6.1, §12 C14). Resolução via `invoices[]`, regras de alerta estendidas e `lifecycle_events[]`. |
| 4 | Alguma exige importar lógica do motor legado? | **Não — 0/43.** Reimplementação algorítmica isolada (como em 5.0-21B). |
| 5 | Alguma exige enriquecer o `BillingContext`? | **Sim — 31/43** dependem de metadados de fatura (`invoice_status`, `created_at`, `gateway_status`) hoje só presentes na timeline. |
| 6 | Alguma exige novos dados da API? | **Sim — `invoices[]` obrigatório 4.2R** (ausente hoje). Opcional: `lifecycle_events[]` para paridade exata em 8 cenários lifecycle. |
| 7 | Alguma depende de invoices ausentes no Aggregate? | **Sim — 31/43** (RC-1, RC-2, RC-3, invoice-only). |
| 8 | Alguma depende de `lifecycle_events`? | **Condicional — 8/43** (RC-4a). Paridade exata com legacy exige ingress lifecycle **ou** decisão funcional de não replicar falso positivo. |
| 9 | Existe divergência impossível mantendo Aggregate isolado? | **Não.** |
| 10 | Existe bloqueador arquitetural restante para Cutover? | **Não.** Existem **dependências de dados e implementação** a fechar antes do cutover. |

---

## Remaining Divergence Matrix (43/43)

Legenda de classificação: **IMP** implementação · **DAD** dados/ingress · **ARQ** arquitetura · **CTR** contrato de certificação · **DEC** decisão funcional

| ID | Cenário | Superfície | Campo | Legacy → Aggregate | Classe cert. | Class. técnica | Causa raiz | Fixável sem mudar arquitetura? |
|----|---------|------------|-------|-------------------|--------------|----------------|------------|-------------------------------|
| 1 | first-charge-paid | sidebar | openAmount | R$ 0,00 → R$ 110,00 | semantic | DAD+IMP | RC-1 paid perdido em cycles_raw | Sim |
| 2 | first-charge-paid | sidebar | lastPaymentDate | 14 Jun → — | semantic | DAD+IMP | RC-1 sem evento payment | Sim |
| 3 | first-charge-paid | alerts | kinds | [] → [client_overdue] | structural | DAD+IMP | RC-1 falso positivo overdue | Sim |
| 4 | first-charge-paid | alerts | count | 0 → 1 | semantic | DAD+IMP | RC-1 (par de #3) | Sim |
| 5 | subscription-paused | alerts | kinds | [client_overdue] → [] | structural | DEC+CTR | RC-4a lifecycle na timeline | Sim* |
| 6 | subscription-paused | alerts | count | 1 → 0 | semantic | DEC+CTR | RC-4a (par de #5) | Sim* |
| 7 | subscription-resumed | alerts | kinds | [client_overdue] → [] | structural | DEC+CTR | RC-4a lifecycle na timeline | Sim* |
| 8 | subscription-resumed | alerts | count | 1 → 0 | semantic | DEC+CTR | RC-4a (par de #7) | Sim* |
| 9 | subscription-reactivated | alerts | kinds | [client_overdue] → [] | structural | DEC+CTR | RC-4a lifecycle na timeline | Sim* |
| 10 | subscription-reactivated | alerts | count | 1 → 0 | semantic | DEC+CTR | RC-4a (par de #9) | Sim* |
| 11 | charge-paid | sidebar | openAmount | R$ 0,00 → R$ 110,00 | semantic | DAD+IMP | RC-1 paid perdido | Sim |
| 12 | charge-paid | sidebar | lastPaymentDate | 14 Jun → — | semantic | DAD+IMP | RC-1 sem payment | Sim |
| 13 | charge-paid | alerts | kinds | [] → [client_overdue] | structural | DAD+IMP | RC-1 falso positivo | Sim |
| 14 | charge-paid | alerts | count | 0 → 1 | semantic | DAD+IMP | RC-1 (par de #13) | Sim |
| 15 | charge-manual | events | count | 2 → 1 | semantic | IMP | RC-2 multi-evento | Sim |
| 16 | charge-manual | events | cycleIds | [c,c] → [c] | semantic | IMP | RC-2 multi-evento | Sim |
| 17 | charge-manual | calendar | realCount | 2 → 1 | semantic | IMP | RC-2 (derivado) | Sim |
| 18 | charge-manual | calendar | totalCount | 14 → 13 | semantic | IMP | RC-2 (derivado) | Sim |
| 19 | charge-manual | calendar | realCycleIds | [c,c] → [c] | semantic | IMP | RC-2 (derivado) | Sim |
| 20 | charge-manual | sidebar | openAmount | R$ 220 → R$ 110 | semantic | IMP | RC-2 soma 1 evento | Sim |
| 21 | charge-manual | sidebar | eventCount | 2 → 1 | semantic | IMP | RC-2 (derivado) | Sim |
| 22 | charge-early-generated | events | count | 2 → 1 | semantic | IMP | RC-2 invoice_generated+due | Sim |
| 23 | charge-early-generated | events | cycleIds | [c,c] → [c] | semantic | IMP | RC-2 | Sim |
| 24 | charge-early-generated | calendar | realCount | 2 → 1 | semantic | IMP | RC-2 (derivado) | Sim |
| 25 | charge-early-generated | calendar | totalCount | 14 → 13 | semantic | IMP | RC-2 (derivado) | Sim |
| 26 | charge-early-generated | calendar | realCycleIds | [c,c] → [c] | semantic | IMP | RC-2 (derivado) | Sim |
| 27 | charge-early-generated | sidebar | openAmount | R$ 220 → R$ 110 | semantic | IMP | RC-2 | Sim |
| 28 | charge-early-generated | sidebar | eventCount | 2 → 1 | semantic | IMP | RC-2 (derivado) | Sim |
| 29 | generate-retroactive-months | alerts | kinds | [client_overdue] → [] | structural | IMP | RC-4b pending sem invoice | Sim |
| 30 | generate-retroactive-months | alerts | count | 1 → 0 | semantic | IMP | RC-4b (par de #29) | Sim |
| 31 | gateway-failed | events | count | 2 → 1 | semantic | IMP+DAD | RC-2 + RC-3 | Sim |
| 32 | gateway-failed | events | cycleIds | [c,c] → [c] | semantic | IMP+DAD | RC-2 | Sim |
| 33 | gateway-failed | calendar | realCount | 2 → 1 | semantic | IMP | RC-2 (derivado) | Sim |
| 34 | gateway-failed | calendar | totalCount | 14 → 13 | semantic | IMP | RC-2 (derivado) | Sim |
| 35 | gateway-failed | calendar | realCycleIds | [c,c] → [c] | semantic | IMP | RC-2 (derivado) | Sim |
| 36 | gateway-failed | sidebar | eventCount | 2 → 1 | semantic | IMP | RC-2 (derivado) | Sim |
| 37 | gateway-failed | alerts | kinds | [gateway_failed] → [] | structural | DAD+IMP | RC-3 gateway só na invoice | Sim |
| 38 | gateway-failed | alerts | count | 1 → 0 | semantic | DAD+IMP | RC-3 (par de #37) | Sim |
| 39 | invoice-refund | sidebar | openAmount | R$ 0,00 → R$ 110,00 | semantic | DAD+IMP | RC-1 refunded perdido | Sim |
| 40 | invoice-only | alerts | kinds | [client_overdue] → [] | structural | DAD | RC-4c invoice órfã | Sim |
| 41 | invoice-only | alerts | count | 1 → 0 | semantic | DAD | RC-4c (par de #40) | Sim |
| 42 | timeline-without-cycle | alerts | kinds | [client_overdue] → [] | structural | DEC+CTR | RC-4a lifecycle | Sim* |
| 43 | timeline-without-cycle | alerts | count | 1 → 0 | semantic | DEC+CTR | RC-4a (par de #42) | Sim* |

\* Paridade **byte-a-byte** com legacy nestes 8 casos exige replicar comportamento discutível (lifecycle `due_date` tratado como fatura atrasada) **ou** aceitar divergência intencional alinhada à constituição 4.2R.

---

## Root Cause Groups

| Grupo | Descrição | IDs | Qtd | Tipo dominante |
|-------|-----------|-----|-----|----------------|
| **RC-1** | Status de fatura (paid/refunded) indisponível em `cycles_raw`; Aggregate emite `invoice_due` em vez de `payment` | 1–4, 11–14, 39 | **9** | DAD + IMP |
| **RC-2** | Legacy emite **2 eventos reais/ciclo** (`manual_charge`/`invoice_generated` + `invoice_due`); Aggregate emite **1** | 15–28, 31–36 | **20** | IMP |
| **RC-3** | `gateway_failed` derivado de **invoice.status/gateway_status**, ausente em `cycles_raw` | 37–38 (+ parcial 31–36) | **2** (+6 derivados) | DAD + IMP |
| **RC-4a** | Legacy alerta `client_overdue` via `timeline` em linhas **lifecycle** (sem fatura) | 5–10, 42–43 | **8** | DEC + CTR |
| **RC-4b** | Legacy alerta overdue em ciclo **pending retroativo sem invoice**; Aggregate exige `invoiceId` | 29–30 | **2** | IMP |
| **RC-4c** | Fatura **invoice_only** (sem ciclo) só existe na timeline | 40–41 | **2** | DAD |

### Contagens solicitadas

| Métrica | Valor |
|---------|-------|
| Decorrem do modelo 1:1 ciclo→evento (RC-2) | **20** (46,5%) |
| Decorrem apenas de ausência de dados no ingress (RC-1, RC-3, RC-4c) | **13** base + **6** derivados de RC-2 por falta de `invoice_created_at` ≈ **31** tocadas por dados |
| Decorrem apenas de diferença de algoritmo (RC-4b, regras alerta) | **2** (+ **8** se exigir paridade lifecycle) |

---

## Structural Dependency Matrix

| Dependência estrutural | Divergências | Obrigatória? | Prevista 4.2R? | Bloqueia Cutover? |
|------------------------|--------------|--------------|----------------|-------------------|
| Pipeline stages imutáveis | 0 | — | Sim | Não |
| `detail.timeline` como decisor | 0 para fix | Proibido | Sim | Não |
| Import motor legado | 0 | Proibido | Sim | Não |
| 1 ciclo → N eventos | 20 | Permitido (≥1) | Sim §6.2 | Não |
| `invoices[]` no BillingContext | 31 | Sim | Sim §6.1 | **Sim, se ausente** |
| `lifecycle_events[]` | 8 (opcional) | Condicional | Sim §6.1 | Não (decisão UX) |
| Novo stage / novo snapshot | 0 | Não | — | Não |

---

## Data Dependency Matrix

| Campo / fonte ausente hoje | Usado por | Divergências | Resolução sem API? |
|----------------------------|-----------|--------------|-------------------|
| `invoices[].status` (paid, refunded, gateway_failed) | Event builder, alerts, sidebar | 9 + 2 + 39 | Não em produção |
| `invoices[].created_at` | `invoice_generated` antecipado | 14 (half RC-2) | Não |
| `invoices[]` órfãs (`subscription_cycle_id: null`) | Alerts invoice-only | 40–41 | Não |
| `stats.total_pending_cents` | Sidebar legacy alternativa | — | Aggregate calcula de events (OK após RC-1/2) |
| `operational_state` (timeline) | Legacy alerts | 8 lifecycle | Substituir por lifecycle_events ou DEC |
| `cycle.status = paid` em cycles_raw | — | Fixture only | Backend usa status de ciclo + invoice join |

**Evidência backend:** `cycles_raw` expõe apenas `SubscriptionCycleDbRow` (sem `invoice_status`). Timeline deriva `paid` / `gateway_failed` de `invRows` em `subscriptionTimelineUx.ts`. Isso confirma que o gap é de **ingress**, não de Aggregate.

---

## Architecture Impact Matrix

| Área 4.2R | Impacto das 43 divergências | Ação |
|-----------|----------------------------|------|
| Ingress único (`cycles_raw` + futuro `invoices[]`) | Alto | Adicionar `invoices[]` na API (já especificado) |
| FinancialEvent Builder | Alto | Multi-emissão por ciclo + invoice-aware types |
| Alerts (`projectSidebar` / alerts stage) | Médio | Regras overdue estendidas; gateway via invoice |
| History / NextInvoice / Capabilities | Nenhum | 100% paridade mantida |
| Proibição timeline como decisor | Reforço | Não usar timeline para fechar gaps |
| Shadow Mode | Nenhum | Continua válido |

**Veredito:** a arquitetura **4.2R permanece válida**. Os gaps são conformidade esperada (§ Gap de conformidade 4.2Q) sendo fechada incrementalmente.

---

## Cutover Readiness Matrix

| Critério | Status | Notas |
|----------|--------|-------|
| Paridade overall ≥ 99% | ❌ 95,7% | 43 gaps residuais |
| History / NextInvoice / Capabilities 100% | ✅ | Prontos para cutover |
| Isolamento Aggregate (zero legacy) | ✅ | Preservado em 5.0-21B |
| Shadow certification automatizada | ✅ | Suite verde |
| Bloqueador arquitetural | ✅ Nenhum | |
| Bloqueador de dados (`invoices[]`) | ⚠️ Sim | Pré-requisito API |
| Bloqueador implementação multi-event | ⚠️ Sim | Sprint pré-cutover |
| Decisão lifecycle alerts | ⚠️ Pendente | 8 divergências — DEC |
| **Recomendação formal** | **`READY_WITH_CORRECTIONS`** | Autorizar 5.0-22 **após** fechamento RC-1/2/3 + API invoices |

---

## Plano de fechamento recomendado (pré-5.0-22)

Ordem sugerida — **sem alterar arquitetura**:

1. **API / payload:** expor `invoices[]` no `CrmSubscriptionDetailPayload` (4.2R §6.1).
2. **Ingress stage:** mapear `invoices[]` para enriquecimento interno (novo sub-ingress permitido; não usar timeline).
3. **FinancialEvent stage:** emitir N eventos/ciclo (`payment`, `manual_charge`, `invoice_generated`, `invoice_due`, `invoice_failed`) usando invoice metadata.
4. **Alerts stage:** `gateway_failed` via invoice; `client_overdue` para pending retroativo (RC-4b); decisão formal sobre lifecycle (RC-4a).
5. **Re-certificação Shadow:** meta ≥ 99% overall.

Estimativa de impacto: **~35 divergências** fecham com passos 1–4; **~8** dependem de decisão funcional lifecycle ou `lifecycle_events[]`.

---

## Conclusão arquitetural

1. **Nenhuma** das 43 divergências exige redesign do `BillingAggregate`, novos stages obrigatórios, ou violação dos invariantes 4.2R.
2. A principal correção estrutural de **implementação** (não de arquitetura) é passar de **1:1 para N eventos por ciclo**, já previsto na constituição.
3. A principal correção de **plataforma** é **`invoices[]` no payload**, também já prevista e hoje ausente — isso **não** constitui mudança arquitetural, e sim evolução de contrato API planejada.
4. Permanecem **8 divergências de alerta** onde o legacy consulta `timeline` de forma questionável; o Aggregate está **mais alinhado à constituição** ao omiti-las.

---

## Recomendação formal para Cutover (Sprint 5.0-22)

| Item | Recomendação |
|------|--------------|
| Cutover imediato | **Não autorizado** (95,7% < 99%) |
| Bloqueador arquitetural | **Inexistente** |
| Próximo passo | Sprint de **fechamento residual** (implementação + `invoices[]` API) **antes** de 5.0-22 |
| Após fechamento | Reexecutar Shadow Certification; se ≥ 99%, promover para **`READY`** e executar Cutover |
| Risco residual aceitável | Divergências lifecycle (8) podem ser aceitas como **melhoria UX** se product confirmar |

**Parecer:** o `BillingAggregate` está **arquiteturalmente apto** para substituir o `FinancialEventStore`. O Cutover deve aguardar **enriquecimento de ingress e multi-emissão de eventos**, não revisão da constituição 4.2R.

---

## Definition of Done — 5.0-21C

| Critério | Status |
|----------|--------|
| 43 divergências classificadas individualmente | ✅ |
| Causas raiz identificadas | ✅ (RC-1 a RC-4c) |
| Bloqueadores arquiteturais identificados | ✅ (nenhum) |
| Resposta sobre necessidade de alterar arquitetura | ✅ (não necessária) |
| Parecer formal de aptidão para Cutover | ✅ `READY_WITH_CORRECTIONS` |

---

*Sprint 5.0-21C — laudo read-only. Nenhum arquivo de produção, Aggregate, FinancialEventStore, backend ou testes foi alterado.*
