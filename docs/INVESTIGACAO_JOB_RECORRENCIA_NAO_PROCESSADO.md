# Investigação técnica — Job na fila sem nova fatura gerada

## Resumo executivo

Este documento cobre o **motor de processamento** (`billing:worker` → `processNextBatch`), **depois** do job já existir em `billing_recurring_jobs`.

**Conclusões principais (validadas no código):**

1. **Regra temporal Fase 2 (`buildBillingWindowDiagnostic`):** Para o dia civil local em que `next_billing_date` coincide com **`local_now_ymd`**, a elegibilidade exige `local_now_hhmm >= recurring_generate_time_local` — ou seja, **“a partir desse horário” no mesmo dia**, não um único minuto. Para `next_billing_date` **anterior** ao dia local atual (`nextBillingDate < local.ymd`), o ramo temporal **não** exige hora mínima: o ciclo é elegível **o dia inteiro** (comportamento “após o dia”).

2. **Worker e janela:** O worker **revalida** a mesma janela. Se na hora do tick estiver `too_early_local_time` ou `future_local_date`, o job **não** cancela: chama `requeueBillingRecurringJobForWindow` → permanece `pending` com **`retry_at = now + 15 minutos`** (`WINDOW_REQUEUE_MINUTES`). A query de seleção exige `retry_at IS NULL OR retry_at <= now()`, logo o job **não é elegível para pickup** até passar o `retry_at`. Isso pode produzir longos intervalos sem processamento se o relógio local oscilar na fronteira da janela ou se houver requeues repetidos.

3. **Seleção de jobs:** Só entram jobs com `status = 'pending'` **e** `scheduled_at <= now()` **e** (`retry_at` nulo ou já passado). Jobs em **`processing` não são reescolhidos** — não há, neste serviço, rotina de “recuperação de lock órfão” ou timeout para `processing` preso.

4. **Sem nova invoice apesar de “Agendada”:** Possíveis causas no código: (a) **worker não está a correr** ou corre **uma vez** e sai (`runRecurringWorker.ts` processa **um batch** por execução); (b) **`retry_at` futuro** por requeue de janela; (c) **`scheduled_at` no futuro** em relação a `now()` (efeito de timezone na conversão `date → timestamptz`); (d) job preso em **`processing`** após falha do processo; (e) job **completou** com `completed_no_invoice_no_eligible_items` (itens recorrentes não elegíveis no ciclo) — nesse caso **há** conclusão, não “pending” eterno; a UI deveria mudar para “Sem nova fatura” se o insight recarregar.

5. **UI:** “Último processamento” vem de `updated_at` do **último** job por `subscription_id` (ordenado por `updated_at DESC`). Um **requeue** por janela atualiza `updated_at` — pode parecer “atividade recente” sem invoice gerada.

**Sem acesso ao Postgres/logs do ambiente de teste**, a causa raiz **exata** do caso (20:29 vs 20:46) deve ser fechada com queries e logs indicados na secção 8.

---

## 1. Regra temporal real (Fase 2)

**Ficheiro:** `packages/backend/src/services/billingTimeWindowObservability.ts` — `buildBillingWindowDiagnostic`.

Lógica relevante:

- Se `nextBillingDate > local_now_ymd` → `future_local_date`, **não** elegível.
- Senão, se `nextBillingDate === local_now_ymd` **e** `compareHhMm(local.hhmm, generate_time_local_effective) < 0` → `too_early_local_time`, **não** elegível.
- Caso contrário → elegível (`eligible_by_window` ou `timezone_fallback_applied`).

**Interpretação de produto:**

- No **mesmo dia** que o ciclo: a partir do horário configurado (minuto inclusivo), **permanece elegível** até mudar o dia local (não é “só às 09:00:00”).
- Se o `next_billing_date` (como data) já for **antes** do dia civil local atual, não se aplica a comparação de hora naquele dia — entra direto no ramo **elegível**.

O **scheduler** e o **worker** usam a **mesma** função (`buildBillingWindowDiagnostic`).

---

## 2. Job na fila — o que inspecionar em `billing_recurring_jobs`

Executar no ambiente do teste (substituir IDs):

```sql
SELECT id, subscription_id, tenant_id, cycle_key, status,
       scheduled_at, retry_at, locked_at, locked_by,
       attempts, max_attempts,
       result_invoice_id, completion_outcome, completion_detail,
       error_message,
       created_at, updated_at
FROM billing_recurring_jobs
WHERE subscription_id = '<uuid>'
ORDER BY updated_at DESC
LIMIT 5;
```

**Perguntas que a linha responde:**

| Estado no banco | Leitura provável |
|-----------------|------------------|
| `pending`, `retry_at` > now() | À espera da janela ou **requeue Fase 2** — worker não apanha até `retry_at`. |
| `pending`, `retry_at` nulo, `scheduled_at` > now() | Worker **não** seleciona (filtro `scheduled_at <= now()`). |
| `processing`, `locked_at` antigo | Possível **processo morto** sem commit final — não há recuperação automática neste código. |
| `completed`, `completion_outcome = completed_no_invoice_no_eligible_items` | Ciclo **terminou** sem criar `customer_invoice` (regras de itens recorrentes). |
| `failed` | Erro após tentativas; ver `error_message`. |

---

## 3. Worker — fluxo real

**Entrada:** `packages/backend/src/scripts/runRecurringWorker.ts` — chama **`processNextBatch(workerId)` uma vez** e termina. Em produção espera-se **cron** (ex.: cada 1–2 min) ou **loop externo**.

**Seleção (`processNextBatch`):**

```sql
FROM billing_recurring_jobs
WHERE status = 'pending'
  AND scheduled_at <= now()
  AND (retry_at IS NULL OR retry_at <= now())
ORDER BY scheduled_at ASC
LIMIT 100
FOR UPDATE SKIP LOCKED
```

Depois: `UPDATE … SET status = 'processing', locked_at = now(), locked_by = $workerId`.

**Ordem de decisões relevantes:**

1. Subscription existe; **cycle_key** vs `next_billing_date` → pode cancelar se mismatch.
2. **Janela local** (`buildBillingWindowDiagnostic`) → se não elegível: **`requeueBillingRecurringJobForWindow`** (+15 min), **não** gera invoice.
3. `CURRENT_DATE` na sessão DB vs `next_billing_date` → cancelamento `cancelled_next_billing_after_db_today` se aplicável.
4. `customer`: idempotência se já existe invoice do período; senão **`processOneCustomerRenewalJob`**.

**Erros:** `catch` incrementa `attempts`, pode voltar a `pending` com `retry_at` (+1h / +1 dia / +3 dias conforme tentativa), ou `failed` se `max_attempts`.

---

## 4. Locks e `processing` preso

- **Lock:** `locked_at` / `locked_by` são preenchidos ao passar a `processing`.
- **Requeue por janela:** repõe `locked_at = NULL`, `locked_by = NULL`, mantém `pending`.
- **Não** foi encontrada neste ficheiro lógica que repasse jobs `processing` antigos para `pending` (sem migração/jobs operacionais à parte).

**Hipótese de causa raiz:** worker morre após `UPDATE … processing` e antes de completar/cancelar/requeue → linha fica **`processing`** indefinidamente; próximas execuções **ignoram** o job.

---

## 5. `retry_at` e requeue da Fase 2

- Constante **`WINDOW_REQUEUE_MINUTES = 15`**.
- Cada vez que o worker decide “fora da janela”, grava **`retry_at`** no futuro.
- Se o relógio local do tenant ou o `next_billing_date` gerar alternância **eligible / too_early** (ex.: mudança de dia UTC vs local), podem acumular-se requeues.

---

## 6. Geração da invoice (CRM `customer`)

**Ficheiro:** `processOneCustomerRenewalJob` em `recurringBillingJobService.ts`.

Caminhos **sem** nova linha em `customer_invoices`:

- **`includedItems.length === 0`:** completa com `COMPLETED_NO_INVOICE_NO_ELIGIBLE_ITEMS`, avança assinatura — **não é** estado `pending`.
- **Throw** (ex.: sem `current_period_start`, sem fatura anterior para copiar): entra no `catch` do batch → retry ou `failed`.

Para confirmar no caso concreto: ver `completion_outcome` / `completion_detail` da última linha do job.

---

## 7. Ambiente de teste

Verificar:

- Processo **`billing:worker`** (ou cron) **realmente em execução** após 20:29.
- Mesma **connection string** / base que a API usada para criar o job.
- Frequência: um **único** run manual do script não reprocessa até o próximo tick.

**Evidência observada neste workspace (terminal ativo lido):**

- No terminal atualmente aberto, o `last_command` era `npx tsx src/migrate.ts` (migração), não `billing:worker` nem `billing:scheduler`.
- O histórico visível do terminal mostra apenas execução de migrações SQL.
- Isso **não prova** sozinho que não havia outro terminal/processo em paralelo, mas indica que o ambiente pode estar sem consumidor do job no momento do teste.

---

## 8. UI do bloco “Recorrência”

**Ficheiro:** `customerInvoiceRecurrenceInsightService.ts`.

- “Job na fila ou em processamento” = `pending_jobs_count > 0` **ou** último job `pending`/`processing`.
- “Último processamento” = `updated_at` do job mais recente (pode atualizar em **requeue** sem gerar fatura).
- Mensagem “Cobrança na fila…” quando último job está `pending` — **coerente** com `pending` real; **não** distingue `retry_at` futuro na mensagem.

---

## 9. Causa raiz (priorização para fechar no teu ambiente)

1. **Worker inativo ou intervalo demasiado largo** — mais comum em dev.
2. **`retry_at` futuro** por requeue de janela — job “pending” mas invisível à query até à hora.
3. **`scheduled_at` vs `now()`** — job ainda não elegível para pickup.
4. **`processing` órfão** — crash do worker.
5. **Ciclo completado sem invoice** — ver outcome; UI pode estar desatualizada se o insight não foi refetchado.

---

## 10. Plano de correção sugerido (quando sair da investigação)

- **Operacional:** garantir worker + cron; alinhar TZ da sessão Postgres se `CURRENT_DATE` estiver a afastar cancelamentos.
- **Produto/engine:** (fase futura) considerar observabilidade explícita de `retry_at` na UI; considerar **recuperação** de jobs `processing` com `locked_at` antigo (fora do escopo deste documento de investigação).
- **Itens:** se `completed_no_invoice_no_eligible_items`, corrigir dados/itens recorrentes conforme `completion_detail`.

---

## Ficheiros analisados (código)

- `packages/backend/src/services/billingTimeWindowObservability.ts`
- `packages/backend/src/services/recurringBillingJobService.ts` (`processNextBatch`, `requeueBillingRecurringJobForWindow`, `processOneCustomerRenewalJob`, constantes de outcome)
- `packages/backend/src/scripts/runRecurringWorker.ts`
- `packages/backend/src/services/customerInvoiceRecurrenceInsightService.ts`
