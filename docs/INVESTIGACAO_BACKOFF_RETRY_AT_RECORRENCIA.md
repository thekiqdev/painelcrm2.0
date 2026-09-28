# Investigação: `retry_at` / backoff nos jobs de recorrência

## Resumo executivo

A causa raiz dos jobs `pending` com `retry_at` no futuro, mensagem `invalid input syntax for type date: "NaN-NaN-NaN"` e `job_error` nos logs é **normalização incorreta de datas** quando o driver **node-pg** devolve colunas PostgreSQL `DATE` como objetos JavaScript `Date`. O código do worker assume **strings `YYYY-MM-DD`** e faz `new Date(periodStart + 'T12:00:00Z')`. Com `periodStart` sendo um `Date`, a concatenação gera uma string inválida, `Invalid Date`, e funções como `calculateNextBillingDate` / `calculateNextItemDueDate` produzem o literal **`NaN-NaN-NaN`**, que o PostgreSQL rejeita num parâmetro `date`.

**Correção aplicada:** `getSubscriptionById` passa a normalizar `next_billing_date`, `current_period_start` e `current_period_end` com `toYmd()` (já existente no mesmo módulo), garantindo `YYYY-MM-DD` em todo o fluxo do worker.

---

## 1. Onde `retry_at` é definido

### 1.1 Após **erro** (com `error_message`)

No `catch` de `processNextBatch` em `recurringBillingJobService.ts`, após log `job_error`:

- Incrementa `attempts`, calcula `retry_at` (+1h, +1d, +3d), grava `error_message` com a mensagem da exceção, limpa locks, mantém `pending` até `max_attempts`, depois `failed` com `completion_outcome = FAILED_MAX_ATTEMPTS`.

Trecho relevante:

```1305:1341:packages/backend/src/services/recurringBillingJobService.ts
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        billingLog('job', 'job_error', {
          jobId: job.id,
          subscriptionId: job.subscription_id,
          tenantId: job.tenant_id,
          cycle_key_raw: job.cycle_key,
          cycle_key_normalized: normalizeBillingCycleKeyYmd(job.cycle_key),
          error: errMsg,
        });
        const attempts = job.attempts + 1;
        const retryAt = new Date();
        if (attempts === 1) retryAt.setHours(retryAt.getHours() + 1);
        else if (attempts === 2) retryAt.setDate(retryAt.getDate() + 1);
        else retryAt.setDate(retryAt.getDate() + 3);
        // ... UPDATE com retry_at, error_message ...
```

### 1.2 **Fora** da janela horária (sem `error_message`)

`requeueBillingRecurringJobForWindow` define `retry_at` para re-tentar em ~N minutos e **limpa** `error_message`. Não gera `job_error` da mesma forma; o log é `time_window_worker_requeued_outside_window`.

```167:181:packages/backend/src/services/recurringBillingJobService.ts
async function requeueBillingRecurringJobForWindow(
  db: DbQueryable,
  params: { jobId: string; retryAt: Date }
): Promise<void> {
  await db.query(
    `UPDATE billing_recurring_jobs
     SET status = 'pending',
         retry_at = $2,
         locked_at = NULL,
         locked_by = NULL,
         error_message = NULL,
         updated_at = now()
     WHERE id = $1`,
    [params.jobId, params.retryAt.toISOString()]
  );
}
```

**Como distinguir na BD:** backoff “de falha” costuma ter `error_message` preenchido; backoff “de janela” tem `error_message` nulo.

---

## 2. Evidência em ambiente real

Consulta a `billing_recurring_jobs` em `pending` com `retry_at > now()`:

| Campo | Valor típico (caso analisado) |
|--------|-------------------------------|
| `error_message` | `invalid input syntax for type date: "NaN-NaN-NaN"` |
| `attempts` | `1` (primeiro retry +1h) |
| `completion_outcome` | `NULL` |
| `completion_detail` | `NULL` |

Enquanto o job está em `pending` após erro, **`completion_outcome` / `completion_detail` não são atualizados** pelo `catch` — só no `completed`, `cancelled` ou `failed` final. Isso é esperado.

---

## 3. `processOneCustomerRenewalJob` — o que **não** causa backoff

- **`includedItems.length === 0`:** o fluxo **completa** o job com `COMPLETED_NO_INVOICE_NO_ELIGIBLE_ITEMS` (sem lançar exceção). Não gera `retry_at` por este motivo.
- **Erro no gateway (bloco externo `catch`):** em `processOneCustomerRenewalJob`, erros após `createCharge` são **apenas logados** (`console.error`); a função segue para `updateSubscriptionAfterRenewal` e `completeBillingRecurringJob`. Ou seja, **a maioria dos erros de gateway não coloca o job em backoff** (comportamento atual do código).

Backoff neste fluxo exige **exceção** antes de `completeBillingRecurringJob`, por exemplo:

- `Subscription customer sem customer_id`
- `Subscription current_period_start ausente para recorrência por item`
- `Fatura anterior (para copiar itens) não encontrada no subscription`
- `createCustomerInvoice` / `INSERT` em `customer_invoice_items` / `UPDATE` de subscription com valor de data inválido
- `createCharge` quando o erro **não** é tratado pelo `catch` interno e **repropaga** (ex.: após esgotar o caminho de retry “invalid customer” Asaas) — caso mais raro frente ao bug de data

---

## 4. Causa raiz técnica (`NaN-NaN-NaN`)

Funções como `calculateNextBillingDate` e `calculateNextItemDueDate` fazem:

```typescript
const d = new Date(periodStart + 'T12:00:00Z');
```

Se `periodStart` for um **`Date`**, em JavaScript `periodStart + 'T12:00:00Z'` usa a conversão padrão do objeto para string (ex.: data local), **não** `YYYY-MM-DD`, resultando em **`Invalid Date`**. Os componentes `getUTCFullYear()` / mês / dia passam a **NaN** e o retorno vira **`NaN-NaN-NaN`**, que dispara o erro do PostgreSQL ao usar como `date`.

**Confirmação:** reprodução local com `node`:

```javascript
const periodStart = new Date('2026-04-24T00:00:00.000Z');
new Date(periodStart + 'T12:00:00Z'); // Invalid Date
```

O worker obtém a subscrição via `getSubscriptionById`, que lia `subscriptions` diretamente do pool **sem** normalizar tipos — típico de receber `Date` em colunas `DATE`.

Os dados na BD (`next_billing_date`, `current_period_start`, períodos das faturas) podem estar **corretos**; a falha ocorre **só no runtime JS** ao montar strings de data.

---

## 5. A invoice chegou a ser tentada?

Com o erro `invalid input syntax for type date: "NaN-NaN-NaN"`, a falha ocorre ao usar uma data inválida numa operação SQL (criação da fatura, itens ou atualização da assinatura). Em geral:

- Se o erro acontece **em** `createCustomerInvoice` ou no **primeiro** `INSERT` de itens → **não** há invoice persistida nessa execução.
- O log `customer_renewal_invoice_persisted` **não** aparece para essa tentativa.

Para confirmar por job: ausência de nova linha em `customer_invoices` para o `period_start` = `next_billing_date` esperado após a falha.

---

## 6. Loop de retry

Sim: enquanto a causa raiz existir, cada tentativa falha da mesma forma, `attempts` aumenta e o job entra em backoff exponencial até `max_attempts` → `failed` com `FAILED_MAX_ATTEMPTS`. **Corrigir dados sozinhos não resolve** se o bug for só de tipo (`Date` vs string); é necessário **normalizar no código** (ou garantir strings em todo o pipeline).

---

## 7. Correção mais segura

1. **Implementada:** normalizar em `getSubscriptionById` com `toYmd()` para `next_billing_date`, `current_period_start` e `current_period_end`. Ponto único, alinhado ao tipo `SubscriptionRow` (datas como string), beneficia todo o worker e reduz risco de regressão em outros usos do mesmo getter.

2. **Alternativa complementar (defesa em profundidade):** no início de `calculateNextBillingDate` / `calculateNextItemDueDate`, aceitar `Date` ou string via `toYmd` — útil se no futuro outra origem passar `Date` sem passar por `getSubscriptionById`.

3. **Operacional:** após deploy, jobs `pending` com `error_message` antiga podem ser reprocessados quando `retry_at <= now()`; opcionalmente limpar `retry_at` / `error_message` para um job específico **após** validar o fix, se quiser forçar processamento imediato.

---

## 8. Referências de código

| Tópico | Ficheiro |
|--------|----------|
| `retry_at` + `job_error` | `packages/backend/src/services/recurringBillingJobService.ts` |
| Janela horária + `error_message` NULL | `requeueBillingRecurringJobForWindow` (mesmo ficheiro) |
| `batch_empty_retry_backoff` | `processNextBatch` (mesmo ficheiro) |
| Renovação CRM + datas | `processOneCustomerRenewalJob` (mesmo ficheiro) |
| Normalização `toYmd` | `packages/backend/src/services/billingSubscriptionService.ts` |
| `getSubscriptionById` (fix) | `packages/backend/src/services/billingSubscriptionService.ts` |

---

*Documento gerado na sequência da investigação de backoff em jobs de recorrência (abril de 2026).*
