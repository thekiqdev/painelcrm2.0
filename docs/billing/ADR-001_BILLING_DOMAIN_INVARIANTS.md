# ADR-001 — Billing Domain Invariants

**Sprint:** 5.0-22G  
**Status:** PROPOSED (Architecture Decision Record)  
**Modo:** ARCHITECTURE AUDIT (READ ONLY)  
**Data:** 2026-07-06  
**Escopo:** Contrato permanente do domínio Billing antes da Sprint 5.0-23 (Legacy Removal)

**Auditorias base:** 22B (Aggregate Wiring), 22C (Refresh), 22D (Manual Renewal Root Cause), 22E (Scheduler Parity), 22F (Business Rule)

---

## Decisão arquitetural

**Adotar o Modelo B — `subscription_cycle` como Single Source of Truth do domínio financeiro recorrente**, com separação explícita de camadas:

```
Subscription (contrato + next_billing_date)
        ↓
subscription_cycle (competência persistida = cycle_date)
        ↓
customer_invoice (artefato de cobrança, opcional por ciclo)
        ↓
BillingAggregate (leitura imutável por request)
        ↓
UI (render-only)
```

**Rejeitar:**

| Modelo | Veredito | Evidência |
|--------|----------|-----------|
| **A — Invoice como SSOT** | **Rejeitado** | Sprint 4.2G certificou `cycles_raw` como única fonte para Gerar/Calendar/History/Next; golden `invoice-only` é estado válido **sem** cycle |
| **C — Competência abstrata** | **Equivalente a B** | Competência **não** é entidade de tabela; identidade = `subscription_cycles.cycle_date` (UNIQUE `(subscription_id, cycle_date)`) |

**Regra única permanente do domínio:**

> **A competência financeira gerável é o primeiro `subscription_cycle` (ordenado por `cycle_date` ascendente, depois `id`) que possui `invoice_id IS NULL` e `status` ∈ {pending, queued, failed, skipped, cancelled}. Projeções UX nunca são competências geráveis.**

Implementações canônicas já existentes:

- UI/Aggregate: `resolveFirstEligibleCycle()` / `resolveFirstEligibleCycleFromAggregate()`  
- API manual (fallback): `findEarliestUninvoicedCycle()`  
- Geração explícita: `cycle_id` no POST — nunca `next_billing_date` (`BILLING_DETERMINISTIC_GENERATION.md`)

---

## Justificativa

1. **Certificação 4.2G** declarou `subscription_cycles` como SSOT de superfícies financeiras CRM (`BILLING_SINGLE_SOURCE_CERTIFICATION.md`).
2. **Billing Engine** já persiste transições em `subscription_cycles` + `billing_recurring_jobs`; invoice é **efeito** do worker/manual (`BILLING_LIFECYCLE_FORENSIC.md`, `BILLING_STATE_MACHINE_BLUEPRINT.md`).
3. **Sprint 4.2D** separou competência manual (`cycle_id`) de automação (`next_billing_date`).
4. **Auditorias 22B–22F** provaram: Aggregate, UI, refresh e scheduler estão corretos; tensão restante é **definição de domínio** (lazy materialization vs expectativa operador), não bug de implementação.
5. **Modelo B** maximiza previsibilidade: uma linha DB = uma competência; invoice é derivada auditável.

---

## Benefícios

- Uma identidade por competência (`cycle_date` + UNIQUE).
- Geração manual determinística (4.2D) preservada.
- Aggregate 5.x continua válido sem redesign (`cycleStage` → `events` → surfaces).
- Scheduler/worker mantêm ownership de escrita sem conflito com leitura.
- Operador entende: **sem cycle real, não há Gerar** — regra única.

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Lazy materialization deixa gaps (4.2K) | Política explícita: gap ≠ bug; materialização via enqueue (22E) |
| Projeção confunde operador (22F) | Projeção permanece **não-gerável**; copy UX já documentada |
| Invoice órfã sem cycle (`invoice-only`) | Estado permitido para cobranças não-recorrentes; fora do algoritmo gerável |
| Tensão janela `generation_date` (22F) | Decisão produto 5.0-23: paridade scheduler (22E) vs materialização imediata |

---

# Parte 1 — Domínio

## 1 — Qual entidade representa a competência financeira?

| Entidade | Papel | É competência? |
|----------|-------|----------------|
| **`subscription_cycle`** (`cycle_date`) | Identidade persistida da competência | **SIM — SSOT** |
| `customer_invoice` | Artefato de cobrança (`period_start` ≈ competência) | Derivada; pode existir sem cycle |
| `subscriptions.next_billing_date` | Âncora de **automação** e projeção | **NÃO** — 4.2D: não decide clique manual |
| **Projection** (`kind: projected`) | UX-only, `cycleId: null` | **NÃO** — `subscriptionFinancialProjection.ts` L2–4 |

**Resposta:** Competência = **`subscription_cycle.cycle_date`** (uma row por competência por assinatura).

---

## 2 — Qual entidade o código mais utiliza?

Contagens aproximadas (grep workspace, jul/2026):

| Símbolo / conceito | ~Refs totais | Frontend `src/` | Backend `packages/backend/src/` |
|--------------------|-------------|-----------------|--------------------------------|
| `subscription_cycles` / `cycles_raw` | **~200+** | ~45 | ~120 |
| `customer_invoices` / `invoice_id` | **~400+** | ~80 | ~320 |
| `resolveFirstEligibleCycle` / `nextInvoice` | **~80** | ~80 | 0 |
| `buildProjectionEvents` / `isProjected` | **~55** | ~55 | 0 |

**Por subsistema:**

| Subsistema | Entidade dominante |
|------------|-------------------|
| **Aggregate** | `cycles_raw` → `aggregate.cycles` → events (`BillingAggregateBuilder.ts` L21–25) |
| **Scheduler** | `next_billing_date` → `billing_recurring_jobs` → dual-write `subscription_cycles` |
| **Manual Generate** | `cycle_id` → `subscription_cycles` → job → invoice (`billingCycleInvoiceGenerationService.ts`) |
| **UI Gerar** | `cycleId` obrigatório (`subscriptionBillingGeneration.ts` L56–57) |
| **Runtime engine** | `customer_invoices` (persistência pesada) + `subscription_cycles` (dual-write) |

**Resposta:** Backend runtime fala mais em **invoices** (efeitos); domínio de **decisão CRM** fala em **cycles** (4.2G, Aggregate 5.x).

---

## 3 — Existe mais de uma fonte de verdade?

**SIM — por camada, com papéis distintos:**

| Fonte | Camada | Papel | Conflito? |
|-------|--------|-------|-----------|
| `subscription_cycles` (DB) | Runtime persistido | SSOT competência gerável | — |
| `subscriptions.next_billing_date` | Runtime persistido | Âncora automação + projeção | Pode divergir de rows existentes (4.2K) |
| `customer_invoices` | Runtime persistido | SSOT cobrança/pagamento | Pode existir sem cycle (`invoice-only`) |
| `cycles_raw` (GET) | API read | Espelho fiel do DB | Não |
| `timeline` (GET) | API derivada | Apresentação legada | **Proibido** como decisor (`BILLING_ARCHITECTURE_SPECIFICATION.md` L158) |
| Projection (`kind: projected`) | Presentation | Previsão UX | **Não** é SSOT — complementa calendário |
| `automation_summary` | API derivada | Diagnóstico | Não decisor UI |

**Conflito documentado:** calendário pode mostrar meses **projected** que **não** existem em `subscription_cycles` (`BILLING_CYCLE_GAP_ANALYSIS.md` § Mechanism 3).

---

## 4 — Estados inválidos que o domínio permite hoje

| Estado | Permitido? | Evidência |
|--------|------------|-----------|
| Cycle sem invoice (`pending`/`queued`/`failed`) | **SIM** | State machine blueprint; golden `manual-renew` |
| Invoice sem cycle | **SIM** | Golden `invoice-only`; `merge_source: invoice_only` |
| Gap de competências (Jul, Out sem Set) | **SIM** | `BILLING_CYCLE_GAP_ANALYSIS.md` Mechanism 1 |
| Projeção antes de cycle materializado | **SIM** | `projection-only` golden; 4.2H |
| Jul sem invoice + Out com invoice (gap) | **SIM** | Golden `generate-jul-before-aug` |
| Dois cycles mesma competência | **NÃO** | `ON CONFLICT (subscription_id, cycle_date)` |
| Invoice futura sem invoice anterior | **SIM** | Gaps + geração fora de ordem (4.2D) |
| `next_billing_date` à frente sem row correspondente | **SIM** | Lazy materialization |
| Cycle `invoiced` com `invoice_id` NULL | **NÃO** (inconsistência) | `billingRuntimeValidator` audita |
| Job `completed` + cycle não `invoiced` | **SIM** (skipped/tenant) | `BILLING_CYCLE_OWNERSHIP.md` |
| Cycle `cancelled` + subscription `active` | **SIM** | Reschedule/mismatch |
| Projeção com `cycleId` | **NÃO** | `projectionSnapshot.ts` L37: `cycleId: null` |
| Evento real sem `cycleId` | **NÃO** (financial builder) | 4.2G `assertAllEventsHaveCycleId` |

---

## 5 — Intencional vs bug vs consequência arquitetural

| Estado | Classificação |
|--------|---------------|
| Cycle sem invoice | **Intencional** |
| Invoice sem cycle | **Intencional** (manual / órfã) |
| Gap de competências | **Consequência arquitetural** (lazy materialization) |
| Projeção sem cycle | **Intencional** (4.2H UX) |
| Jul+Out gap gerável | **Intencional** (4.2D fora de ordem) |
| Duplicata cycle_date | **Proibido** (DB) |
| POST manual sem C+1 (pré-22E) | **Consequência** — corrigida parcialmente em 22E |
| Card sem Gerar pós-Generate (projection-only) | **Intencional** UI (22B) |
| Tensão operador vs janela generation_date | **Decisão de negócio pendente** (22F) |

---

# Parte 2 — Invariantes definitivos

| ID | Invariante | Válido? | Notas |
|----|------------|---------|-------|
| **INV-01** | Todo `subscription_cycle` pertence a exatamente uma competência (`cycle_date` único por subscription) | **SIM** | UNIQUE DB |
| **INV-02** | Toda invoice recorrente pertence a um `subscription_cycle` | **NÃO** | Invoice pode existir sem cycle; cycle link via `invoice_id` opcional |
| **INV-03** | Competência pode existir sem invoice | **SIM** | `pending`/`queued`/`failed` são estados oficiais |
| **INV-04** | Invoice pode existir sem cycle | **SIM** | Golden `invoice-only`; admin detach on delete |
| **INV-05** | Projection faz parte do domínio | **NÃO** | **Apenas presentation** — `projectionSnapshot.ts` L11–12; 4.2H |
| **INV-06** | Quem determina próxima cobrança gerável | **Cycle** (primeiro elegível); fallback **projection** só para exibição NextInvoice | `resolveNextInvoiceFromAggregate` |
| **INV-07** | Algoritmo competência gerável | **C = `resolveFirstEligibleCycle`** (UI) / **`findEarliestUninvoicedCycle`** (API) | Ver tabela abaixo |
| **INV-08** | Jul sem invoice + Ago com invoice permitido | **SIM** | Gap + golden `generate-jul-before-aug` |
| **INV-09** | Apagar invoice permitido | **SIM** (restrito) | `deleteCustomerInvoiceWithGateway`; subscription só se cancelled/failed |
| **INV-10** | Domínio auto-reparável | **PARCIAL** | Delete → `detachSubscriptionCyclesInvoiceRef`; repair failed→pending; **não** INSERT cycle |

### INV-07 — Comparação de algoritmos

| Algoritmo | Onde | Prós | Contras |
|-----------|------|------|---------|
| **A) `nextInvoice()` / presentation** | Aggregate `nextInvoiceStage` | UX unificada; inclui fallback projected | Não é algoritmo de **geração** |
| **B) `resolveFirstEligibleCycle()`** | `subscriptionCyclesSource.ts` | Certificado 4.2G; determinístico | Ignora gaps não materializados |
| **C) Primeiro cycle sem invoice (DB)** | `findEarliestUninvoicedCycle` | Paridade API manual | Mesmo que B na prática |
| **D) `next_billing_date`** | Scheduler only | Correto para automação | **Proibido** para manual (4.2D) |

**Oficial:** **B/C** (equivalentes semânticos) para gerável; **A** apenas para **exibição** de próxima cobrança.

### INV-09 — Reação ao apagar invoice

`customerInvoiceAdminService.ts` L441–446:

```sql
UPDATE subscription_cycles SET invoice_id = NULL WHERE invoice_id = $2
```

Cycle permanece; status **não** reverte automaticamente para `pending` — reparo parcial.

### INV-10 — Auto-reparo

- `validateBillingRuntime` + `repairRecoverableSubscriptionCycles`: failed→pending (sem INSERT).  
- Apagar invoice: desvincula cycle.  
- **Generate** pode recriar invoice se cycle elegível — **não** documentado como invariante automático; é ação manual.

---

# Parte 3 — Aggregate

## Representa estado real ou enriquecido?

**Híbrido documentado:**

| Superfície Aggregate | Base |
|---------------------|------|
| `subscription`, `cycles`, `invoices` | **Estado real** (wire GET) |
| `events` (kind=real) | Derivado de cycles+invoices |
| `calendar` | Real + **projeções** (`calendarStage` L47–56) |
| `nextInvoice` | Real elegível OU **projeção** (`nextInvoiceStage` L59–73) |
| `history` | **Somente eventos reais** (`historyStage` L42–44) |
| `capabilities` | Derivado de cycles+events |

**Resposta:** Aggregate = **estado real do domínio + enriquecimento UX controlado** (projeção só em calendar/nextInvoice).

## Projection dentro ou fora do Aggregate?

**Dentro do Aggregate, fora do domínio persistido.**

- `buildProjectionEventsFromAggregate` — submodule presentation (`projectionSnapshot.ts`).  
- Não persiste DB; não gera invoice; `cycleId: null`.

## Se projection desaparecesse, o motor funciona?

**SIM — tecnicamente.**

| Componente | Impacto |
|------------|---------|
| Scheduler / Worker / Manual POST | **Nenhum** — não usam projection |
| GET `cycles_raw` | **Nenhum** |
| Calendar UI | Perde dots futuros sem row |
| NextInvoice card | `null` se sem cycle elegível |
| History | **Inalterado** (só reais) |
| Generate | **Inalterado** (exige cycle) |

---

# Parte 4 — Scheduler

## Responsabilidades

| Responsabilidade | Scheduler | Worker | Manual |
|------------------|-----------|--------|--------|
| Criar `subscription_cycles` row | **SIM** (dual-write) | UPDATE status | SIM (ciclo C + tryEnqueue C+1) |
| Criar `billing_recurring_jobs` | **SIM** | processa | SIM (sync) |
| Criar `customer_invoices` | **NÃO** | **SIM** | **SIM** (sync pipeline) |
| Avançar `next_billing_date` | **NÃO** | **SIM** | **SIM** |

**Resposta:** Scheduler = **automação de enfileiramento + materialização lazy de cycles**; não é dono de invoices.

## Manual Generate depende do Scheduler?

| Aspecto | Dependência |
|---------|-------------|
| Executar cobrança do ciclo **C** | **Independente** (pipeline síncrono, ignora janela) |
| Materializar ciclo **C+1** (pós-22E) | **Parcial** — `tryEnqueueRenewalJobForSubscriptionId` (mesma regra scheduler) |
| Existência do ciclo **C** para clicar | Cycle deve **já existir** (scheduler anterior ou backfill) |

---

# Parte 5 — UI

## Ações × dependência de `cycleId`

| Ação | Exige `cycleId`? | Evidência |
|------|------------------|-----------|
| **Gerar** | **SIM** | `invoiceCapabilities.ts` L75; `executeDeterministicGenerateRenewal` |
| **Abrir** | **NÃO** — exige `invoiceId` | L73 |
| **Reprocessar** | **NÃO** — exige job falho + contexto subscription | `SubscriptionRenewalActionsCard`; `supportsReprocess: failed && hasInvoice` |
| **Reenviar** | **NÃO** — exige invoice | `supportsEmail` |
| **Cancelar** (subscription) | **NÃO** | Lifecycle |
| **Registrar pagamento** | **NÃO** — exige invoice | L74 |

## Ação só com invoice (sem cycle)

| Ação | Só invoice? |
|------|-------------|
| Abrir, Copiar link, Registrar pagamento, PDF | **SIM** |
| Reprocessar (com invoice failed) | **SIM** |
| Gerar | **NÃO** |

---

# Tabelas mandatórias

## Fluxo × Materializa C+1

| Fluxo | Materializa C+1? |
|-------|------------------|
| Scheduler `enqueueRenewalJobs` | Condicional (janela) |
| Manual Generate (22E) | Condicional (`tryEnqueue`) |
| PATCH `next_billing_date` | Condicional |
| Resume/Reactivate | Condicional |
| Worker complete | Avança `next_billing_date` only |
| Runtime validation | **Não** |

## Fluxo × Respeita `generation_date`

| Fluxo | Respeita? |
|-------|-----------|
| Scheduler / tryEnqueue | **SIM** |
| Manual execução ciclo C | **NÃO** |
| Worker automático | **SIM** |

## Fluxo × Botão Gerar disponível (card)

| Condição | Gerar? |
|----------|--------|
| Cycle elegível em `cycles_raw` | **SIM** |
| Só projeção | **NÃO** |
| Invoice na competência | **Abrir**, não Gerar |

## Componente × Necessita `cycleId`

| Componente | Precisa `cycleId` |
|------------|-------------------|
| NextInvoiceCard (Gerar) | **SIM** |
| FinancialCalendarPopover | **SIM** |
| UpcomingPaymentsList | **SIM** |
| FinancialHistoryRow (Gerar) | **SIM** |
| SubscriptionActionsPanel FAB | **SIM** (via resolver) |
| InvoiceDirectActions (Abrir/Pagar) | **NÃO** |

## Scheduler vs Manual vs PATCH

| Dimensão | Scheduler | Manual | PATCH |
|----------|-----------|--------|-------|
| SSOT competência clicada | N/A | `cycle_id` | N/A |
| Cria invoice | Via worker | Sync | Não |
| Materializa cycle | Se janela | C sync + C+1 tryEnqueue | Se janela |
| Ignora janela na execução | N/A | **SIM** (ciclo C) | N/A |

---

# Mapa — fluxos que criam `subscription_cycles`

| Origem | Função |
|--------|--------|
| Scheduler / tryEnqueue | `subscriptionCyclesUpsertAfterScheduler` |
| Manual ensure job | idem |
| Worker lifecycle | UPDATE status |
| Migration 141 | backfill |
| Repair | UPDATE only (**não** INSERT) |

Único INSERT path produção: **dual-write via `insertOrReactivateRenewalJob`**.

---

# Parte 7 — Impacto da ADR (Sprint 5.0-23)

## Afetados (política / documentação / possível produto)

| Área | Mudança necessária? |
|------|---------------------|
| **ADR / docs** | Formalizar esta decisão |
| **22F decisão produto** | Escolher paridade janela vs C+1 imediato |
| **Copy UX** | Reforçar “sem cycle, sem Gerar” |
| **Golden `projection-only`** | Manter como estado válido |

## NÃO precisam alteração estrutural (se ADR aceita Modelo B)

| Área | Motivo |
|------|--------|
| BillingAggregate builder | Já modela B |
| `subscriptionCyclesSource` | Já implementa regra |
| Scheduler/worker engine | Ownership correto |
| UI gates `cycleId` | Alinhados 4.2G |
| Refresh/store (22C) | Correto |
| SQL schema | UNIQUE já existe |

## Arquivos de referência (contrato, não lista de mudança)

- `src/lib/subscriptionCyclesSource.ts` — algoritmo gerável  
- `src/lib/billingAggregate/BillingAggregateBuilder.ts` — pipeline read  
- `packages/backend/src/services/subscriptionCyclesDualWriteService.ts` — write  
- `packages/backend/src/services/billingCycleInvoiceGenerationService.ts` — manual  
- `packages/backend/src/services/recurringBillingJobService.ts` — scheduler  

---

# Parte 8 — Retrocompatibilidade

| Item | Exige? | Resposta |
|------|--------|----------|
| Reconstruir Billing Engine | **NÃO** | Ownership já é cycle-based |
| Reconstruir Aggregate | **NÃO** | Já implementa Modelo B + projection UX |
| Reconstruir Scheduler | **NÃO** | |
| Recriar Store | **NÃO** | 22B wiring permanece |
| Alterar banco | **NÃO** | |
| Novas tabelas | **NÃO** | |
| Novas migrations | **NÃO** | Para aceitar ADR como está |

**Sprint 5.0-23 (Legacy Removal):** remover helpers legados (`buildFutureCycles` fora do Aggregate, timeline como decisor) — **não** muda invariantes.

---

# Parte 9 — Estados proibidos vs permitidos

## Proibidos (domínio)

1. Dois `subscription_cycles` com mesmo `(subscription_id, cycle_date)`.  
2. Gerar cobrança sem `cycle_id` / sem row em `subscription_cycles`.  
3. Projeção com `cycleId` preenchido.  
4. Evento financial `kind=real` sem `cycleId` (pipeline certificado).  
5. Usar `timeline` ou `next_billing_date` como decisor de competência manual.

## Permitidos (domínio)

1. Cycle sem invoice (estados geráveis).  
2. Invoice sem cycle (`invoice-only`).  
3. Gap de competências não materializadas.  
4. Projeção UX em calendário/nextInvoice fallback.  
5. Múltiplos cycles sem invoice não consecutivos (`generate-jul-before-aug`).  
6. Cycle `cancelled` coexistindo com subscription `active`.  
7. `next_billing_date` à frente do último cycle row.

---

# Algoritmo oficial do domínio

```
FUNÇÃO competência_gerável(assinatura):
  SE assinatura.status = cancelled: RETORNA null
  PARA cycle EM subscription_cycles(assinatura) ORDENADO POR cycle_date ASC:
    SE cycle.invoice_id IS NOT NULL: CONTINUA
    SE cycle.status ∉ GENERATABLE: CONTINUA
    RETORNA cycle
  RETORNA null

FUNÇÃO próxima_cobrança_UI(assinatura, cycles, today):
  c ← competência_gerável(assinatura)
  SE c ≠ null: RETORNA evento_real(c)
  SENÃO: RETORNA primeira_projeção(next_billing_date, cycles ocupados)
  // projeção: NUNCA gerável

FUNÇÃO gerar_manual(assinatura, cycle_id opcional):
  cycle ← cycle_id ?? competência_gerável(assinatura)  // findEarliestUninvoicedCycle
  SE cycle = null: ERRO cycle_required
  EXECUTAR pipeline(job → invoice) PARA cycle.cycle_date
  AVANÇAR subscriptions.next_billing_date
  tryEnqueue(próximo cycle_date)  // paridade scheduler — condicional janela
```

---

# Plano de migração

**Nenhuma migração de schema.**

| Fase | Ação |
|------|------|
| **5.0-23** | Ratificar ADR; remover código legado que usa timeline/`buildFutureCycles` como decisor |
| **Produto (opcional)** | Decidir 22F Opção A vs B para materialização C+1 pós-manual |
| **Docs** | Atualizar certificação 4.2D critério 4 com nota lazy materialization |
| **Testes** | Manter golden `projection-only` + `manual-renew` como estados válidos |

---

# Compatibilidade Sprint 5.0-23

Esta ADR **habilita** Legacy Removal:

- Aggregate já é read-model sobre `cycles_raw`.  
- Projeção fica confinada ao Aggregate (remover duplicata legada fora dele).  
- Uma regra gerável → menos gates divergentes.  
- Não exige reescrita do motor.

**Não resolve** (decisão produto separada): materialização imediata C+1 vs janela `generation_date` (22F).

---

# Resumo para stakeholders

| Pergunta | Resposta ADR |
|----------|--------------|
| SSOT do domínio? | **`subscription_cycle`** |
| Invoice? | Artefato de cobrança, não competência |
| Projeção? | UX only, nunca gerável |
| Regra única? | Primeiro cycle sem invoice elegível |
| Bug ou domínio? | Gaps e projection-only são **arquitetura**; tensão UX é **produto** |
| Próximo passo 5.0-23? | Legacy removal + ratificar política C+1 (22F) |

---

**Assinatura de evidência:** código `subscriptionCyclesSource.ts`, `BillingAggregateBuilder.ts`, `BILLING_DETERMINISTIC_GENERATION.md`, `BILLING_SINGLE_SOURCE_CERTIFICATION.md`, `BILLING_CYCLE_GAP_ANALYSIS.md`, `SPRINT_5.0-22F_MANUAL_RENEWAL_BUSINESS_RULE_AUDIT.md`, golden dataset 40 cenários (`BILLING_GOLDEN_DATASET.md`).

**Próxima ADR sugerida:** ADR-002 — Política de materialização pós-avanço (`generation_date` vs imediato).
