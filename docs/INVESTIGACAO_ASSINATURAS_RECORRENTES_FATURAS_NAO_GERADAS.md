# Investigação completa — Assinaturas / faturas recorrentes não geradas

**Data:** 2026-05-19  
**Escopo:** Motor CRM `type=customer` + tabela `subscription_cycles` (dual-write).  
**Restrição:** Documento de investigação — **sem correção massiva** nem mudança de regra de produção até fechar causa raiz no ambiente afetado.

**Documentos relacionados (já existentes):**

- [INVESTIGACAO_JOB_RECORRENCIA_NAO_PROCESSADO.md](./INVESTIGACAO_JOB_RECORRENCIA_NAO_PROCESSADO.md)
- [INVESTIGACAO_TOTAL_MODELO_FATURAS_RECORRENTES.md](./INVESTIGACAO_TOTAL_MODELO_FATURAS_RECORRENTES.md)
- [SUBSCRIPTION_CYCLES_PHASE1.md](./SUBSCRIPTION_CYCLES_PHASE1.md) … PHASE4
- [PLANO_DEFINITIVO_FATURAS_RECORRENTES_COM_CICLOS.md](./PLANO_DEFINITIVO_FATURAS_RECORRENTES_COM_CICLOS.md)

---

## 1. Resumo executivo (hipóteses ordenadas)

O sintoma **“ciclo `pending`, `invoice_id` null, cobrança órfã”** no histórico da assinatura **não implica, por si só, falha de criação de fatura**. O sistema foi desenhado para mostrar ciclos **antes** da fatura existir.

| # | Hipótese | Probabilidade | Evidência no código |
|---|----------|---------------|---------------------|
| 1 | **Estado intermediário normal** — scheduler/backfill criou ciclo `pending`/`queued`; worker ainda não processou ou está à espera de horário local | Alta | Backfill 141, `subscriptionCyclesUpsertAfterScheduler`, janela Fase 2 |
| 2 | **Cron worker/scheduler ausente ou espaçado** — scripts são **one-shot** (1 batch e saem) | Alta | `runRecurringWorker.ts`, `runRecurringScheduler.ts` |
| 3 | **Janela horária** — antes de `recurring_generate_time_local` (ex. 09:00 America/Sao_Paulo) o job fica `pending` com `retry_at` +15 min | Alta | `requeueBillingRecurringJobForWindow`, `WINDOW_REQUEUE_MINUTES=15` |
| 4 | **Job concluiu sem fatura** — itens recorrentes não elegíveis no ciclo (`completed_no_invoice_no_eligible_items`) mas assinatura **avança** | Média | `processOneCustomerRenewalJob` L1912–1983 |
| 5 | **Erro na criação** — exceção em `createCustomerInvoice` / itens / `current_period_start` ausente; job em retry ou `failed` | Média | `catch` em `processNextBatch` |
| 6 | **CPF/cliente gateway** — fatura **local criada**, cobrança gateway falha (erro **engolido** no `catch` do gateway) | Média | L2109–2112 — job **completa** com invoice |
| 7 | **Desalinhamento PG `CURRENT_DATE` vs fuso tenant** — scheduler SQL usa `CURRENT_DATE` do servidor; worker usa `Intl` no TZ do tenant | Média | `enqueueRenewalJobs` vs `buildBillingWindowDiagnostic` |
| 8 | **Dual-write `subscription_cycles` falhou silenciosamente** — job/fatura OK, ciclo UI desatualizado | Baixa | `subscriptionCyclesDualWriteService` engole erros |
| 9 | **Race “ciclo criado, invoice falhou”** — **não há transação única**; possível invoice órfã ou ciclo `processing` até retry | Baixa–média | `pool.query` avulso, sem `BEGIN` no fluxo |

**Caso exemplo (previsão 19/05/2026, vencimento 24/05/2026):** com **5 dias de antecipação**, a data de geração civil é **19/05**. No dia 19, após **09:00** no fuso da empresa, o worker deve criar `customer_invoice`. Antes disso, ver **“pending”** no histórico é **esperado** se `subscription_cycles_read` estiver ativo.

---

## 2. Mapa do fluxo completo (arquivos e sequência)

### 2.1 Entrada manual (primeira fatura + assinatura)

| Etapa | Arquivo | Função |
|-------|---------|--------|
| UI / API | `customerInvoicesController`, `customerBillingService.ts` | `createRecurringManualInvoice` |
| Assinatura | `billingSubscriptionService.ts` | cria `subscriptions` (`type=customer`, `next_billing_date`, períodos) |
| 1ª fatura | `createManualCustomerInvoice` / `createCustomerInvoice` | `customerInvoiceService.ts` |

### 2.2 Scheduler (enfileirar renovação)

| Etapa | Arquivo | Função |
|-------|---------|--------|
| Script cron | `scripts/runRecurringScheduler.ts` | `enqueueRenewalJobs()` **uma vez** |
| Motor | `recurringBillingJobService.ts` | `enqueueRenewalJobs` |
| Filtro SQL | idem | `(next_billing_date - recurring_invoice_generate_days_before_due) <= CURRENT_DATE` |
| Janela local | `billingTimeWindowObservability.ts` | `buildBillingWindowDiagnostic` |
| Job | idem | `insertOrReactivateRenewalJob` → `billing_recurring_jobs` (`status=pending`) |
| Ciclo (espelho) | `subscriptionCyclesDualWriteService.ts` | `subscriptionCyclesUpsertAfterScheduler` → `queued` ou `pending` |

**`cycle_key`** = `subscriptions.next_billing_date` (YYYY-MM-DD) = **vencimento do ciclo** = `due_date` da fatura gerada.

### 2.3 Worker (processar fila)

| Etapa | Arquivo | Função |
|-------|---------|--------|
| Script cron | `scripts/runRecurringWorker.ts` | `processNextBatch` + `processChildItemDueInvoices` **uma vez** |
| Lock | `recurringBillingJobService.ts` | `FOR UPDATE SKIP LOCKED`, `status=processing` |
| Recuperação | idem | `reclaimStaleBillingProcessingJobs` (default 20 min) |
| Janela | idem | revalida `buildBillingWindowDiagnostic`; se cedo → `requeue` +15 min |
| CRM | idem | `processOneCustomerRenewalJob` |
| Fatura | `customerInvoiceService.ts` | `createCustomerInvoice` |
| Itens | SQL direto em `recurringBillingJobService` | `INSERT customer_invoice_items` |
| Gateway | `getActiveGateway`, `createCharge` | try/catch — **não falha o job** |
| Avanço ciclo | idem | `advanceSubscriptionAfterCompletedCycle` → `next_billing_date` |
| Job done | idem | `completeBillingRecurringJob` |
| Ciclo (espelho) | `subscriptionCyclesDualWriteService.ts` | `subscriptionCyclesOnJobCompleted` → `invoiced` + `invoice_id` |

### 2.4 Leitura UI

| Etapa | Arquivo | Função |
|-------|---------|--------|
| Detalhe assinatura | `crmSubscriptionsService.ts` | `buildTimeline` + `listSubscriptionCycles` |
| Status PT | `cycleStatusLabelPt` | **não traduz `pending`** → UI mostra literal `"pending"` |
| Insight recorrência | `customerInvoiceRecurrenceInsightService.ts` | opcional `subscription_cycles_insight` |

---

## 3. Job / cron (Investigação 2)

| Processo | Comando npm | Frequência recomendada | Timezone |
|----------|-------------|------------------------|----------|
| Scheduler | `npm run billing:scheduler` | 10–15 min | `CURRENT_DATE` = sessão PostgreSQL |
| Worker | `npm run billing:worker` | 1–2 min | `now()` + janela **tenant.timezone** |
| Reconciliação ciclos | `billing:subscription-cycles-reconcile` | manual / super admin | — |

**Validar em produção:**

```bash
# Logs esperados (stdout do container/processo cron)
grep '\[BILLING\]' 
grep '\[SUBSCRIPTION_'   # novos logs de investigação
```

**Perguntas operacionais:**

1. Cron **executou** hoje? (scheduler + worker)
2. Executou mas **ignorou**? (`enqueue_done` com `skipped` alto, `time_window_scheduler_skip`)
3. Executou e **falhou**? (`job_error`, `job_failed_final`, `[SUBSCRIPTION_INVOICE_FAILED]`)
4. Exceções **engolidas**? dual-write (`subscription_cycles_dual_write_error`)

---

## 4. Timezone (Investigação 3)

### Duas camadas de tempo

1. **Scheduler (SQL):** `(next_billing_date - N dias) <= CURRENT_DATE` — depende do **fuso do servidor Postgres**, não do tenant.
2. **Worker/Scheduler (Fase 2):** `buildBillingWindowDiagnostic` usa `Intl.DateTimeFormat` com `tenants.timezone` (fallback `America/Sao_Paulo` via `resolveTenantBillingPreferences`).

### Regra do horário “Após 09:00”

- Só no **mesmo dia civil** que `generation_date_ymd` (= vencimento − N dias).
- Se `local_now_hhmm < recurring_generate_time_local` → `too_early_local_time` → job **requeue** 15 min.
- Se `next_billing_date` (como data) **já passou** no calendário local (`nextBillingDate < local_now_ymd`), **não** exige hora mínima — elegível o dia inteiro.

### `scheduled_at`

Insert: `($cycle_key::date)::timestamptz` — conversão **date→timestamptz** usa timezone da **sessão PostgreSQL**. Pode atrasar/adiantar pickup do worker vs meia-noite local.

**Diagnóstico sem alterar código:**

```typescript
// API interna já exposta:
describeRenewalEnqueueForSubscriptionId(subscriptionId)
// → db_eligible, window_eligible, window_diagnostic, active_blocking_jobs
```

---

## 5. Status `pending` com `invoice_id` null (Investigação 4)

### Quando o ciclo nasce sem fatura (normal)

| Momento | `subscription_cycles.status` | `invoice_id` | `billing_recurring_jobs` |
|---------|------------------------------|--------------|---------------------------|
| Backfill migração 141 | `pending` | null | pode não existir |
| Scheduler enfileirou | `queued` | null | `pending` |
| Worker lock | `processing` | null | `processing` |
| Worker requeue janela | `queued` | null | `pending` + `retry_at` futuro |

### Quando o job termina sem fatura (atenção)

- Outcome `completed_no_invoice_no_eligible_items`: ciclo → **`skipped`**, assinatura **avança** `next_billing_date`.
- UI com ciclos: status **“Ignorado”**, não “pending” — se ainda mostra `pending`, o worker **não concluiu** ou leitura desatualizada.

### Transações (Investigação 7)

**Não existe** `BEGIN … COMMIT` envolvendo job + invoice + gateway:

```
processing (job + cycle dual-write)
  → createCustomerInvoice (commit imediato)
  → INSERT items (commits)
  → gateway (opcional, erro logado)
  → advanceSubscriptionAfterCompletedCycle
  → completeBillingRecurringJob
```

**Riscos:**

- Invoice criada, falha antes de `completeBillingRecurringJob` → retry pode ser **idempotente** (`findCustomerInvoiceBySubscriptionAndPeriod`).
- Gateway falha → **fatura local existe**, sem `gateway_reference_id` — job **completa** mesmo assim.

---

## 6. Validação de cliente / CPF (Investigação 5)

Em `processOneCustomerRenewalJob`:

- Lê `clients.cpf_cnpj`.
- `ensureCustomerForClient` se não há `payment_customers`.
- Retry com novo `idempotencyKey` se `isAsaasInvalidCustomerError`.
- **Falha no gateway não reverte** a `customer_invoice`.

**Cenário histórico (CPF corrigido depois):** job em `failed` ou `pending` com `error_message` antigo — precisa **novo ciclo** ou reativação do job (`insertOrReactivateRenewalJob` em jobs `failed`/`cancelled`).

---

## 7. Webhooks e gateway (Investigação 6)

Ordem **customer renewal:**

1. Fatura local (`createCustomerInvoice`, `status=pending`, `payment_token` gerado).
2. Itens copiados da fatura anterior recorrente.
3. `createCharge` no gateway (se `customerId` disponível).
4. `updateCustomerInvoiceGatewayData` se charge OK.

Webhooks Asaas **não** são pré-requisito para criar a fatura local.

---

## 8. Logs e observabilidade (Investigação 8)

### Existentes (manter)

- `[BILLING]` via `billingLog()` — scheduler, worker, job, invoice.
- `notify: true` em `notifyBillingJobFailed` e alert opcional `BILLING_ALERT_ON_NO_INVOICE_CYCLE`.

### Novos (investigação — `subscriptionBillingLog`)

| Tag | Quando |
|-----|--------|
| `[SUBSCRIPTION_PENDING_CREATED]` | Scheduler insere job |
| `[SUBSCRIPTION_ELIGIBLE]` | Worker requeue fora da janela local |
| `[SUBSCRIPTION_PROCESSING]` | Worker apanha job |
| `[SUBSCRIPTION_INVOICE_CREATED]` | `createCustomerInvoice` OK |
| `[SUBSCRIPTION_INVOICE_FAILED]` | Erro no job ou ciclo sem itens elegíveis |
| `[SUBSCRIPTION_GATEWAY_FAILED]` | Charge falhou (fatura já existe) |
| `[SUBSCRIPTION_BILLING]` | Marco genérico (ex. início create) |

Campos: `tenant_id`, `subscription_id`, `customer_id`, `invoice_id`, `job_id`, `cycle_key`, `gateway`, `execution_at`, `error`.

**Env úteis:** `BILLING_SCHEDULER_VERBOSE=true`, `BILLING_TIME_WINDOW_VERBOSE=true`, `BILLING_ALERT_ON_NO_INVOICE_CYCLE=true`.

---

## 9. Queries — dados órfãos (Investigação 9)

Substituir `<subscription_id>` / rodar agregados.

```sql
-- Job vs ciclo vs fatura (últimos 5 jobs)
SELECT j.id, j.status, j.cycle_key, j.retry_at, j.error_message,
       j.completion_outcome, j.result_invoice_id,
       sc.status AS cycle_status, sc.invoice_id AS cycle_invoice_id,
       sc.error_message AS cycle_error
FROM billing_recurring_jobs j
LEFT JOIN subscription_cycles sc
  ON sc.subscription_id = j.subscription_id
 AND sc.cycle_date::text = left(trim(j.cycle_key), 10)
WHERE j.subscription_id = '<subscription_id>'
ORDER BY j.updated_at DESC
LIMIT 5;

-- Ciclos pending/queued sem invoice e sem job ativo
SELECT sc.*
FROM subscription_cycles sc
WHERE sc.subscription_id = '<subscription_id>'
  AND sc.status IN ('pending', 'queued', 'processing')
  AND sc.invoice_id IS NULL;

-- Faturas do período sem ciclo invoiced
SELECT ci.id, ci.period_start, ci.due_date, ci.status, ci.gateway_reference_id
FROM customer_invoices ci
WHERE ci.subscription_id = '<subscription_id>'
ORDER BY ci.period_start DESC
LIMIT 10;

-- Contagem global (produção)
SELECT sc.status, COUNT(*) 
FROM subscription_cycles sc
WHERE sc.invoice_id IS NULL
GROUP BY 1;

SELECT j.status, j.completion_outcome, COUNT(*)
FROM billing_recurring_jobs j
WHERE j.result_invoice_id IS NULL
  AND j.status IN ('pending', 'processing', 'failed')
GROUP BY 1, 2;
```

**Script read-only:** `npm run billing:subscription-cycles-reconcile` → relatório `queued_cycle_without_active_job`, etc.

---

## 10. Recuperação segura (Investigação 10) — só plano, não implementar

Critérios futuros:

- Idempotência: `findCustomerInvoiceBySubscriptionAndPeriod` antes de criar.
- Não duplicar charge: mesma `idempotencyKey` ou verificar `gateway_reference_id`.
- Reprocessar apenas jobs `failed` / ciclos `pending` com job `failed` reativável via scheduler (`insertOrReactivateRenewalJob`).
- **Nunca** criar segunda fatura se `completed` com `result_invoice_id` já existe.

---

## 11. Notificações (Investigação 11)

| Evento | Notifica hoje? |
|--------|----------------|
| Fatura criada (manual/worker) | `notifyInvoiceCreated` em `createCustomerInvoice` |
| Job falha definitivamente | `notifyBillingJobFailed` → log com `notify: true` (sem e-mail tenant garantido) |
| Ciclo sem fatura elegível | Log `operational_alert` se `BILLING_ALERT_ON_NO_INVOICE_CYCLE=true` |
| Gateway falhou | Apenas log / `console.error` |

**Lacuna:** admin tenant pode **não** ser avisado quando ciclo fica `pending` dias a fio — só logs.

---

## 12. Causa raiz, riscos e plano incremental (Investigação 12)

### 12.1 Causa raiz (fechar no ambiente)

**Não há uma única causa no código** — o sintoma combina:

1. **Modelo de dados** que expõe ciclos **antes** da fatura (`pending`/`queued` é legível na UI).
2. **Processamento assíncrono** dependente de **dois crons** one-shot.
3. **Regras temporais** (antecipação + horário local) que mantêm jobs em `pending` com `retry_at`.

**Para o caso em produção**, executar na ordem:

1. Query jobs + cycles (secção 9).
2. `describeRenewalEnqueueForSubscriptionId` ou insight na UI.
3. Logs `[SUBSCRIPTION_*]` e `[BILLING]` na janela do vencimento 19/05 09:00–12:00.
4. Confirmar cron worker 1–2 min e scheduler 10–15 min.

### 12.2 Pontos inseguros

- Sem transação global job+invoice.
- Gateway erro silencioso pós-fatura.
- `CURRENT_DATE` PG vs TZ tenant.
- Dual-write falha silenciosa.
- `completed_no_invoice` avança assinatura sem fatura.
- UI label `pending` cru.

### 12.3 Impacto produção

- Clientes podem ver “cobrança pendente” sem link de pagamento **até** o worker passar — ou **indefinidamente** se cron parado.
- Risco de **não** duplicar fatura se reprocessar corretamente (idempotência existe).
- Risco de **duplicar** cobrança gateway se forçar charge manual sem checar `idempotency_key`.

### 12.4 Proposta segura de correção (fases — após confirmar causa)

| Fase | Ação | Risco |
|------|------|-------|
| A | Garantir cron scheduler+worker + alertas se `pending` > 24h | Baixo |
| B | Traduzir `pending` na UI; distinguir “Aguardando geração” vs “Falhou” | Baixo |
| C | Notificar tenant se `job_failed_final` ou `pending` stale | Médio |
| D | Transação ou saga: invoice só marca ciclo `invoiced` após commit explícito | Médio |
| E | Alinhar `CURRENT_DATE` scheduler ao TZ tenant (SQL com `AT TIME ZONE`) | Médio |
| F | Job recovery admin (reativar failed, sem duplicar) | Médio |

### 12.5 Recovery job (futuro)

- Entrada: ciclos `pending`/`queued` + job `failed` ou `pending` com `retry_at` passado.
- Ação: `tryEnqueueRenewalJobForSubscriptionId` + worker normal.
- Proibido: segundo `INSERT` se invoice do `period_start` já existe.

### 12.6 Implantação incremental

1. Deploy **só logs** `[SUBSCRIPTION_*]` (já no código desta investigação).
2. 48h de coleta em produção.
3. Classificar amostra com queries secção 9.
4. Aplicar **uma** correção da tabela Fase A/B conforme dados.
5. Revalidar assinatura exemplo (19/05 → 24/05).

---

## Checklist rápido — caso “assinatura ativa, previsão 19/05, vencimento 24/05”

- [ ] `billing_recurring_jobs` tem linha `pending`/`processing` com `cycle_key` ≈ `2026-05-24`?
- [ ] `retry_at` é futuro? → aguardar ou verificar janela 09:00.
- [ ] `error_message` preenchido? → ler causa (CPF, período, itens).
- [ ] `completion_outcome = completed_no_invoice_no_eligible_items`? → itens recorrentes / E2.
- [ ] Cron worker corre de minuto a minuto?
- [ ] Existe `customer_invoices` com `period_start = 2026-05-24` e job ainda `pending`? → inconsistência; usar idempotência no retry.

---

*Alterações de código nesta rodada: logs `subscriptionBillingLog` em `billingLogger.ts` e pontos críticos de `recurringBillingJobService.ts`. Sem mudança de regra de negócio.*
