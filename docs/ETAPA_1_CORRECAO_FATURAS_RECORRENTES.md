# Etapa 1 — Correção: faturas recorrentes e link público

**Objetivo:** operação documentada, observabilidade e distinção inequívoca entre job concluído **com** fatura e **sem** fatura nova — sem refatorar o motor de billing.

**Data:** 2026-04-22.

---

## O que estava quebrado “de facto”

1. **Operacional:** a recorrência **nunca** roda dentro do processo HTTP da API; depende de `billing:scheduler` e `billing:worker`. Se em produção só existir o serviço da API, **não há** geração de novas faturas nem novos `payment_token` por ciclo — o “link não aparece” reflete sobretudo **ausência de invoice**, não falha do SQL de pagamento por token.

2. **Lógica + falta de visibilidade:** quando `includedItems.length === 0`, o worker **avançava a subscription** e marcava o job como `completed` **sem** `result_invoice_id`, sem coluna de classificação e com pouco log — parecia sucesso genérico.

3. **Risco de data:** o worker comparava `next_billing_date` com “hoje” em **UTC** (`toISOString().slice(0,10)`), enquanto o scheduler usa **`CURRENT_DATE`** no Postgres — possível desalinhamento em bordas de fuso.

---

## Como ficou a execução em produção

### O que o repositório garante

- Scripts NPM em `packages/backend/package.json`:
  - `billing:scheduler` → `tsx src/scripts/runRecurringScheduler.ts`
  - `billing:worker` → `tsx src/scripts/runRecurringWorker.ts`
- A API (`src/index.ts`) **não** agenda esses fluxos automaticamente.

### O que a equipa de deploy deve garantir

- Dois processos **adicionais** (ou cron no EasyPanel / PM2 / Kubernetes) com o **mesmo** `.env` (POSTGRES_*, JWT, etc.) que o backend:
  1. Scheduler em intervalo recomendado **10–15 min**.
  2. Worker em intervalo recomendado **1–2 min**.
- Variáveis documentadas em `env.example` (bloco “Billing / faturas recorrentes”).

### O que não foi possível “comprovar” no código

- Se o ambiente de produção atual já tinha esses processos: isso é **verificação operacional** na VPS/painel (processos, crons, logs `[BILLING]`). O código agora facilita essa prova com logs e colunas de outcome.

---

## Migração de base (produção)

Executar migração que inclui o ficheiro novo:

- `database/init/130_billing_recurring_jobs_completion_outcome.sql` — adiciona `completion_outcome` e `completion_detail` em `billing_recurring_jobs`.
- Registado em `packages/backend/src/migrate.ts`.

**Sem esta migração:** o worker continua a funcionar; o código deteta a ausência das colunas (`information_schema`) e **não** grava outcome na tabela (mantém apenas logs melhorados e `CURRENT_DATE` no worker).

---

## Observabilidade implementada

### Logs `[BILLING]` (JSON)

| Momento | `message` (exemplos) |
|---------|----------------------|
| Scheduler | `enqueue_skipped_pending_job_exists`, `enqueue_skipped_conflict_or_duplicate`, `enqueue_job_inserted`, `enqueue_done` (com `enqueued_sample_json`) |
| Worker | `batch_start`, `job_processing_start`, `job_completed_idempotent_*`, `customer_renewal_completed_without_invoice`, `customer_renewal_invoice_persisted`, `saas_renewal_invoice_persisted`, `job_cancelled`, `job_error`, `job_retry_scheduled`, `job_failed_final`, `batch_done` |

### Fatura CRM criada pelo worker

- `customerInvoiceService.createCustomerInvoice`: log `invoice_created` agora inclui `origin`, `invoice_type`, `payment_token_present`.
- `customer_renewal_invoice_persisted`: confirma `payment_token_present` no fecho do job com invoice.

### Colunas novas (após migração 130)

- `completion_outcome`: classifica o término (`completed_invoice_customer`, `completed_no_invoice_no_eligible_items`, `completed_idempotent_*`, `cancelled_*`, `failed_max_attempts`, …).
- `completion_detail`: JSON curto (ex.: contagens de itens, `db_today` vs `next_billing_date` em cancelamentos).

---

## Job `completed` sem `result_invoice_id`

- Passa a ser **`completion_outcome = completed_no_invoice_no_eligible_items`** (quando migração aplicada), com `completion_detail` explicando contagens (`prev_item_count`, `recurring_line_count`, itens excluídos por agenda E2, etc.).
- Log dedicado: `customer_renewal_completed_without_invoice` com `has_result_invoice: false`.

Isto **não** é sucesso financeiro equivalente a “emitiu fatura”; é ciclo avançado **sem** nova linha em `customer_invoices`.

---

## Pipeline `payment_token` (validação no código)

| Etapa | Situação |
|-------|----------|
| Insert renovação CRM | `createCustomerInvoice` gera UUID e persiste em `payment_token`. |
| Log | `payment_token_present: true` na criação e no `customer_renewal_invoice_persisted`. |
| Listagem / detalhe API | `customerInvoiceSchema` já expõe `payment_token` no SELECT. |
| Link público | `get_customer_invoice_by_payment_token` — sem filtro que exclua `recurring`. |

**Conclusão Etapa 1:** se não há link novo, a causa rastreável passa a ser priorizada para **job sem invoice** ou **processos scheduler/worker ausentes**, com evidência em logs e, com migração, em `billing_recurring_jobs`.

---

## Timezone (Etapa 1)

- O worker passou a usar **`SELECT CURRENT_DATE::text`** na **mesma sessão** que o lock do job (`client`), alinhado ao critério do scheduler no Postgres.
- **Não** foi alterado cálculo de `period_end` / itens — fica para avaliação na Etapa 2 se ainda houver casos bordos.

---

## Riscos remanescentes

- Scheduler ainda pode logar muitas linhas `enqueue_job_inserted` em tenants com centenas de assinaturas (aceitável para depuração; pode filtrar em Etapa 2).
- `completion_detail` é texto: manter JSON compacto para não inflar linhas.
- Deploy sem migração: outcome só em logs, não na tabela.

---

## O que fica para a Etapa 2 (sugestão)

- Reduzir verbosidade do scheduler em produção (amostragem ou flag `BILLING_VERBOSE`).
- Política de negócio: avançar ciclo **sem** fatura vs erro/retry.
- Dashboard ou query SQL documentada para operação (jobs por outcome).
- Revisão adicional de datas em `calculateNextItemDueDate` / fusos se métricas mostrarem problema.

---

## Checklist final (Etapa 1)

- [x] Execução do scheduler **documentada** (`env.example` + este doc); confirmação em cada produção é operacional.
- [x] Execução do worker **documentada** (idem).
- [x] Logs melhorados para jobs recorrentes (scheduler + worker + cancel + sem invoice + idempotência + falha final/retry).
- [x] Jobs completados sem invoice **visíveis** (log + `completion_outcome` após migração 130).
- [x] Pipeline `payment_token` **validado** no código (logs `payment_token_present` em criação CRM recorrente).
- [x] Causa do “link não aparece” mais **objetiva** (ausência de invoice vs token na UI).
- [x] Sem alteração do fluxo manual de faturas além de campos extras no log estruturado de `createCustomerInvoice` (compatível).

---

## Ficheiros alterados

| Ficheiro | Alteração |
|----------|-----------|
| `database/init/130_billing_recurring_jobs_completion_outcome.sql` | Novas colunas `completion_outcome`, `completion_detail`. |
| `packages/backend/src/migrate.ts` | Inclusão da migração 130. |
| `packages/backend/src/services/recurringBillingJobService.ts` | Outcomes, logs, `CURRENT_DATE` no worker, contagem correta no enqueue (`rowCount`), cancelamentos com motivo. |
| `packages/backend/src/services/customerInvoiceService.ts` | Log `invoice_created` com `origin`, `invoice_type`, `payment_token_present`. |
| `env.example` | Bloco documentando scheduler/worker e variáveis relacionadas. |
| `docs/ETAPA_1_CORRECAO_FATURAS_RECORRENTES.md` | Este documento. |
