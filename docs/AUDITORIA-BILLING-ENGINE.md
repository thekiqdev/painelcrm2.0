# Auditoria Técnica – Billing Engine (Recorrência)

**Data:** 2026-02-25  
**Escopo:** Implementação das Fases 1–4 do motor de recorrência (subscriptions, tenant_billing, billing_recurring_jobs, scheduler, worker, customer_invoices).

---

## 1) DATABASE

### 1.1 Tabela `subscriptions`

| Campo solicitado      | Implementado | Observação |
|-----------------------|-------------|------------|
| currency              | ✔           | `TEXT NOT NULL DEFAULT 'BRL'` (67_subscriptions.sql) |
| billing_cycle_count   | ✔           | `INT DEFAULT 0` |
| grace_period_days     | ✔           | `INT DEFAULT 3` |
| billing_anchor_day    | ✔           | `SMALLINT NULL CHECK (1–31)` |
| metadata              | ✔           | `JSONB NULL` |
| next_billing_date     | ✔           | `DATE NOT NULL` |
| last_job_at           | ✔           | `TIMESTAMPTZ NULL`; atualizado em `updateSubscriptionAfterRenewal` |

**Conclusão:** Todos os campos planejados estão presentes em `subscriptions`.

---

### 1.2 Tabela `tenant_billing`

| Campo solicitado    | Implementado | Observação |
|---------------------|-------------|------------|
| period_start        | ✔           | Adicionado em 59_asaas (DATE) |
| period_end          | ✔           | Adicionado em 59_asaas (DATE) |
| invoice_number      | ✔           | Em 33_tenant_billing (TEXT) |
| gateway_payment_id  | ⚠           | **Nome diferente:** existe `asaas_payment_id` (59). Funcionalmente equivalente; nome específico do gateway. |
| status              | ✔           | 33: `pending`, `paid`, `overdue` |

**Conclusão:** Campos presentes; o “gateway payment id” está como `asaas_payment_id`. Para multi-gateway, pode-se considerar um alias ou coluna genérica `gateway_payment_id` no futuro.

---

### 1.3 UNIQUE(subscription_id, period_start)

- **Implementado:** ✔  
- **Arquivo:** 68_tenant_billing_subscription_id.sql  
- **Detalhe:** Índice único **parcial**  
  `CREATE UNIQUE INDEX ... ON tenant_billing (subscription_id, period_start) WHERE subscription_id IS NOT NULL`  
- Garante uma fatura por assinatura por período quando `subscription_id` está preenchido.

---

## 2) JOB SYSTEM – `billing_recurring_jobs`

| Campo / regra        | Implementado | Observação |
|----------------------|-------------|------------|
| subscription_id       | ✔           | FK → subscriptions |
| cycle_key             | ✔           | TEXT NOT NULL |
| job_type              | ✔           | CHECK (renewal, retry_payment, …) |
| scheduled_at          | ✔           | TIMESTAMPTZ NOT NULL |
| retry_at              | ✔           | TIMESTAMPTZ NULL |
| attempts              | ✔           | INT DEFAULT 0 |
| max_attempts          | ✔           | INT DEFAULT 3 |
| status                | ✔           | pending, processing, completed, failed, cancelled |
| **UNIQUE(subscription_id, cycle_key)** | ✔ | Constraint na tabela (69) |

**Conclusão:** Estrutura do job system está conforme o desenho.

---

## 3) SCHEDULER

| Requisito | Implementado | Onde |
|-----------|-------------|------|
| Batch com LIMIT | ✔ | `LIMIT $1` com `SCHEDULER_LIMIT = 500` (recurringBillingJobService.ts) |
| ORDER BY next_billing_date | ✔ | `ORDER BY next_billing_date` na query de subscriptions |
| Filtro status = 'active' | ✔ | `WHERE status = 'active' AND next_billing_date <= CURRENT_DATE` |
| Cria job só se não existir cycle_key | ✔ | 1) SELECT em `billing_recurring_jobs` com `status IN ('pending', 'processing')` para (subscription_id, cycle_key); 2) `INSERT ... ON CONFLICT (subscription_id, cycle_key) DO NOTHING` |

**Conclusão:** Scheduler está alinhado ao plano (batch limitado, ordenação, filtro de ativos, idempotência por cycle_key).

---

## 4) WORKER

| Requisito | Implementado | Onde |
|-----------|-------------|------|
| SELECT FOR UPDATE SKIP LOCKED | ✔ | Query de jobs com `FOR UPDATE SKIP LOCKED` e LIMIT 100 |
| Verifica se subscription ainda precisa cobrar | ✔ | Checagens: subscription ativa, `next_billing_date <= today`, e `cancel_at_period_end` / `current_period_end` |
| Cria invoice antes de chamar gateway | ✔ | `createInvoice` / `createCustomerInvoice` antes de `gateway.createCharge` |
| Gera invoice_number antes da cobrança | ✔ | `generateInvoiceNumber` no `createInvoice` (e equivalente em customer_invoices); fatura é persistida com número antes do gateway |
| Salva gateway_payment_id após criação | ✔ | `updateInvoiceGatewayData` / `updateCustomerInvoiceGatewayData` com `asaas_payment_id` após `createCharge` |

**Conclusão:** Ordem create-invoice → gateway → save payment_id está correta; nome da coluna é `asaas_payment_id`.

---

## 5) IDEMPOTÊNCIA

| Proteção | Implementado | Detalhe |
|----------|-------------|---------|
| UNIQUE(subscription_id, period_start) em tenant_billing | ✔ | Índice único parcial (68) |
| UNIQUE(subscription_id, cycle_key) em jobs | ✔ | Constraint na tabela (69) |
| Checagem de invoice existente antes de criar | ✔ | `findInvoiceBySubscriptionAndPeriod` (saas) e `findCustomerInvoiceBySubscriptionAndPeriod` (customer) antes de criar nova fatura |
| ON CONFLICT no scheduler | ✔ | `ON CONFLICT (subscription_id, cycle_key) DO NOTHING` |
| Idempotency no gateway | ✔ | `idempotency_key` em createCharge (ex.: `saas_renew_${subscriptionId}_${periodStart}`) |

**Correção aplicada:** Quando o worker encontra invoice já existente (path “skip”), agora também chama `updateSubscriptionAfterRenewal` (next_billing_date, current_period_*, billing_cycle_count, last_job_at) para manter a assinatura consistente e evitar que fique “travada” com next_billing_date antigo.

---

## 6) RETRY SYSTEM

| Item | Implementado | Onde |
|------|-------------|------|
| retry_at | ✔ | Atualizado em falha: `retry_at = $3` no UPDATE do job |
| attempts | ✔ | Incrementado em falha; usado para decidir failed vs pending |
| max_attempts | ✔ | Default 3; comparação `attempts >= job.max_attempts` |
| Backoff progressivo | ✔ | 1ª falha: +1h; 2ª: +1 dia; 3ª: +3 dias (recurringBillingJobService.ts) |
| Status 'failed' após max_attempts | ✔ | `status = attempts >= job.max_attempts ? 'failed' : 'pending'` |
| Notificação em falha definitiva | ✔ | `notifyBillingJobFailed` quando status vira 'failed' |

**Conclusão:** Retry com backoff e limite de tentativas está implementado.

---

## 7) CONCORRÊNCIA

| Cenário | Proteção | Resultado |
|---------|----------|-----------|
| Dois workers processam o mesmo job | SELECT FOR UPDATE SKIP LOCKED | Apenas um worker obtém o mesmo row; o outro não vê o row locked. ✔ |
| Dois jobs para o mesmo ciclo | UNIQUE(subscription_id, cycle_key) | Inserção duplicada é impedida no scheduler. ✔ |
| Duas invoices para o mesmo período | UNIQUE(subscription_id, period_start) + checagem findInvoice* | Constraint + checagem antes de createInvoice evitam duplicata. ✔ |
| Duas cobranças no gateway para o mesmo ciclo | idempotency_key no createCharge | Gateway pode deduplicar por chave. ✔ |

**Conclusão:** Concorrência está mitigada por lock, constraints e idempotência; a subscription é avançada também no path “invoice já existe”.

---

## 8) EDGE CASES

| Caso | Situação | Observação |
|------|----------|------------|
| **billing_anchor_day em meses menores** | ⚠ Não implementado | Plano: `next_billing_date` com MIN(anchor_day, último dia do mês). Hoje `addInterval` usa `setMonth(getMonth()+1)`; em datas como 31/01 o resultado pode ser 03/03 (rollover do JS). **Recomendação:** função de próximo período que respeite `billing_anchor_day` e último dia do mês. |
| **Retry após falha do gateway** | ✔ | Job volta a pending com retry_at; worker filtra `retry_at IS NULL OR retry_at <= now()`; backoff progressivo. |
| **Gateway timeout** | ✔ | Tratado como erro no try/catch do job; attempts++, retry_at definido; após max_attempts → failed e notify. |
| **Job duplicado** | ✔ | Scheduler: checagem por (subscription_id, cycle_key) + ON CONFLICT DO NOTHING. |
| **Worker crash após createInvoice, antes de updateSubscription** | ✔ | Na nova execução, findInvoiceBySubscriptionAndPeriod encontra a invoice; job é marcado completed. **Gap:** subscription não é avançada (ver item 5). |
| **Worker crash após createCharge, antes de updateInvoiceGatewayData** | ⚠ | Invoice existe sem asaas_payment_id; no retry o job é marcado completed por “invoice existente” e não se chama o gateway de novo. Pagamento pode existir no Asaas sem vínculo no nosso DB. **Recomendação:** job de reconciliação ou, no path “invoice existente”, tentar obter pagamento por idempotency_key no gateway e atualizar a invoice. |

---

## 9) LOGS E OBSERVABILIDADE

| Evento | Implementado | Onde |
|--------|-------------|------|
| Criação de invoice | ⚠ Parcial | Não há log explícito “invoice created” com id/número; apenas fluxo do worker. |
| Chamada de gateway | ✔ | `console.error` em falha de createCharge; opcionalmente log de sucesso. |
| Retry | ✔ | `billingLog('job', 'job_error', { jobId, subscriptionId, tenantId, error })` em falha; attempts/retry_at no UPDATE. |
| Falha definitiva (max attempts) | ✔ | `notifyBillingJobFailed` e log com `notify: true`. |
| Scheduler run | ✔ | `billingLog('scheduler', 'enqueue_run'/'enqueue_done', { enqueued, skipped, expired })`. |
| Worker batch | ✔ | `billingLog('worker', 'batch_start'/'batch_done', { workerId, processed, failed, cancelled })`. |

**Recomendação:** Incluir log estruturado ao criar invoice (subscription_id, period_start, invoice_id, invoice_number) para rastreio e auditoria.

---

## 10) RELATÓRIO FINAL

### ✔ Itens implementados corretamente

- Tabelas **subscriptions**, **tenant_billing**, **billing_recurring_jobs** com os campos necessários (com a ressalva do nome `asaas_payment_id`).
- **UNIQUE(subscription_id, period_start)** em tenant_billing (parcial) e **UNIQUE(subscription_id, cycle_key)** em jobs.
- Scheduler com **LIMIT 500**, **ORDER BY next_billing_date**, **status = 'active'** e proteção contra job duplicado (checagem + ON CONFLICT).
- Worker com **FOR UPDATE SKIP LOCKED**, validações de subscription, criação de invoice antes do gateway, **invoice_number** antes da cobrança e persistência de **asaas_payment_id** após createCharge.
- Idempotência: constraint de período, constraint de cycle_key, checagem de invoice existente, idempotency_key no gateway.
- Retry com **retry_at**, **attempts**, **max_attempts** e backoff progressivo (1h, 1d, 3d).
- Concorrência: SKIP LOCKED, constraints e idempotência evitam duplicidade de jobs e invoices.
- **last_job_at** atualizado em `updateSubscriptionAfterRenewal`.
- Logs estruturados no scheduler e no worker; notificação em falha definitiva.

### ⚠ Pontos que podem gerar risco

1. **billing_anchor_day:** Cálculo de próximo período não usa MIN(anchor_day, último dia do mês); `addInterval` com datas tipo 31 pode gerar dia incorreto (ex.: 31/01 → 03/03).
2. **Crash após createCharge, antes de updateInvoiceGatewayData:** Pagamento pode existir no gateway sem `asaas_payment_id` na invoice; retry não chama o gateway de novo.
3. **tenant_billing:** Coluna é **asaas_payment_id**, não **gateway_payment_id** (risco baixo; apenas nomenclatura para multi-gateway futuro).

### 🔧 Melhorias recomendadas

1. **Cálculo de próximo período com anchor:** Implementar (ou usar em `updateSubscriptionAfterRenewal`) lógica que, quando `billing_anchor_day` estiver definido, calcule next_billing_date como MIN(anchor_day, último dia do mês) para o mês alvo.
2. **Reconciliação gateway:** Job ou processo que, para invoices com status pending e sem asaas_payment_id mas com idempotency_key, consulte o gateway e atualize asaas_payment_id/asaas_status quando o pagamento existir.
3. **Log de criação de invoice:** Adicionar `billingLog` (ou equivalente) ao criar invoice (subscription_id, period_start, invoice_id, invoice_number) para auditoria e debugging.

### 🧪 Testes manuais recomendados

1. **Scheduler:** Rodar duas vezes seguidas no mesmo dia e conferir que não são criados dois jobs para o mesmo (subscription_id, cycle_key).
2. **Worker concorrente:** Dois processos worker simultâneos; conferir que nenhum mesmo job é processado por ambos e que não há duas invoices para o mesmo período.
3. **Retry:** Simular falha do gateway (ex.: timeout ou API indisponível) e conferir que attempts e retry_at são atualizados e que após max_attempts o job fica failed e a notificação é disparada.
4. **Skip por invoice existente:** Inserir manualmente uma invoice para (subscription_id, period_start) e rodar o worker; deve marcar o job como completed sem criar nova invoice e deve avançar a subscription (next_billing_date, last_job_at).
5. **Data limite de mês:** Assinatura com next_billing_date em 31/01 e billing_interval monthly; conferir próximo período (hoje pode sair 03/03; após melhoria com anchor, deve respeitar 28/02 ou 31 conforme anchor).
6. **Crash simulado:** Após createInvoice e antes de updateSubscriptionAfterRenewal, matar o processo; na próxima execução o job deve encontrar a invoice existente, avançar a subscription e completar sem duplicar.

---

*Documento gerado como parte da auditoria técnica do Billing Engine.*
