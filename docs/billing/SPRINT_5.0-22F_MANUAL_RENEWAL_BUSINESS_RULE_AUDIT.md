# Sprint 5.0-22F — Manual Renewal Business Rule Audit

**Modo:** INVESTIGATION (READ ONLY)  
**Data:** 2026-07-04  
**Hipótese zero:** Não assumir que paridade com o Scheduler é regra de produto só porque o código a reproduz.

---

## Conclusão executiva

Existem **duas regras documentadas em conflito parcial** com a **expectativa do operador**:

| Camada | Regra implícita | Evidência |
|--------|-------------------|-----------|
| **Runtime / arquitetura (4.2K–4.2H)** | `subscription_cycles` é **materialização lazy** — não há linha por mês futuro; projeção UX preenche calendário sem `cycle_id` | `BILLING_LIFECYCLE_FORENSIC.md`, `BILLING_CYCLE_GAP_ANALYSIS.md`, `subscriptionFinancialProjection.ts` |
| **Geração manual determinística (4.2D)** | Manual fatura **só o ciclo clicado**; `next_billing_date` serve **automação e projeção**, não competência do clique | `BILLING_DETERMINISTIC_GENERATION.md`, certificação 4.2D critério 3 |
| **Automação (scheduler / PATCH)** | Materializar job+cycle só quando **`generation_date ≤ hoje`** + janela local | `CORRECAO_ALTERAR_PROXIMA_RENOVACAO_E_AGENDAMENTO.md`, `recurringBillingJobService.ts` |
| **UI / Aggregate (22B)** | Sem cycle real elegível → **`isProjected=true`** → card/calendário **ocultam Gerar** (intencional desde 4.2H) | `GENERATE_BUTTON_INVESTIGATION_22B.md`, `NextInvoiceCard.tsx` L43–44 |
| **Operador CRM** | Após “Gerar”, espera **próxima competência real** e botão Gerar imediato | Relatos 22C/22D; **não** há doc funcional que exija isso universalmente |

**Veredicto:** O comportamento **pré-22E** (gap C+1 + projeção) era **decisão arquitetural documentada**, não bug acidental do Aggregate. A **Sprint 22E** adicionou `tryEnqueueRenewalJobForSubscriptionId` pós-manual — isso é **paridade parcial com scheduler**, **não** “sempre materializar C+1 imediatamente”. Fora da janela `generation_date`, C+1 continua ausente e a UI permanece em projection-only.

**Onde nasce a divergência arquitetura × UX:**  
1. Backend avança `next_billing_date` sem garantir row C+1 (22D).  
2. Aggregate/UI **foram desenhados** para tratar ausência de row como projeção legítima (4.2H).  
3. Operador interpreta calendário/histórico com dots “Prevista” como competência operável — mas React **bloqueia** Gerar sem `cycle_id`.

**Recomendação Sprint 5.0-23:** Product owner deve **escolher explicitamente** uma regra oficial (ver § Recomendação). Evidências **não** sustentam “sempre C+1 imediato” como regra histórica; sustentam **lazy materialization + janela de geração** como regra runtime, com **tensão UX documentada**.

---

## Respostas às 15 perguntas

### 1 — Estado funcional esperado após geração manual

**Documentação existente:**  
- Certificação 4.2D critério **3**: *“Após gerar Julho, **Agosto inalterado**”* — refere-se a **não faturar** a competência errada, não necessariamente a ausência de row (`BILLING_CYCLE_GENERATION_CERTIFICATION.md`).  
- Certificação 4.2D critério **4**: *“Próxima prévia promovida após avanço pós-sucesso”* — avanço de `next_billing_date`, **sem** exigir INSERT em `subscription_cycles` para C+1.  
- `BILLING_LIFECYCLE_FORENSIC.md` L43: cycles **não** são pré-materializados para todo mês futuro.

**UI explícita:** `NextInvoiceCard` subtitle em projeção: *“Previsão — o ciclo oficial será criado automaticamente pelo agendador”* (`NextInvoiceCard.tsx` L43–44).

**Resposta:** Segundo docs **é aceitável** permanecer só com projeções até enqueue elegível. **Não** há requisito funcional escrito de “sempre existe próximo cycle real imediatamente após Generate”.

---

### 2 — Documentação sobre `generation_date` na geração manual

**SIM, para automação e pós-PATCH; NÃO explícito para manual antes de 22E:**

| Fonte | Afirmação |
|-------|-----------|
| `CORRECAO_ALTERAR_PROXIMA_RENOVACAO_E_AGENDAMENTO.md` | PATCH chama `tryEnqueueRenewalJobForSubscriptionId` com mesma regra do scheduler (`generation_date`, janela local) |
| `recurringBillingJobService.ts` L1017–1019 | Scheduler: `(next_billing_date − antecipação) ≤ CURRENT_DATE` |
| `BILLING_DETERMINISTIC_GENERATION.md` | Manual **não** menciona `generation_date`; foca `cycle_id` |
| `SPRINT_5.0-22D` / `22E` | Manual **não** enfileirava C+1; 22E alinhou ao `tryEnqueue` **com** janela |

**Conclusão:** Nenhum doc **anterior a 22E** exige que manual respeite `generation_date`. Pós-22E, manual **passou** a respeitar indiretamente via `tryEnqueueRenewalJobForSubscriptionId`.

---

### 3 — Comportamento antes do BillingAggregate (22B)

**Igual no backend; diferente na exposição UI.**

- 22D provou: gap C+1 existia **antes** do wiring Aggregate (POST não criava row C+1).  
- 22B apenas leu `cycles_raw` via Aggregate — **não** alterou motor.  
- Legado (`FinancialEventStore` + projeção 4.2H): mesma regra — sem row → evento `kind: projected`, sem `cycle_id` (`subscriptionFinancialProjection.ts` L2–4, L36–37).

**Conclusão:** Legado **não** materializava C+1 imediatamente após manual; projection-only já era estado válido certificado (`projection-only` golden scenario).

---

### 4 — Testes sobre geração manual antes de `generation_date`

| Teste / fixture | O que cobre |
|-----------------|-------------|
| `charge-early-generated` | Fatura antecipada **com cycle real** já existente (`invoice_id` preenchido) — não POST manual pós-avanço |
| `generate-jul-before-aug` | Dois cycles **reais** (Jul + Out gap) — geração por `cycle_id`, não materialização pós-POST |
| `projection-only` | Estado **sem** `cycles_raw` — calendário só projeção; `generateCycleIds: []` |
| `billingCycleInvoiceGenerationService.test.ts` | Validação por ciclo; `cycle_required` se tabela vazia |
| `manualRenewSchedulerParity.test.ts` (22E) | Paridade **quando** payload já contém C+1 (fixture pós-enqueue elegível) |
| `billingManualRenewalExecution.test.ts` | Mock pipeline; pós-22E verifica chamada a `tryEnqueue` |

**Gap de testes:** Não há teste de integração DB que asserte “POST manual **fora** da janela → sem row C+1” vs “dentro da janela → com row C+1”. Comportamento inferido de `describeRenewalEnqueueWithDb` L740–756.

---

### 5 — Diferença funcional entre fluxos

Ver tabela mandatória § “Scheduler vs Manual vs PATCH” abaixo.

Resumo:

- **Scheduler:** enfileira só candidatos na janela; INSERT cycle via dual-write.  
- **Generate Manual:** fatura ciclo **C** síncrono; avança subscription; pós-22E tenta `tryEnqueue` para **novo** `next_billing_date` (mesma janela). `ensureJobForManualGenerate` enfileira **C** **sem** revalidar janela (execução imediata).  
- **PATCH next_billing_date:** cancela jobs pending; `tryEnqueue` se elegível.  
- **Renovação antecipada:** operador clica ciclo **existente** — não cria C+1.  
- **Reprocessamento:** reexecuta job falho/pending do **mesmo** ciclo; pós-22E também chama `tryEnqueue` ao suceder.

---

### 6 — Quem chama `tryEnqueueRenewalJobForSubscriptionId`

| Caller | C+1 imediato? |
|--------|----------------|
| `customerInvoiceRecurrenceNextBillingService` (PATCH) | **Só se** `generation_date ≤ CURRENT_DATE` + janela local |
| `crmSubscriptionsLifecycleService` (resume/reactivate) | Idem (best-effort) |
| `crmSubscriptionsContractService` (patch contrato) | Idem |
| `billingManualRenewalService.runSynchronousManualPipeline` (22E) | Idem, após job `completed` |
| `enqueueRenewalJobs` (scheduler) | Idem, batch |

**Nenhum caller** bypassa `generation_date` exceto indiretamente: `ensureJobForManualGenerate` → `insertOrReactivateRenewalJob` para o **ciclo já escolhido** (não C+1 automático).

---

### 7 — UI que assume cycle real

| Componente | Dependência de `cycleId` real |
|------------|-------------------------------|
| `NextInvoiceCard` | Gerar só se `!isProjected && cycleId` |
| `FinancialCalendarPopover` | `InvoiceDirectActions` só se `!projected && cycleId` |
| `ProjectedCompetenceNotice` | Mensagem “criada automaticamente quando chegar a competência” |
| `UpcomingPaymentsList` | Gerar se `!isProjected && cycleSupportsManualGenerate` |
| `executeDeterministicGenerateRenewal` | **Bloqueia** POST sem `cycle_id` (`subscriptionBillingGeneration.ts` L56–57) |
| `SubscriptionActionsPanel` FAB “Gerar próxima” | Usa `resolveFirstEligibleCycle` — **precisa** row existente; **não** gera a partir de projeção |

**Exceção parcial:** FAB permanece visível (`showRenewalGenerate: active`) mas falha se não houver cycle elegível.

---

### 8 — Aggregate: projection-only vs cycles reais

**Projetado para cycles reais como SSOT; projeção como fallback UX.**

- `resolveNextInvoiceFromAggregate`: primeiro cycle elegível em `cycles[]`; senão primeira projeção (`nextInvoiceSnapshot.ts` L48–72).  
- `BILLING_ARCHITECTURE_SPECIFICATION.md` L96–97: submodule projections com `cycleId: null`.  
- Golden `projection-only`: estado **certificado válido**, não erro.

---

### 9 — Snapshots `scheduler-renewal` e `projection-only`

| ID | Construção | Representa |
|----|------------|------------|
| `scheduler-renewal` | Fixture com **1 cycle real** `c-sched`, job pending, automation “Agendado” | Estado **possível** pós-enqueue — **não** spec de “sempre após manual” |
| `projection-only` | `cycles_raw: []`, `history.rowCount: 0`, calendário 12 eventos projected | Estado **válido certificado** — assinatura ativa sem materialização |

Fonte: `tests/billing/golden-dataset/scenarios.ts` L445–459, L644–661; `BILLING_GOLDEN_DATASET.md` — catálogo de **estados possíveis**, não backlog de requisitos.

---

### 10 — Inconsistência projection-only entre superfícies

**Consistente entre si; inconsistente com expectativa operador.**

| Superfície | projection-only |
|------------|-----------------|
| NextInvoice | `isProjected=true`, subtitle agendador |
| Calendar | dots projected, sem Gerar |
| History | vazio (`projection-only.json` L4–7) |
| Sidebar | derivada de events — sem ciclo real |
| Capabilities | `canGenerate=false`, `generateCycleIds: []` |

**Inconsistência semântica:** calendário **mostra** competências futuras; histórico/card **não** oferece Gerar — **by design** 4.2H (`BILLING_CYCLE_GAP_ANALYSIS.md` § Mechanism 2).

---

### 11 — Componentes que exigem `cycleId` para ações

- `NextInvoiceCard`, `FinancialCalendarPopover`, `UpcomingPaymentsList`, `InvoiceDirectActions`, `FinancialHistoryRow` (via `cycleSupportsManualGenerate`), `executeDeterministicGenerateRenewal` (API).

---

### 12 — Limitação técnica vs negócio

**Decisão de negócio / arquitetura, não impedimento técnico.**

- `insertOrReactivateRenewalJob` + `subscriptionCyclesUpsertAfterScheduler` **podem** criar row sem checar janela — já usado em `ensureJobForManualGenerate` para ciclo corrente.  
- `tryEnqueueRenewalJobForSubscriptionId` **escolhe** aplicar `generation_date` (`describeRenewalEnqueueWithDb` L740–756).  
- Dual-write usa `ON CONFLICT` — idempotente se scheduler repetir (22E cenários 6–7).

---

### 13 — Invariantes riscadas se manual **sempre** materializasse C+1

| Invariante | Risco |
|------------|-------|
| Lazy materialization (4.2K) | Quebra — rows apareceriam antes da janela de automação |
| Worker janela horária | Job `pending` para C+1 poderia ser picked antes da hora local permitida |
| Certificação 4.2D “competência clicada” | Baixo — row ≠ invoice |
| Separação projection vs real (4.2H) | Calendário teria duplicata visual se projeção não excluir datas ocupadas (`occupiedDueDatesFromDetail`) — **mitigável** |
| Paridade scheduler (22E objetivo) | Quebra se bypass de janela só no manual |

---

### 14 — Risco duplicidade POST manual + Scheduler

**Baixo — mecanismos existentes:**

- `insertOrReactivateRenewalJob`: guard active pending/processing; `ON CONFLICT` em jobs; `subscriptionCyclesUpsertAfterScheduler` UPSERT (`subscriptionCyclesDualWriteService.ts` L101–120).  
- Outcomes: `skipped_active_exists`, `skipped_completed_cycle`.  
- Evidência testes 22E cenários 6–7 (payload estável).

---

### 15 — Maior consistência para operador CRM

**Materializar C+1 imediatamente após Generate manual** alinha card/calendário/histórico com fluxo mental “faturei → quero faturar o próximo”.

**Manter janela `generation_date`** alinha com automação, PATCH documentado e lazy materialization — operador vê projeção até janela abrir.

Hoje (22E): **meio-termo** — paridade scheduler quando elegível; projection-only quando não.

---

## Tabelas mandatórias

### Fluxo × Materializa C+1

| Fluxo | Materializa C+1? | Condição |
|-------|------------------|----------|
| Scheduler `enqueueRenewalJobs` | Sim | `generation_date ≤ hoje` + janela local |
| Generate Manual (22E) | **Condicional** | Pós-sucesso → `tryEnqueue` (mesma regra) |
| Generate Manual (pré-22E) | **Não** | Só avança `next_billing_date` |
| PATCH `next_billing_date` | Condicional | `tryEnqueue` pós-PATCH |
| Resume / Reactivate | Condicional | `tryEnqueue` best-effort |
| Reprocess job | Condicional | Mesmo pipeline manual pós-22E |
| `ensureJobForManualGenerate` | Só ciclo **C** | UPSERT dual-write do ciclo faturado |
| Runtime validation / repair | **Não** | UPDATE failed→pending apenas |

### Fluxo × Respeita `generation_date`

| Fluxo | Respeita? |
|-------|-----------|
| Scheduler | **Sim** |
| `tryEnqueue` (PATCH, lifecycle, 22E manual) | **Sim** |
| Manual execução ciclo C (`ensureJobForManualGenerate`) | **Não** (ignora janela — execução síncrona imediata) |
| Worker batch automático | **Sim** (retry_at, scheduled_at, janela) |

### Fluxo × Próximo botão Gerar (card/calendário)

| Fluxo | Gerar imediato no card? |
|-------|-------------------------|
| Manual + C+1 row criada (dentro janela) | **Sim** |
| Manual + sem C+1 row | **Não** (projeção; FAB pode falhar) |
| Scheduler materializa depois | **Sim** após GET |
| projection-only certificado | **Não** |

### Componente × Necessita `cycleId`

| Componente | Precisa `cycleId` para Gerar? |
|------------|-------------------------------|
| NextInvoiceCard | Sim |
| FinancialCalendarPopover | Sim |
| UpcomingPaymentsList | Sim |
| FinancialHistoryRow | Sim |
| SubscriptionActionsPanel FAB | Sim (via `resolveFirstEligibleCycle`) |
| ProjectedCompetenceNotice | N/A (informativo) |

### Scheduler vs Manual Generate vs PATCH `next_billing_date`

| Dimensão | Scheduler | Manual Generate | PATCH next_billing |
|----------|-----------|-----------------|---------------------|
| Dispara | Cron / loop 60s | POST síncrono | PATCH CRM |
| Escolhe competência | `next_billing_date` | **`cycle_id` explícito** | Operador define nova data |
| Cria invoice | Worker | Pipeline síncrono | Não |
| Avança subscription | Após worker | Após invoice | Sim (PATCH) |
| Materializa C+1 | Se janela OK | Pós-22E: idem via `tryEnqueue` | Se janela OK |
| Cancela jobs obsoletos | Worker mismatch | Não | Sim (pending) |

---

## Mapa — fluxos que criam `subscription_cycles`

| Origem | Função | INSERT/UPSERT |
|--------|--------|---------------|
| Scheduler / tryEnqueue | `subscriptionCyclesUpsertAfterScheduler` | Sim |
| Manual job ensure (ciclo C) | idem via `insertOrReactivateRenewalJob` | Sim |
| Worker processing | `subscriptionCyclesMarkProcessing`, etc. | UPDATE |
| Job completed | `subscriptionCyclesOnJobCompleted` | UPSERT invoiced/skipped |
| Job cancelled | `subscriptionCyclesOnJobCancelled` | UPDATE cancelled |
| Migration 141 | backfill SQL | INSERT histórico |
| Repair | `repairRecoverableSubscriptionCycles` | **UPDATE only** |
| Runtime validator GET | chama repair | **UPDATE only** |

**Não há** `createNextCycle` / `subscriptionCyclesEnsure` no codebase.

---

## Tabela comparativa — Legado × Aggregate × Operador

| Aspecto | Legado (pré-22B) | Aggregate atual (22B+) | Expectativa operador |
|---------|-------------------|------------------------|----------------------|
| Fonte próxima cobrança | `cycles_raw` + projeção | `resolveNextInvoiceFromAggregate` | Próximo mês “clicável” |
| Pós-manual sem C+1 | Projeção, sem Gerar no card | Idem (`isProjected=true`) | Gerar imediato |
| Calendário | projected sem ações | Idem | Gerar no dot |
| FAB Gerar próxima | Precisa cycle row | Idem | Sempre funcional |
| Backend pós-manual | Gap C+1 (22D) | Gap reduzido se janela OK (22E) | Sempre row C+1 |
| Docs oficiais | Lazy + projeção OK | Idem | Não documentado |

---

## Conflitos arquiteturais identificados

1. **Lazy materialization (4.2K)** vs **UX que exige `cycle_id` para toda ação de cobrança** (4.2D/4.2G).  
2. **22E paridade scheduler** vs **relato operador “sem esperar scheduler”** — paridade **≠** imediato universal.  
3. **Calendário mostra meses projected** vs **histórico/card ocultam Gerar** — intencional 4.2H, confunde operador.  
4. **`BILLING_FINAL_ROOT_CAUSE.md` RC #2** já recomendava enqueue obrigatório pós-`next_billing_date` — alinhado a 22E, não a bypass de janela.

---

## Classificação do comportamento atual (pós-22E)

| Classificação | Aplica a |
|---------------|----------|
| **Decisão de negócio / arquitetura documentada** | Lazy cycles; projeção UX; janela `generation_date` |
| **Bug (corrigido em 22E)** | Manual não chamava `tryEnqueue` nunca |
| **Limitação residual (não bug de refresh)** | Fora da janela, C+1 ausente — **mesmo** que scheduler |
| **Tensão UX (não bug Aggregate)** | Card/calendário ocultam Gerar em projection-only **de propósito** |

---

## Recomendação Sprint 5.0-23 (evidência-based)

Product deve **ratificar uma** regra oficial:

### Opção A — **Automação-first** (status quo documentado + 22E)

- Manual pós-sucesso: **`tryEnqueue` com janela** (já implementado).  
- UI: manter gates projected; melhorar copy operacional quando `post_manual_enqueue_next skipped reason=next_billing_after_db_today`.  
- Docs: atualizar 4.2D certificação com nota explícita sobre C+1 condicional.  
- **Prós:** paridade scheduler, sem duplicidade, invariantes 4.2K preservados.  
- **Contras:** operador ainda vê gap fora da janela.

### Opção B — **Operador-first** (mudança de regra de produto)

- Após manual bem-sucedido: materializar C+1 via **`insertOrReactivateRenewalJob` sem filtro `generation_date`** (função dedicada reutilizando dual-write — **não** SQL novo).  
- Worker automático continua respeitando janela no pickup (verificar interação).  
- **Prós:** card/calendário/histórico alinhados ao fluxo mental pós-Gerar.  
- **Contras:** quebra paridade estrita com scheduler; exige ADR + testes de janela worker.

### Opção C — **Híbrido UX-only** (sem mudar runtime)

- Runtime mantém Opção A.  
- UI passa a oferecer ação “Aguardando agendador” + link diagnóstico; **não** prometer Gerar no calendário projected.  
- **Prós:** zero risco billing engine.  
- **Contras:** não resolve desejo de Gerar imediato.

**Recomendação do auditor:** se o critério de aceite operacional for *“botão Gerar no card imediatamente após POST”*, a evidência aponta **Opção B** como única adequada. Se o critério for *“não cobrar antes da janela de automação”*, **Opção A** já reflete arquitetura certificada — faltava apenas comunicação UX (Opção C).

---

## Fontes citadas

| Evidência | Path |
|-----------|------|
| Lazy materialization | `docs/billing/BILLING_LIFECYCLE_FORENSIC.md`, `BILLING_CYCLE_GAP_ANALYSIS.md` |
| Manual determinístico | `docs/billing/BILLING_DETERMINISTIC_GENERATION.md`, `BILLING_CYCLE_GENERATION_CERTIFICATION.md` |
| PATCH / generation_date | `docs/CORRECAO_ALTERAR_PROXIMA_RENOVACAO_E_AGENDAMENTO.md` |
| UI gates | `docs/billing/GENERATE_BUTTON_INVESTIGATION_22B.md`, `NextInvoiceCard.tsx`, `FinancialCalendarPopover.tsx` |
| Projeção 4.2H | `src/lib/subscriptionFinancialProjection.ts`, `ProjectedCompetenceNotice.tsx` |
| Aggregate next | `src/lib/billingAggregate/nextInvoiceSnapshot.ts` |
| tryEnqueue callers | `recurringBillingJobService.ts`, `billingManualRenewalService.ts`, `customerInvoiceRecurrenceNextBillingService.ts` |
| Gap 22D / fix 22E | `docs/billing/SPRINT_5.0-22D_MANUAL_RENEWAL_SCHEDULER_ROOT_CAUSE.md` |
| Golden fixtures | `tests/billing/golden-dataset/scenarios.ts`, `BILLING_GOLDEN_DATASET.md` |
| Arquitetura 5.0 | `docs/billing/BILLING_ARCHITECTURE_SPECIFICATION.md` |

---

**Hash auditoria:** investigação READ ONLY em 2026-07-04; codebase inclui Sprint 22E (`tryEnqueue` pós-manual).
