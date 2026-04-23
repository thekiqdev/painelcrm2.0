# Etapa 2 — Correção: faturas recorrentes e link público

**Objetivo:** leitura operacional dos jobs, menos ambiguidade no “completed sem invoice”, correção comprovada de elegibilidade quando E2 está desligado, logs mais equilibrados, validação objetiva do link público, documentação de produção.

**Data:** 2026-04-22.

**Preserva Etapa 1:** `completion_outcome` / `completion_detail`, logs `[BILLING]`, `CURRENT_DATE` no worker, documentação de `billing:scheduler` e `billing:worker` (complementada abaixo).

---

## O que foi corrigido (código)

| Área | Alteração |
|------|-----------|
| **Operação / diagnóstico** | `GET /api/superadmin/billing/recurring-jobs` — resumo por estado + lista com join a `subscriptions` e `tenants` (`superadminBillingController` + `billingRecurringJobsOpsService`). |
| **Elegibilidade de itens (E2 desligado)** | Com `BILLING_CHILD_ITEM_INVOICES_ENABLED=false`, itens com `scheduled_due_date` fora do `periodStart` do ciclo **deixam de ser ignorados só por essa regra**; a âncora de “due” para o ciclo principal passa a ser a `due_date` da fatura anterior (`recurringCustomerRenewalItemDueAnchor.ts` + uso em `processOneCustomerRenewalJob`). Evita ciclo avançar sem invoice quando não existe fila de faturas filhas. |
| **“Completed sem invoice”** | Log `financial_success: false`; `completion_detail` com `operational_note` explícito; opcional `BILLING_ALERT_ON_NO_INVOICE_CYCLE=true` → log `operational_alert_completed_without_invoice` com `notify: true`. |
| **Verbosidade do scheduler** | Logs por linha (`enqueue_job_inserted`, skips) só com `BILLING_SCHEDULER_VERBOSE=true`; `enqueue_done` mantém contagens e `enqueued_sample_json`. |
| **Link público × recurring** | Nenhuma alteração na rota `/pay` nem em `getByPaymentToken`. Teste de contrato em `customerInvoicePublicPayRecurringContract.test.ts` (SQL 77 não exclui `invoice_type`). |

---

## O que foi apenas documentado

- Fluxo para distinguir **problema operacional** (sem scheduler/worker) vs **itens** vs **link** (quando a invoice existe).
- Queries SQL ad-hoc para operação (secção abaixo).
- Comportamento mantido quando **E2 está ligado** (itens fora do `periodStart` seguem só para fila de filhos).

---

## Leitura operacional dos jobs

### API (Super Admin)

`GET /api/superadmin/billing/recurring-jobs`

| Query | Descrição |
|-------|-----------|
| `limit` | Default 100, máx. 500 |
| `window_days` | Janela para contagens `completed_*` / `failed` / `cancelled` no resumo (default 30) |
| `since_days` | Opcional: filtra lista por `j.updated_at >= now() - since_days days` |
| `status` | Opcional: um status ou vários separados por vírgula (`pending,failed`) |

Resposta inclui:

- `summary`: `pending`, `processing` (sempre totais atuais), `completed_with_invoice`, `completed_without_invoice`, `failed`, `cancelled` (na janela `window_days`, exceto pending/processing que são totais em fila).
- `jobs`: linhas com `completion_outcome`, `completion_detail`, `result_invoice_id`, `subscription_next_billing_date`, `tenant_name`, etc.

Se a migração 130 não existir, `completion_*` na lista vêm como `null` (deteção via `information_schema`).

### SQL manual (produção / psql)

**Resumo rápido:**

```sql
SELECT status,
       COUNT(*) AS c,
       COUNT(*) FILTER (WHERE status = 'completed' AND result_invoice_id IS NULL) AS completed_sem_invoice
FROM billing_recurring_jobs
GROUP BY status
ORDER BY status;
```

**Jobs “completed” sem fatura (últimos 30 dias):**

```sql
SELECT j.id, j.tenant_id, j.subscription_id, j.cycle_key, j.completion_outcome, j.completion_detail,
       j.updated_at, s.next_billing_date, s.type AS subscription_type
FROM billing_recurring_jobs j
LEFT JOIN subscriptions s ON s.id = j.subscription_id
WHERE j.status = 'completed'
  AND j.result_invoice_id IS NULL
  AND j.updated_at >= now() - interval '30 days'
ORDER BY j.updated_at DESC
LIMIT 100;
```

**Fila atual:**

```sql
SELECT id, tenant_id, subscription_id, cycle_key, scheduled_at, retry_at, attempts, status
FROM billing_recurring_jobs
WHERE status IN ('pending', 'processing')
ORDER BY scheduled_at ASC
LIMIT 200;
```

**Validar `payment_token` numa invoice CRM:**

```sql
SELECT id, invoice_number, origin, invoice_type, status, payment_token IS NOT NULL AS tem_token, due_date
FROM customer_invoices
WHERE subscription_id = 'UUID-DA-SUBSCRIPTION'
ORDER BY created_at DESC
LIMIT 20;
```

---

## Caso “completed sem invoice”

- **Política de negócio mantida:** o ciclo continua a avançar quando não há itens elegíveis (não reescrevemos o motor de subscription).
- **Interpretação:** deixa de parecer “sucesso financeiro” graças a `financial_success: false` no log, `operational_note` em `completion_detail`, outcome `completed_no_invoice_no_eligible_items` (Etapa 1) + alerta opcional.
- **Alerta:** definir `BILLING_ALERT_ON_NO_INVOICE_CYCLE=true` para linhas adicionais com `notify: true` (útil para agregadores).

---

## Elegibilidade e datas

- **Correção aplicada:** com E2 **desligado**, a regra que mandava itens “só para filhos” deixava de ter fila — corrigido com âncora na `due_date` da fatura anterior (`resolveMainRenewalItemDue`).
- **E2 ligado:** sem mudança de regra (itens com data própria ≠ `periodStart` continuam fora da fatura principal).
- **`calculateNextItemDueDate`:** mantido (UTC noon); sem alteração nesta etapa — documentado como risco residual se surgirem casos bordos específicos.

---

## Verbosidade dos logs

| Variável | Efeito |
|----------|--------|
| `BILLING_SCHEDULER_VERBOSE=true` | Restaura logs por assinatura no enqueue (insert/skip). |
| Default / omitido | Só `enqueue_run` e `enqueue_done` (+ amostra JSON no done). |

Logs **sempre** mantidos: falhas, cancelamentos, sem invoice, invoice criada, retry/falha final (`processNextBatch`).

---

## Link público × invoice recurring

- **Validação:** teste `customerInvoicePublicPayRecurringContract.test.ts` garante que o ficheiro `77_payment_token_customer_invoices.sql` filtra apenas por `payment_token` e não exclui `recurring`.
- **Fluxo runtime:** `getByPaymentToken` inalterado; com `payment_token` preenchido, `/pay/:token` comporta-se como fatura manual.

---

## Riscos remanescentes

- Com **E2 ligado** e itens só “fora do ciclo”, ainda pode haver `completed_no_invoice` se a fila de filhos não correr ou não gerar cobrança — monitorizar `skipped_child_schedule_count` em `completion_detail`.
- `window_days` no resumo da API é configurável; contagens históricas dependem de `updated_at`.

---

## Etapa 3 (sugestão)

- UI interna mínima para jobs (além de Super Admin).
- Política opcional: não avançar ciclo sem invoice (breaking change — requer produto/legal).
- Revisão profunda de `calculateNextItemDueDate` vs ancoragem de tenant.

---

## Checklist Etapa 2

- [x] Forma objetiva de ler estado dos jobs (API + SQL documentada).
- [x] Jobs sem invoice distinguíveis (`financial_success: false`, detail, alerta opcional).
- [x] Elegibilidade revisada com correção quando E2 desligado + testes unitários.
- [x] Timezone/datas residuais: sem mudança adicional além da Etapa 1 (documentado).
- [x] Logs mais úteis e menos ambíguos (flag de verbosidade).
- [x] Pipeline link público recurring validado por teste de contrato SQL.
- [x] Sem alteração ao fluxo manual de faturas.

---

## Ficheiros alterados / novos

| Ficheiro |
|----------|
| `packages/backend/src/config/billingEnv.ts` |
| `packages/backend/src/services/billingRecurringJobsOpsService.ts` (**novo**) |
| `packages/backend/src/services/recurringCustomerRenewalItemDueAnchor.ts` (**novo**) |
| `packages/backend/src/services/recurringCustomerRenewalItemDueAnchor.test.ts` (**novo**) |
| `packages/backend/src/services/customerInvoicePublicPayRecurringContract.test.ts` (**novo**) |
| `packages/backend/src/services/recurringBillingJobService.ts` |
| `packages/backend/src/controllers/superadminBillingController.ts` |
| `packages/backend/src/routes/superadminRoutes.ts` |
| `env.example` |
| `docs/ETAPA_2_CORRECAO_FATURAS_RECORRENTES.md` (**novo**) |
