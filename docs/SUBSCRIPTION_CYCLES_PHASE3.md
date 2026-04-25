# Etapa 3 — Dual-write em `subscription_cycles` (scheduler + worker)

Referência: [PLANO_DEFINITIVO_FATURAS_RECORRENTES_COM_CICLOS.md](./PLANO_DEFINITIVO_FATURAS_RECORRENTES_COM_CICLOS.md), [SUBSCRIPTION_CYCLES_PHASE1.md](./SUBSCRIPTION_CYCLES_PHASE1.md), [SUBSCRIPTION_CYCLES_PHASE2.md](./SUBSCRIPTION_CYCLES_PHASE2.md).

## Objetivo

Persistir **estados reais** em `subscription_cycles` **em paralelo** ao motor legado (`billing_recurring_jobs` + faturas), sem substituir o executor técnico nem alterar idempotência dos jobs.

## Flag

- Chave: `subscription_cycles_write` em `superadmin_settings`. **Default:** `true` após 141 (insert) + **143** (upgrade de instalações antigas). Valor vazio ou linha ausente é tratado como **ligado** em runtime; tabela inexistente ⇒ desligado (sem crash).
- Só quando o valor efetivo é `false` **explícito** o backend deixa de executar os upserts/updates de ciclos nos caminhos novos.
- **Controlo:** Super Admin → **Ciclos de assinatura** — *Gravar ciclos de assinatura em paralelo ao motor atual*. API: `GET/PUT /api/superadmin/billing/subscription-cycles-flags`. Cache de leitura da flag ~20s após alterações.

## Comportamento por componente

### Scheduler (`insertOrReactivateRenewalJob`)

- Após **insert** de job novo: `RETURNING id` → upsert ciclo com `status = queued` e `job_id`.
- Após **reactivate** de job `cancelled`/`failed`: mesmo padrão com o `id` reativado.
- Quando já existe job **pending/processing** para o ciclo (`skipped_active_exists`): sincroniza ciclo como `queued` com o `job_id` bloqueador.
- Quando o guard impõe `skipped_completed_cycle`: **não** grava ciclo (não reabre ciclo já fechado no job).

### Worker

- Ao passar job para **`processing`**: upsert ciclo `processing` + `job_id`.
- Ao **re-enfileirar** por janela horária (`requeueBillingRecurringJobForWindow`): ciclo volta a **`queued`**.
- Ao **reclaim** de `processing` stale: jobs voltam a `pending`; ciclos são marcados **`queued`** de novo (alinhado ao job).
- **`completeBillingRecurringJob`**: após atualizar o job, espelha conclusão no ciclo:
  - `customer_invoice` + id → `invoiced` + `invoice_id`
  - `tenant_billing` + id → `skipped` + `skipped_reason` + metadata com id SaaS (FK não aponta para `customer_invoices`)
  - sem fatura (ex.: sem itens elegíveis) → `skipped` + outcome
- **`cancelBillingRecurringJob`**: ciclo **`cancelled`** + `skipped_reason`, exceto **mismatch** com guarda: só atualiza se o ciclo for obsoleto (se `next_billing_date` normalizado da assinatura **ainda for igual** ao `cycle_date` do job, **não** altera o ciclo — proteção a race).
- **Falhas com retry**: ciclo **`queued`** + `error_message`; falha **final** (`failed_max_attempts`) → **`failed`**.

### CRM — reagendamento manual

- `cancelPendingRenewalJobsForSubscription`: após `UPDATE … RETURNING`, cada job cancelado dispara o mesmo fluxo de cancelamento de ciclo (`CANCELLED_MANUAL_NEXT_BILLING_RESCHEDULE`).

## Invariantes

- **`billing_recurring_jobs`** continua a ser a fila técnica; nenhuma remoção de jobs nem mudança nas constraints UNIQUE.
- Ciclo **`invoiced`** não é rebaixado por upserts (regra no SQL `ON CONFLICT`).
- Erros de dual-write são **logados** (`subscription_cycles_dual_write_error`) e **não** interrompem o processamento do job.

## Ficheiros

| Ficheiro | Função |
|----------|--------|
| `subscriptionCyclesWriteFlagService.ts` | Flag + cache curto (~20s) |
| `subscriptionCyclesSuperadminSettingsService.ts` | Persistência via painel Super Admin |
| `subscriptionCyclesDualWriteService.ts` | SQL de upsert/update |
| `recurringBillingJobService.ts` | Hooks scheduler/worker/reclaim/requeue/complete/cancel |
| `customerInvoiceRecurrenceNextBillingService.ts` | Cancelamento em massa + ciclo |

## Critérios de aceite

- [x] Flag `false` explícita: zero gravações em `subscription_cycles` pelos novos caminhos.
- [x] Flag `true`: transições espelhadas sem alterar outcomes/idempotência dos jobs.
- [x] Fatura CRM gerada vincula `invoice_id` no ciclo correto (`cycle_date` / período).
- [x] Ciclo `invoiced` não reabre.
- [x] Motor legado inalterado em regras de negócio.

## Próximas etapas

- **Etapa 4:** relatório read-only de reconciliação — [SUBSCRIPTION_CYCLES_PHASE4.md](./SUBSCRIPTION_CYCLES_PHASE4.md).
- Cutover do scheduler (quando as divergências forem zero de forma estável).
