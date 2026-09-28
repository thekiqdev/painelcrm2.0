# Correção — «Alterar próxima renovação» e agendamento de jobs

## Resumo

Correção incremental para o caso em que a **próxima data da assinatura** (`subscriptions.next_billing_date`) era atualizada pelo CRM, mas **nenhum job** `pending` aparecia em `billing_recurring_jobs`, deixando a UI em «aguardando scheduler/worker» sem progresso.

## Causa raiz (comportamento anterior)

1. **`INSERT … ON CONFLICT (subscription_id, cycle_key) DO NOTHING`**  
   Se existia uma linha **cancelada** ou **falhada** com o mesmo `cycle_key` (por exemplo após cancelar jobs pendentes ao reagendar), o **novo INSERT era ignorado** e o ciclo ficava **sem job ativo** para sempre naquele `cycle_key`.

2. **Dependência exclusiva do cron** após o PATCH: mesmo com data e janela local já elegíveis, o utilizador tinha de esperar o próximo `billing:scheduler`.

3. **Edição da fatura atual** (`PATCH /api/customer-invoices/:id`) **não** altera `next_billing_date` — apenas a UI podia sugerir confusão entre `due_date` e ciclo.

## Por que editar a invoice não «reagia» a recorrência

O motor usa **`subscriptions.next_billing_date`**. O PATCH genérico da fatura altera **`customer_invoices`** (vencimento, itens, gateway), não a assinatura. Comportamento intencional; a correção reforça isso na UI e no insight.

## Como o fluxo «Alterar próxima renovação» passou a funcionar

1. **`PATCH /api/customer-invoices/:id/recurrence/next-billing`** continua a:
   - validar fatura paga, `origin=subscription`, assinatura CRM ativa;
   - fazer `UPDATE subscriptions SET next_billing_date = …`;
   - cancelar jobs com `status = 'pending'` para essa assinatura.

2. **Imediatamente após**, o backend chama **`tryEnqueueRenewalJobForSubscriptionId`** (mesma lógica do scheduler):
   - `next_billing_date <= CURRENT_DATE` (sessão Postgres);
   - janela local Fase 2 (`buildBillingWindowDiagnostic`);
   - **`insertOrReactivateRenewalJob`**:
     - se já existe `pending`/`processing` para o mesmo `cycle_key` → não duplica;
     - se existe linha **`cancelled` ou `failed`** com o mesmo `cycle_key` → **UPDATE** para `pending`, limpando `retry_at`, outcome, etc.;
     - caso contrário → **INSERT** novo job.

3. O **scheduler** (`enqueueRenewalJobs`) passou a usar a **mesma** função `insertOrReactivateRenewalJob`, mantendo um único critério de enfileiramento.

## Jobs pendentes / antigos

- **Pendentes** na mesma assinatura: continuam a ser **cancelados** no PATCH (evita fila obsoleta).
- **`processing`** com `cycle_key` diferente do `next_billing_date` atual: o **worker** cancela com outcome `cancelled_job_cycle_mismatch_after_reschedule` ao detetar dessincronia (releitura da subscription após o PATCH).

## Regra quando a nova data já está elegível

- Se **CURRENT_DATE** do servidor já cobre o dia do ciclo **e** a **hora local do tenant** já passou do mínimo configurado, o PATCH **tenta enfileirar na hora** (insert ou reativação).
- Se a data do ciclo está **no futuro** em relação a `CURRENT_DATE` (ex.: fuso/calendário do BD), **não** há insert: o scheduler fará quando o dia for elegível.
- Se já existe job **`completed`** para o mesmo `cycle_key`, **não** se reabre fila (idempotência / evitar segunda cobrança do mesmo ciclo sem passar pelo worker).

## UI — diferenciar cobrança atual vs recorrência futura

- **`InvoiceRecurrenceBlock`**: nota explícita de que «Próxima cobrança prevista» vem da **assinatura**, não do vencimento da fatura atual.
- **`CustomerInvoiceNew`**: no fluxo **Editar fatura** com assinatura, alerta a explicar que mudar vencimento/itens **não** reprograma o ciclo; fatura paga + `?flow=invoice` redireciona com mensagem.
- **`CustomerInvoiceDetail`**: «Alterar próxima renovação» navega para **`/edit?flow=renewal`**.
- **Insight** (`getCustomerInvoiceRecurrenceInsight`): avisos quando `due_date` da fatura ≠ `next_billing_date` da assinatura; quando não há job mas a data já «passou» no calendário do servidor, texto operacional sobre scheduler/worker e tentativa de enqueue no PATCH.

## Ficheiros principais alterados

| Ficheiro | Alteração |
|----------|-----------|
| `packages/backend/src/services/recurringBillingJobService.ts` | `insertOrReactivateRenewalJob`, `tryEnqueueRenewalJobForSubscriptionId`, scheduler unificado, worker `cycle_key` vs subscription, novo outcome |
| `packages/backend/src/services/customerInvoiceRecurrenceNextBillingService.ts` | Chamada ao try-enqueue após PATCH; resposta com `enqueue_after_patch` |
| `packages/backend/src/services/customerInvoiceRecurrenceInsightService.ts` | Dicas `problem_hint_pt` (due vs next; sem job + data já no BD) |
| `packages/backend/src/controllers/customerInvoicesController.ts` | Comentário da rota |
| `src/services/customerInvoices.ts` | Tipo `enqueue_after_patch` / `RecurrenceNextBillingEnqueueReason` |
| `src/components/invoices/InvoiceRecurrenceBlock.tsx` | Help text sob próxima cobrança |
| `src/pages/CustomerInvoiceNew.tsx` | Toasts pós-PATCH, alertas edição vs renovação, `?flow=` |
| `src/pages/CustomerInvoiceDetail.tsx` | Link explícito `?flow=renewal` |

## Riscos remanescentes

- **`CURRENT_DATE` do Postgres** vs «hoje» no fuso do utilizador: se divergirem, o enqueue imediato pode falhar com `next_billing_after_db_today` até o calendário do servidor alinhar (comportamento já documentado na investigação).
- **Job `completed` no mesmo `cycle_key`**: não se reativa automaticamente; requer análise manual se for caso legítimo de «refazer» o mesmo ciclo.
- **Corrida** entre worker e PATCH: coberta por verificação de `cycle_key` no worker; cancelamentos `processing` via PATCH não são forçados para evitar corrida agressiva com o lock do worker.

## Checklist de aceite (operacional)

- [ ] Alterar próxima renovação persiste `subscriptions.next_billing_date`
- [ ] Jobs `pending` antigos deixam de bloquear; `cancelled`/`failed` no mesmo `cycle_key` são reativados quando elegível
- [ ] Com data/hora elegíveis, aparece job `pending` sem esperar só pelo cron
- [ ] Editar fatura (PATCH genérico) não altera assinatura; UI deixa isso claro
- [ ] UI diferencia assinatura vs vencimento da fatura atual
- [ ] Idempotência: não duplicar `pending`/`processing` no mesmo `cycle_key`; não reabrir `completed`
- [ ] Faturamento manual / gateway: fluxos não alterados por esta mudança
