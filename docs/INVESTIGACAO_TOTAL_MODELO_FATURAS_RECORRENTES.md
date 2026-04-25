# Investigação total — modelo de faturas recorrentes (PainelCRM)

**Data do levantamento:** 2026-04-24  
**Escopo:** mapeamento ponta a ponta do código existente (sem alteração de scheduler/worker/banco nesta fase).  
**Objetivo:** responder se o avanço de `subscriptions.next_billing_date` está correto, onde pode falhar, e se o sintoma observado é bug de backend, UX ou estado inconsistente.

---

## Resumo executivo

- **Fonte de verdade operacional do “próximo ciclo” a processar** é **`subscriptions.next_billing_date`**, alinhada ao **`billing_recurring_jobs.cycle_key`** (mesmo dia lógico YYYY-MM-DD após normalização).
- **O worker, ao concluir com sucesso** (incluindo ramos idempotentes que reutilizam fatura existente), chama **`advanceSubscriptionBillingCycle` → `updateSubscriptionAfterRenewal`**, que atualiza `next_billing_date`, `current_period_*`, `billing_cycle_count`, `billing_anchor_day` e `last_job_at`.
- **Base do próximo ciclo no worker** é **`resolveWorkerJobCycleStartYmd`**: prioriza **`job.cycle_key`**, não `CURRENT_DATE`, não `invoice.due_date`. O próximo vencimento é calculado com **`nextSubscriptionBillingAfterCycle`** = `calculateNextBillingDate(periodStart, interval, null)` (dia do próprio ciclo; **não** usa `billing_anchor_day` no avanço pós-job — evita desvio do dia escolhido manualmente vs âncora antiga).
- **`subscription_cycles`** (Etapa 1–3) é **espelho** do motor legado quando `subscription_cycles_write` está ativo; erros de dual-write **não** abortam o job. **Não** substitui o scheduler nem a fila de jobs como fonte operacional hoje.
- **Sintoma “gerou fatura mas `next_billing_date` parece igual”** pode ser:
  1. **UX/cache:** detalhe da fatura não refaz GET do insight automaticamente após o worker (só `[id, subscription_id, location.key]`); a lista pode estar desatualizada até novo fetch.
  2. **Confusão semântica:** antes, a UI misturava “próxima cobrança” global com dados da fatura; hoje o bloco separa **“Desta fatura”** vs **“Assinatura — próximo ciclo automático”** (`InvoiceRecurrenceBlock` + `this_invoice` no insight).
  3. **Estado inconsistente:** job **`completed`** para um `cycle_key` mas assinatura **não** avançou (crash entre criar fatura e `updateSubscriptionAfterRenewal`, ou intervenção manual) → scheduler/worker predizem **`skipped_completed_cycle` / `completed_cycle_guard`** e **não** reenfileiram → **`next_billing_date` pode ficar “preso”** no mesmo dia até correção operacional.
  4. **Janela local (Fase 2):** scheduler só enfileira se `next_billing_date <= CURRENT_DATE` **e** janela horária do tenant; worker pode **requeue** job fora da janela **sem** avançar assinatura até processar de facto o ciclo.

**Conclusão:** o desenho **pretende** avançar sempre após conclusão bem-sucedida do job nos caminhos normais e idempotentes. Desvios exigem análise de logs (`subscription_billing_cycle_advance`), estado do job e eventual inconsistência `completed` vs assinatura.

---

## Mapa técnico — ficheiros principais

| Área | Ficheiros |
|------|-----------|
| PATCH próxima renovação (CRM) | `customerInvoiceRecurrenceNextBillingService.ts`, `customerInvoicesController.ts` (`PATCH .../recurrence/next-billing`), `customerInvoicesRoutes.ts` |
| Scheduler | `runRecurringScheduler.ts` → `enqueueRenewalJobs` em `recurringBillingJobService.ts` |
| Worker | `runRecurringWorker.ts` (script) → `processNextBatch` em `recurringBillingJobService.ts` |
| Avanço assinatura | `advanceSubscriptionBillingCycle`, `mergeNextBillingAfterCompletedCycle`, `updateSubscriptionAfterRenewal` (`billingSubscriptionService.ts`) |
| Cálculo próxima data | `nextSubscriptionBillingAfterCycle`, `calculateNextBillingDate` (`subscriptionService.ts`) |
| Jobs — insert/guards | `insertOrReactivateRenewalJob`, `predictInsertOrReactivateRenewalJob`, `tryEnqueueRenewalJobForSubscriptionId`, `describeRenewalEnqueueWithDb` |
| Idempotência CRM | `findCustomerInvoiceBySubscriptionAndPeriod` (`customerInvoiceService.ts`) — `subscription_id` + `period_start` |
| Dual-write ciclos | `subscriptionCyclesDualWriteService.ts`, flags `subscriptionCyclesRead/WriteFlagService.ts` |
| Insight/UI | `customerInvoiceRecurrenceInsightService.ts`, `InvoiceRecurrenceBlock.tsx`, tipos em `src/services/customerInvoices.ts` |
| UNIQUE jobs | `database/init/69_billing_recurring_jobs.sql` — `UNIQUE(subscription_id, cycle_key)` |

---

## 1) Fluxo — “Alterar próxima renovação”

### Onde na UI

- Botão no detalhe da fatura (fatura **paga**, `origin=subscription`): navega para `CustomerInvoiceNew` com `?flow=renewal` (ver `CustomerInvoiceDetail.tsx`).
- Formulário grava via **`PATCH /api/customer-invoices/:id/recurrence/next-billing`** com corpo `{ next_billing_date: "YYYY-MM-DD" }`.

### Backend

**Serviço:** `patchCustomerSubscriptionNextBillingFromPaidInvoice` (`customerInvoiceRecurrenceNextBillingService.ts`).

**Validações:** fatura existe, `origin=subscription`, `status=paid`, `subscription_id` presente; assinatura `type=customer`, `status=active`, mesmo `tenant_id`.

**Campos alterados na assinatura:**

```sql
UPDATE subscriptions
SET next_billing_date = $1::date,
    billing_anchor_day = EXTRACT(DAY FROM $1::date)::int,
    updated_at = now()
```

**Jobs pendentes:** todos os `billing_recurring_jobs` com `status='pending'` para essa assinatura passam a `cancelled` com outcome `CANCELLED_MANUAL_NEXT_BILLING_RESCHEDULE` (e, se existirem colunas de outcome, `completion_outcome` preenchido). Para cada linha cancelada chama-se **`subscriptionCyclesOnJobCancelled`** (dual-write, best-effort).

**`subscription_cycles`:** não há UPDATE direto da próxima data nos ciclos neste PATCH; apenas efeitos via cancelamento de job (ciclo pode ser marcado cancelado conforme regra do dual-write).

**Enfileiramento imediato:** após o UPDATE, **`tryEnqueueRenewalJobForSubscriptionId(sub.id)`**:
- Usa a mesma regra que o scheduler: `next_billing_date <= CURRENT_DATE` (SQL) + **janela local** do tenant (`buildBillingWindowDiagnostic`).
- Chama `insertOrReactivateRenewalJob` se elegível.
- Resposta JSON inclui **`enqueue_after_patch`** (`ok: true` com `inserted`/`reactivated`, ou `ok: false` com `reason` e opcionalmente `window_reason`).

**Fonte de verdade após salvar:** **`subscriptions.next_billing_date`** (e `billing_anchor_day` sincronizado com o dia dessa data). O job criado terá **`cycle_key`** = YMD normalizado dessa data.

---

## 2) Fluxo — scheduler (`enqueueRenewalJobs`)

### Seleção de assinaturas

Query (simplificado):

```sql
SELECT s.id, s.tenant_id, s.next_billing_date, ...
FROM subscriptions s
JOIN tenants t ...
WHERE s.status = 'active' AND s.next_billing_date <= CURRENT_DATE
ORDER BY s.next_billing_date
LIMIT 500
```

- **`CURRENT_DATE`** é o do **servidor PostgreSQL** (não o “hoje local” do tenant para esta condição).
- Para cada linha, calcula-se **`cycle_key`** = `normalizeBillingCycleKeyYmd(next_billing_date)` (YYYY-MM-DD canónico).

### Janela local (Fase 2)

- `buildBillingWindowDiagnostic`: se **fora** da janela (`future_local_date`, `too_early_local_time`, etc.), o scheduler **não** chama `insertOrReactivateRenewalJob` (conta como `skipped`).

### Criação / reativação de job — `insertOrReactivateRenewalJob`

- **`cycle_key`** persistido = **`cycleKeyCanonical`** derivado de **`subscriptions.next_billing_date`** (não da fatura).
- **Guardas:**
  - **`skipped_active_exists`:** já existe job `pending`/`processing` para o mesmo ciclo lógico (`BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE`).
  - **`skipped_completed_cycle`:** existe job para esse ciclo com `status='completed'` → **não** insere nem reativa.
  - **`reactivated`:** existe linha `cancelled` ou `failed` para o ciclo → volta a `pending`.
  - **`inserted`:** novo UUID, `scheduled_at` derivado da data do ciclo.

### Respostas diretas (secção investigação)

| Pergunta | Resposta |
|----------|----------|
| Job é criado para qual data? | Para o **`next_billing_date`** atual da assinatura (normalizado), enquanto `<= CURRENT_DATE` e dentro da janela local. |
| `cycle_key` = `next_billing_date`? | Sim, após normalização para YYYY-MM-DD (compatível com legado ISO truncado). |
| Base assinatura ou fatura? | **Assinatura** (e tenant para janela). |
| Quando não cria job? | Assinatura inativa; `next_billing_date > CURRENT_DATE`; fora da janela local; `skipped_active_exists`; **`skipped_completed_cycle`**. |

---

## 3) Fluxo — worker (`processNextBatch`)

### Ordem típica (caminho feliz CRM)

1. Lock job: `pending` → `processing`.
2. `subscriptionCyclesMarkProcessing` (dual-write, se flag).
3. Carrega assinatura; **mismatch** `job.cycle_key` vs `subscription.next_billing_date` normalizado → **cancela** job (`CANCELLED_JOB_CYCLE_MISMATCH`) e pode tentar reenfileirar novo job conforme `describeRenewalEnqueueWithDb`.
4. Validações: ativa; `next_billing_date <= dbToday` (CURRENT_DATE); `cancel_at_period_end` etc.
5. **`periodStartYmd = resolveWorkerJobCycleStartYmd(job, subscription)`** → base **`job.cycle_key`**.
6. **CRM com fatura já existente** (`findCustomerInvoiceBySubscriptionAndPeriod(subscription_id, periodStartYmd)`):
   - Calcula `periodEnd = nextSubscriptionBillingAfterCycle(periodStartYmd, interval)`.
   - **`advanceSubscriptionBillingCycle`** (com merge anti-regressão).
   - **`completeBillingRecurringJob`** (job `completed` + dual-write `subscriptionCyclesOnJobCompleted`).
7. **CRM novo:** `processOneCustomerRenewalJob` — cria invoice com `period_start`/`due_date` alinhados ao ciclo; no fim **avança** + **completa** (ou ramo sem itens elegíveis: ainda assim **avança** + outcome `COMPLETED_NO_INVOICE_NO_ELIGIBLE_ITEMS`).

### SaaS

- Espelho: `processOneRenewalJob` / idempotente com `findInvoiceBySubscriptionAndPeriod`; **avanço** antes de `completeBillingRecurringJob` nos caminhos analisados.

### Funções de avanço

| Função | Papel |
|--------|--------|
| `nextSubscriptionBillingAfterCycle` | `calculateNextBillingDate(cycleYmd, interval, null)` — próximo mês/trimestre/ano mantendo regra de fim de mês no **dia do ciclo**. |
| `mergeNextBillingAfterCompletedCycle` | Se `subscription.next_billing_date` já está **à frente** do ciclo processado, `finalNext = max(computedNext, current)` para **não regredir** (ex.: reagendamento manual futuro). |
| `advanceSubscriptionBillingCycle` | Valida `finalNext > periodStart`; log; chama `updateSubscriptionAfterRenewal`. |
| `updateSubscriptionAfterRenewal` | Persiste `next_billing_date`, `current_period_start`, `current_period_end`, `billing_cycle_count`, **`billing_anchor_day = EXTRACT(DAY FROM next_billing_date)`**, `last_job_at`. |

### Caminhos **sem** avanço de assinatura (esperado)

- Job **cancelado** (vários outcomes).
- Job em **retry** (`retry_at` futuro) — permanece `pending`, assinatura intocada.
- **Requeue por janela** (`requeueBillingRecurringJobForWindow`): job volta `pending` com `retry_at`; **não** há avanço até o ciclo ser concluído.
- **Erro** no `try` do job: incremento de `attempts`, possível `failed` final — sem `advanceSubscriptionBillingCycle` se a exceção ocorrer **antes** do avanço.

### Idempotência

- Se já existe `customer_invoices` para `(subscription_id, period_start)` (e pai, se E2): entra no ramo **idempotente**, **chama `advanceSubscriptionBillingCycle`** e depois `completeBillingRecurringJob`. **Não** fica propositalmente sem avançar por só reutilizar a fatura.

---

## 4) `subscription_cycles`

### Papel hoje

- **Leitura** (flag `subscription_cycles_read`): insight na fatura, reconciliação (Etapa 4 script).
- **Escrita** (flag `subscription_cycles_write`): hooks em scheduler (`subscriptionCyclesUpsertAfterScheduler`), worker (processing, complete, cancel, fail), cancelamento pós-PATCH.
- **Não** decide se um job deve correr nem altera `subscriptions.next_billing_date` por si; **espelha** o job/fatura quando o write está ligado.

### Estados (resumo)

- **pending / queued / processing / invoiced / skipped / failed / cancelled** — conforme transições documentadas em `SUBSCRIPTION_CYCLES_PHASE3.md` e implementação em `subscriptionCyclesDualWriteService.ts`.

### `period_start` / `period_end` nas linhas (dual-write)

- `loadPeriodBounds`: para **`type=customer`** usa `calculateNextBillingDate(..., null)` para `period_end`; para **SaaS** ainda usa `billing_anchor_day` no **espelho** do ciclo — isto afeta **só** a linha em `subscription_cycles`, **não** o cálculo de avanço da assinatura no worker (que usa `null` âncora no `nextSubscriptionBillingAfterCycle`).

### Ciclo futuro pendente

- Após conclusão bem-sucedida, **`next_billing_date`** na assinatura passa a ser a **próxima** data; o scheduler criará job quando essa data for `<= CURRENT_DATE` (e janela OK). Pode existir linha **`pending`** em `subscription_cycles` para o próximo `next_billing` quando o scheduler corre — depende de dual-write e timing.

---

## 5) Idempotência e unicidade

| Entidade | Chave lógica |
|----------|----------------|
| `billing_recurring_jobs` | `UNIQUE(subscription_id, cycle_key)` |
| `customer_invoices` (idempotência worker) | `subscription_id` + **`period_start`** (+ `parent_invoice_id IS NULL` quando colunas E2 existem) |
| `subscription_cycles` | `UNIQUE(subscription_id, cycle_date)` |

**`skipped_completed_cycle`:** impede novo job se já há job **completed** para aquele ciclo. Se a assinatura **não** foi avançada após esse completed (anomalia), o sistema **não** reprocessa automaticamente esse dia — risco de **“preso”** em `next_billing_date` igual ao ciclo já completed.

**Conclusão idempotência:** o ramo `completed_idempotent_existing_customer_invoice` **avança** a assinatura; não é, por desenho, “concluir sem avançar”.

---

## 6) UI / insight

### API `GET /api/customer-invoices/:id/recurrence-insight`

- `customerInvoiceRecurrenceInsightService.ts` monta `subscription`, `latest_job`, `renewal_enqueue_status`, opcionalmente `subscription_cycles_insight`.
- **`this_invoice`:** snapshot `{ period_start, period_end, due_date }` **da fatura** — estável quando se altera a assinatura.
- **`next_charge_date`:** espelho de `subscription.next_billing_date` (global).
- Bloco na UI (**`InvoiceRecurrenceBlock`**) separa **“Desta fatura”** vs **“Assinatura — próximo ciclo automático”**.

### Refetch

- Em `CustomerInvoiceDetail.tsx`, o insight é carregado em `useEffect` com dependências **`[id, invoice?.subscription_id, location.key]`**.
- **Não** há polling nem invalidação automática quando o worker atualiza a assinatura **enquanto o utilizador mantém a mesma rota sem mudar `location.key`**. Para ver `next_billing_date` atualizado, é necessário **recarregar a página**, navegar, ou outro gatilho que altere o efeito.

### Lista agrupada (`CustomerInvoices.tsx`)

- Coluna **“Próxima cobrança da assinatura”** usa `subscription_next_billing_date` do JOIN na listagem — é **global** à assinatura, não por fatura.

---

## Regras atuais (síntese)

| Tema | Regra atual |
|------|-------------|
| Quem dispara o ciclo? | `subscriptions.next_billing_date` + scheduler + janela local. |
| O que identifica o ciclo no job? | `billing_recurring_jobs.cycle_key` (YMD). |
| Base do avanço após sucesso? | **`job.cycle_key`** (periodStart) + intervalo → **`nextSubscriptionBillingAfterCycle`**. |
| `billing_anchor_day` no avanço pós-job? | **Não** no worker CRM/SaaS para `next_billing_date` (âncora `null`); **sim** na atualização final como **EXTRACT(DAY FROM novo next_billing_date)**. |
| `due_date` da nova fatura? | No CRM costuma ser `periodStart` do ciclo; **não** substitui `cycle_key` no cálculo do próximo ciclo no worker. |
| `subscription_cycles` influencia motor? | **Não** como decisão; apenas espelho / leitura. |

---

## Bugs / riscos identificados (causa raiz potencial)

1. **Inconsistência `completed` + `next_billing_date` antigo:** se o job ficou `completed` mas o UPDATE da assinatura falhou ou foi revertido, o guard **`skipped_completed_cycle`** impede novo job — **requer intervenção** (operacional ou correção de dados).
2. **UX “parece não avançar”:** utilizador na mesma página sem refetch do insight; ou confundir vencimento da fatura com próxima data global (mitigado pela separação recente na UI).
3. **`mergeNextBillingAfterCompletedCycle`:** se `next_billing_date` já estiver **manualmente** numa data **posterior** ao `computedNext`, o resultado mantém/adota o máximo — comportamento **intencional** anti-regressão; pode parecer “não avançou um mês” se a data manual já estava longe.
4. **Dual-write SaaS `period_end` em `subscription_cycles`:** ainda usa `billing_anchor_day` só no **espelho**; pode divergir visualmente do `period_end` na invoice CRM — não bloqueia avanço, mas pode confundir em auditoria.

*Nenhuma destas conclusões implica alteração de código neste documento; são hipóteses testáveis com logs e SQL.*

---

## Roteiro de testes (reprodução)

### Teste A — fluxo normal

1. Criar recorrência mensal com `next_billing_date` futuro.
2. PATCH próxima renovação para **hoje** (ou data `<= CURRENT_DATE`) dentro da janela local; confirmar `enqueue_after_patch.ok` quando aplicável.
3. Correr scheduler + worker.
4. Verificar: nova `customer_invoice` (ou idempotente); `subscriptions.next_billing_date` = **mês seguinte** ao ciclo processado (mesmo dia lógico, regra fim de mês); job `completed`; se write ativo, ciclo `invoiced` com `invoice_id`.

### Teste B — ciclo já faturado

1. Garantir invoice existente para `period_start = ciclo`.
2. Worker deve entrar em idempotente: **mesma invoice**, **avanço** de assinatura, job `completed_idempotent_*`.
3. Confirmar ausência de segunda invoice para o mesmo `period_start`.

### Teste C — fatura antiga + alteração global

1. Abrir fatura antiga; anotar `this_invoice` (período/vencimento).
2. PATCH próxima renovação a partir de **outra** fatura paga ou mesmo fluxo.
3. Recarregar insight na fatura antiga: **“Desta fatura”** inalterado; bloco **assinatura** com novo `next_billing_date`.

### Teste D — backoff / retry

1. Forçar falha transiente no worker (ou inspecionar job com `retry_at` futuro).
2. Confirmar: scheduler não duplica `pending` para o mesmo ciclo se guarda ativa; worker só processa após `retry_at`; insight/UI mostram job pendente/falha conforme `latest_job`.

---

## Perguntas obrigatórias — respostas

1. **Ao gerar invoice recorrente, `next_billing_date` avança sempre?**  
   **Nos caminhos de conclusão bem-sucedida** (nova fatura, idempotente, SaaS análogo, e “sem itens elegíveis” CRM) **sim**, antes de `completeBillingRecurringJob`. **Não** avança em cancelamentos, requeue só de janela sem conclusão, ou exceção antes do avanço.

2. **Se não avança, onde?**  
   Falha antes de `advanceSubscriptionBillingCycle`; job cancelado; inconsistência `completed` sem UPDATE na assinatura; ou interpretação errada na UI sem refetch.

3. **Idempotente com invoice existente também avança?**  
   **Sim** — `advanceSubscriptionBillingCycle` é chamado antes de `completeBillingRecurringJob`.

4. **`billing_anchor_day` ainda influencia indevidamente o avanço?**  
   **Não** no cálculo **`nextSubscriptionBillingAfterCycle`** (âncora nula). Influencia **só** espelho SaaS em `subscription_cycles.period_end` e o valor **gravado** na assinatura após renovação (dia do **novo** `next_billing_date`).

5. **`due_date` influencia indevidamente o próximo ciclo no worker?**  
   **Não** em `resolveWorkerJobCycleStartYmd` / avanço; pode divergir do `next_billing_date` global (hint no insight compara due vs next).

6. **`subscription_cycles` só espelha ou afeta lógica?**  
   **Espelho** (e leitura para UI/reconciliação); **não** substitui decisões do scheduler/worker.

7. **UI “desta fatura” vs global?**  
   Com `this_invoice` + blocos separados, **sim**; lista agrupada mostra próxima da assinatura explicitamente.

8. **Regra final recomendada para ciclos?**  
   Manter **`subscriptions.next_billing_date` + jobs** como motor até cutover formal; **`subscription_cycles`** como fonte de verdade **operacional** só após processo de reconciliação zero-divergências e desenho de cutover (ver `SUBSCRIPTION_CYCLES_PHASE4.md`).

9. **Modelo atual suficiente vs cutover para `subscription_cycles`?**  
   **Suficiente** para operação atual se integridade job/assinatura for mantida e observabilidade (logs/SQL) existir. **Cutover** para ciclos como fonte de fila é evolução arquitetural **separada**, com risco e fase de validação.

---

## Plano de correção em fases (se necessário — após evidência)

1. **Fase 0 — Observabilidade:** dashboard ou query padronizada: assinaturas com `next_billing_date` = X e job `completed` para o mesmo `cycle_key` sem segunda fatura esperada — detetar inconsistência.
2. **Fase 1 — UX:** garantir refetch do insight após ações que alteram assinatura (invalidação explícita ou `location.key`); documentar para operadores.
3. **Fase 2 — Recuperação automática (opcional):** se `skipped_completed_cycle` e `next_billing` ainda igual ao ciclo completed, job de reparação ou alerta ( **não** implementado nesta investigação).
4. **Fase 3 — Cutover futuro:** alinhar com roadmap `subscription_cycles` como fonte operacional após Etapa 4 estável.

---

## Referências internas

- `docs/SUBSCRIPTION_CYCLES_PHASE1.md` … `PHASE4.md`
- `docs/PLANO_DEFINITIVO_FATURAS_RECORRENTES_COM_CICLOS.md`
- `docs/CORRECAO_AVANCO_RECORRENCIA_E_ACCORDION_LISTAGEM.md` (contexto histórico UI/lista)

---

*Fim do relatório de investigação. Nenhuma alteração de código de produção foi feita como parte deste artefacto.*
