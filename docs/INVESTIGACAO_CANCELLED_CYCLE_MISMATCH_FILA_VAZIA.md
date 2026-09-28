# Investigação — `cancelled_job_cycle_mismatch_after_reschedule` e fila vazia no worker

## Resumo executivo

Quando o worker cancela um job com outcome **`cancelled_job_cycle_mismatch_after_reschedule`**, o código **não** cria outro job na mesma execução. A fila fica sem `pending` para essa assinatura até o **scheduler** (`enqueueRenewalJobs`) ou o **`tryEnqueueRenewalJobForSubscriptionId`** (após PATCH de próxima renovação) inserirem/reativarem uma linha **com `cycle_key` igual ao `subscriptions.next_billing_date` atual**.

Os scripts **`runRecurringWorker.ts`** e **`runRecurringScheduler.ts`** são **one-shot** (uma execução e saem). Ver fila vazia com `batchSize=0` é o comportamento esperado quando **não há** linhas `pending` que passem nos filtros da query do worker.

**Causa raiz mais provável da “fila vazia” após o cancelamento:** nenhuma execução bem-sucedida de enfileiramento **depois** do cancelamento (scheduler não correu / correu mas não elegibilizou a assinatura / PATCH não enfileirou porque `next_billing_after_db_today` ou `outside_local_window`).

---

## 1. `runRecurringWorker.ts` — one-shot ou contínuo?

**One-shot.**

- Chama `processChildItemDueInvoices()` e `processNextBatch(workerId)` **uma vez**.
- Regista `worker_exit` e o processo termina.

```17:24:packages/backend/src/scripts/runRecurringWorker.ts
async function main() {
  const child = await processChildItemDueInvoices();
  const result = await processNextBatch(workerId);
  console.log(
    '[BILLING]',
    JSON.stringify({ type: 'worker_exit', workerId, child_invoices_e2: child, ...result, ts: new Date().toISOString() })
  );
}
```

Comentário no ficheiro: uso com **cron** a cada 1–2 min ou loop externo.

---

## 2. `runRecurringScheduler.ts` — one-shot ou contínuo?

**One-shot.**

- Chama `enqueueRenewalJobs()` **uma vez**.
- Regista `scheduler_exit` e termina.

```15:18:packages/backend/src/scripts/runRecurringScheduler.ts
async function main() {
  const result = await enqueueRenewalJobs();
  console.log('[BILLING]', JSON.stringify({ type: 'scheduler_exit', ...result, ts: new Date().toISOString() }));
}
```

Comentário no ficheiro: uso com **cron** a cada 10–15 min.

---

## 3. O que significa `cancelled_job_cycle_mismatch_after_reschedule`?

No worker, após carregar a subscription:

- Compara `subscription.next_billing_date` (normalizado `YYYY-MM-DD`) com `job.cycle_key`.
- Se **diferem**, cancela o job com esse outcome — típico quando a assinatura foi reagendada **depois** do job ter sido enfileirado com o `cycle_key` antigo.

```686:700:packages/backend/src/services/recurringBillingJobService.ts
        const subNextYmd = normalizeSubscriptionNextBillingYmd(subscription.next_billing_date);
        if (subNextYmd && job.cycle_key && subNextYmd !== job.cycle_key) {
          await cancelBillingRecurringJob(
            client,
            job.id,
            BILLING_RECURRING_JOB_OUTCOME.CANCELLED_JOB_CYCLE_MISMATCH,
            JSON.stringify({
              reason: 'subscription_next_billing_changed_since_enqueue',
              job_cycle_key: job.cycle_key,
              subscription_next_billing_date: subNextYmd,
            })
          );
          result.cancelled++;
          continue;
        }
```

**Importante:** não há, após este `continue`, chamada a `tryEnqueue` ou `insertOrReactivateRenewalJob` dentro do worker. O job obsoleto fica `cancelled`; **novo** trabalho depende do scheduler ou do fluxo de PATCH.

---

## 4. Por que não ficou um novo job `pending`?

Fluxos que **criam** `pending` para o ciclo atual da subscription:

| Origem | Condições principais |
|--------|----------------------|
| `enqueueRenewalJobs` (scheduler) | `status = active`, `next_billing_date <= CURRENT_DATE`, janela local Fase 2 elegível, sem `pending`/`processing` para o mesmo `cycle_key`, e `insertOrReactivateRenewalJob` não devolve skip por `completed` |
| `tryEnqueueRenewalJobForSubscriptionId` (pós-PATCH) | Igual à parte de elegibilidade: `next_billing_date <= CURRENT_DATE`, janela local elegível, depois `insertOrReactivateRenewalJob` |

Após **mismatch**, o `cycle_key` do job cancelado é o **antigo**. O **novo** ciclo usa `cycle_key = subscriptions.next_billing_date` atual. Não há bloqueio lógico do UNIQUE nesse caso: é chave diferente da linha cancelada (salvo cenário patológico de voltar à mesma data e reativar — aí `insertOrReactivate` pode **reativar** `cancelled`/`failed` para esse `cycle_key`).

Logo, **fila vazia** = desde o cancelamento **não** correu nenhum caminho que fizesse `INSERT`/`UPDATE` para `pending` no `cycle_key` **novo**. As causas mais frequentes:

1. **Scheduler não executado** (ou intervalo muito largo) após o reagendamento.
2. **`next_billing_date > CURRENT_DATE`** na sessão PostgreSQL — a assinatura **não entra** na query do scheduler nem passa em `tryEnqueue` (`next_billing_after_db_today`).
3. **Fora da janela local** (`outside_local_window`) — scheduler e `tryEnqueue` **não** enfileiram.
4. **`completed_cycle_guard`** — já existe job `completed` para o mesmo `(subscription_id, cycle_key)` (menos comum logo após mismatch se o `cycle_key` mudou).
5. **`active_job_exists`** — já há `pending`/`processing` para aquele `cycle_key` (incompatível com “fila vazia” global, mas pode haver confusão se se olha só o último job por `updated_at`).

O log do utilizador (`batchSize=0`) apenas confirma: **não há jobs `pending`** que cumpram `scheduled_at <= now()` e `retry_at` já vencido — **não** indica falha do worker em si.

---

## 5. O scheduler “deveria” ter criado um novo job?

**Só se, no momento da execução do scheduler,** a subscription satisfizer **todas** as condições de `enqueueRenewalJobs` (incluindo `next_billing_date <= CURRENT_DATE` e janela local).

Não há no código um gatilho automático “ao cancelar por mismatch, re-enfileirar já”. Por desenho, o re-enfileiramento é **eventual** (próximo tick do scheduler ou resultado do PATCH).

Se o reagendamento colocou `next_billing_date` **no futuro** relativamente a `CURRENT_DATE` do servidor, o scheduler **corretamente** **não** enfileira até o dia “abrir” no calendário da sessão DB.

---

## 6. PATCH de próxima renovação — enfileira ou não?

O serviço `patchCustomerSubscriptionNextBillingFromPaidInvoice`:

1. Atualiza `subscriptions.next_billing_date`.
2. Cancela jobs `pending` da subscription.
3. Chama **`tryEnqueueRenewalJobForSubscriptionId(sub.id)`** e devolve `enqueue_after_patch` na resposta.

```68:79:packages/backend/src/services/customerInvoiceRecurrenceNextBillingService.ts
  await pool.query(
    `UPDATE subscriptions
     SET next_billing_date = $1::date, updated_at = now()
     WHERE id = $2 AND tenant_id = $3`,
    [nextYmd, sub.id, tenantId]
  );

  const cancelled = await cancelPendingRenewalJobsForSubscription(sub.id);

  let enqueue_after_patch: PatchNextBillingFromInvoiceResult['enqueue_after_patch'];
  try {
    enqueue_after_patch = await tryEnqueueRenewalJobForSubscriptionId(sub.id);
```

`tryEnqueue` falha sem enfileirar se:

- `next_billing_date > CURRENT_DATE` → `next_billing_after_db_today`
- janela local não elegível → `outside_local_window`
- `insertOrReactivateRenewalJob` retorna `skipped_active_exists` ou `skipped_completed_cycle`

**Validação no teste:** inspecionar resposta JSON do PATCH (`enqueue_after_patch`) e logs `customer_subscription_next_billing_manual` (`enqueue_after_patch_ok`, `enqueue_after_patch_detail`).

---

## 7. `insertOrReactivateRenewalJob` após linha `cancelled`

Para o **`cycle_key` atual** da subscription:

- Se existir linha `cancelled` ou `failed` com o mesmo `(subscription_id, cycle_key)`, faz **UPDATE** para `pending` (**reativar**).
- Se não existir linha, faz **INSERT** novo `pending`.

A linha cancelada por **mismatch** tem `cycle_key` **antigo**; o novo ciclo usa o **novo** `cycle_key` → normalmente **INSERT** (a menos que já exista outra linha para esse par).

---

## 8. Ambiente local: precisa de loop / supervisor?

**Sim, para comportamento contínuo de dev**, alinhado aos comentários dos scripts:

- Worker: idealmente a cada 1–2 min.
- Scheduler: idealmente a cada 10–15 min.

Um único `npx tsx runRecurringWorker.ts` **não** mantém a fila a ser drenada continuamente; apenas processa até 100 jobs `pending` nessa execução e sai.

O `start.bat` do projeto foi ajustado para lançar loops em PowerShell (scheduler/worker) — ver histórico de alteração no repositório.

---

## 9. Correção mais segura (prioridade)

1. **Operacional (imediato):** Garantir **scheduler + worker** em intervalo estável no ambiente onde se testa; confirmar **mesma** `DATABASE_URL` que a API.
2. **Diagnóstico:** Para a `subscription_id`, listar jobs recentes (`status`, `cycle_key`, `completion_outcome`, `updated_at`) e comparar `subscriptions.next_billing_date` com `CURRENT_DATE` e janela local.
3. **Após reagendamento:** Ler **`enqueue_after_patch`** no PATCH; se `outside_local_window` ou `next_billing_after_db_today`, a fila vazia até o próximo tick elegível é **esperada**.
4. **Produto/engine (fase futura, opcional):** Avaliar, com cuidado com idempotência, se o worker ao cancelar por mismatch deve **sugerar** enfileiramento (ex.: chamar `tryEnqueue` uma vez) — hoje **não** existe; mudança exige análise de duplicidade e Fase 2.

---

## Ficheiros analisados

- `packages/backend/src/scripts/runRecurringWorker.ts`
- `packages/backend/src/scripts/runRecurringScheduler.ts`
- `packages/backend/src/services/recurringBillingJobService.ts` (`processNextBatch`, mismatch, `tryEnqueueRenewalJobForSubscriptionId`, `insertOrReactivateRenewalJob`)
- `packages/backend/src/services/customerInvoiceRecurrenceNextBillingService.ts`
