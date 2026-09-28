# Investigação técnica — Fatura recorrente não gerada no dia esperado

## Resumo executivo

O motor de recorrência **só gera fatura quando**:

1. O processo **`billing:scheduler`** (`enqueueRenewalJobs`) corre com sucesso e **insere** uma linha em `billing_recurring_jobs`.
2. O processo **`billing:worker`** (`processNextBatch`) **apanha** esse job, passa nas validações (incluindo janela local da Fase 2) e executa `processOneCustomerRenewalJob` (ou caminho idempotente).

O bloco de UI **“Recorrência”** na fatura combina `subscriptions.next_billing_date` (como “próxima cobrança prevista”) com o **último registo** em `billing_recurring_jobs` para essa `subscription_id`. As mensagens **“Sem processamento recente registrado”** e **“Ainda não há registro de job de recorrência — aguardando scheduler/worker”** correspondem, no código atual, a **`billing_recurring_jobs` sem qualquer linha** para essa assinatura (`latest` é `null` no serviço de insight).

**Conclusão principal (causa raiz mais provável no cenário descrito):** o sistema **nunca chegou a criar um job** para essa subscrição (ou o job nunca existiu nessa base), o que é compatível com:

- **Scheduler e worker não estarem a correr** no ambiente de teste (apenas API + UI), **ou**
- A assinatura **não entrar** na query do scheduler por causa de **`subscriptions.next_billing_date` vs `CURRENT_DATE` na sessão PostgreSQL** (efeito “calendário do servidor”), **ou**
- O scheduler **descarta** a assinatura na **Fase 2** (`future_local_date` / `too_early_local_time`), **ou**
- `INSERT` em `billing_recurring_jobs` falha silenciosamente com **`ON CONFLICT (subscription_id, cycle_key) DO NOTHING`** se já existir linha com o mesmo `cycle_key` (ver secção 7).

Não foi possível reproduzir o caso concreto sem acesso ao vosso Postgres/logs; abaixo está o que o **código** garante e o que deve ser **validado em produção/teste**.

**Segunda trilha (secção 7):** se o utilizador **não** usou “Alterar próxima renovação” (`PATCH …/recurrence/next-billing`) e apenas **editou a fatura em aberto** (`due_date` / itens), o motor **não** é reagendado — `subscriptions.next_billing_date` pode ficar inalterado; o insight continua coerente com a subscription.

---

## 1. Fonte de verdade do motor vs UI

| Conceito | Fonte usada pelo motor | O que a UI “Recorrência” mostra |
|----------|-------------------------|----------------------------------|
| Dia do ciclo a cobrar | `subscriptions.next_billing_date` (DATE) | `next_charge_date` = mesmo campo |
| Job de trabalho | `billing_recurring_jobs` (`cycle_key` = tipicamente o YYYY-MM-DD do `next_billing_date` na altura do enqueue) | Último job por `subscription_id` + `tenant_id` ordenado por `updated_at DESC` |
| Data de vencimento da fatura atual (`customer_invoices.due_date`) | **Não** é o gatilho do scheduler por si só | Não substitui `next_billing_date` no insight |

**Pergunta do teste:** “Quando o utilizador altera a próxima renovação, atualiza `subscriptions.next_billing_date`?”

- **Sim**, se usou **`PATCH /api/customer-invoices/:id/recurrence/next-billing`** (“Alterar próxima renovação” em fatura **paga**): o serviço `patchCustomerSubscriptionNextBillingFromPaidInvoice` faz `UPDATE subscriptions SET next_billing_date = …` e cancela jobs **`pending`** dessa subscrição.
- **Não necessariamente**, se apenas editou a fatura **em aberto** (itens / `due_date`) pelo fluxo normal de PATCH de invoice: isso pode **não** alinhar `subscriptions.next_billing_date` com o que o utilizador considera “próxima cobrança”. O insight continua a ler a **subscription**.

---

## 2. Scheduler — o que o código faz

**Ficheiro:** `packages/backend/src/services/recurringBillingJobService.ts` — `enqueueRenewalJobs()`.

**Query base (candidatos):**

```sql
WHERE s.status = 'active' AND s.next_billing_date <= CURRENT_DATE
```

**Pontos críticos:**

1. **`CURRENT_DATE`** é o “hoje” da **sessão PostgreSQL**, não o “hoje local do tenant”. Se o utilizador e o CRM estão num fuso **à frente** do calendário que o Postgres ainda usa (ex.: já é “hoje” no Brasil mas o `CURRENT_DATE` no BD ainda é o dia anterior), então `next_billing_date` configurado para “hoje” local pode ser **maior** que `CURRENT_DATE` e a assinatura **nem aparece** na lista de candidatos — **nenhum job é criado**, independentemente do horário de geração.

2. **Fase 2 — janela local:** para cada candidato, `buildBillingWindowDiagnostic` compara:
   - `next_billing_date` com `local_now_ymd` (timezone efetiva do tenant via `resolveTenantBillingPreferences`);
   - se mesmo dia, exige `local_now_hhmm >= recurring_generate_time_local` efetivo.  
   Motivos de skip: `future_local_date`, `too_early_local_time`.

3. **Job já pendente:** se existir linha com `subscription_id`, `cycle_key` e `status IN ('pending','processing')`, **não** insere outro.

4. **Inserção:** `INSERT … ON CONFLICT (subscription_id, cycle_key) DO NOTHING` — ver secção 7.

**Logs úteis:** `enqueue_run`, `time_window_scheduler_skip_outside_window`, `time_window_scheduler_eligible` (verbose), `enqueue_job_inserted`, `enqueue_done` (agregados). Variáveis de ambiente: `BILLING_SCHEDULER_VERBOSE`, `BILLING_TIME_WINDOW_VERBOSE`.

**Processo:** `npx tsx src/scripts/runRecurringScheduler.ts` (cron em produção). **Sem isto a correr**, não há fila nova (salvo outro orquestrador).

---

## 3. Worker — o que o código faz

**Ficheiro:** `packages/backend/src/services/recurringBillingJobService.ts` — `processNextBatch()`.

**Seleção de jobs:**

```sql
WHERE status = 'pending'
  AND scheduled_at <= now()
  AND (retry_at IS NULL OR retry_at <= now())
```

**`scheduled_at` na inserção:** `($next_billing_date::date)::timestamptz` — a meia-noite interpretada na **timezone da sessão** ao converter `date` → `timestamptz`. Em cenários limite, `now()` antes dessa meia-noite (no mesmo “dia civil” dependendo do TZ) pode atrasar o primeiro pickup; em geral, no dia seguinte ao UTC torna-se elegível.

**Fase 2 no worker:** revalida a mesma janela; se “cedo demais”, **requeue** com `retry_at = now + 15 min` (não cancela).

**Validações adicionais:** `next_billing_date > dbToday` (via `CURRENT_DATE` na sessão do worker) → job **cancelado** com outcome `cancelled_next_billing_after_db_today`.

**Processo:** `npx tsx src/scripts/runRecurringWorker.ts` (ou equivalente em deploy).

---

## 4. Impacto da Fase 2 no cenário “hoje + horário já passado”

Para a assinatura ser enfileirada, no **scheduler**:

- `next_billing_date` **não pode** ser `> local_now_ymd` (senão `future_local_date`);
- se `next_billing_date === local_now_ymd`, o relógio local do tenant tem de ser `>= recurring_generate_time_local` (senão `too_early_local_time`).

**Validação recomendada no teste:**

1. Ler `tenants.timezone`, `recurring_generate_time_local` para o `tenant_id` da subscrição.
2. Comparar com o que a UI de Configurações > Cobrança gravou (Fase 1/3).
3. Ativar `BILLING_TIME_WINDOW_VERBOSE=true` e reproduzir um tick do scheduler para ver `local_now_ymd`, `local_now_hhmm`, `window_reason`.

---

## 5. Ação “Alterar próxima renovação”

**Endpoint:** `PATCH /api/customer-invoices/:id/recurrence/next-billing`  
**Corpo:** `{ "next_billing_date": "YYYY-MM-DD" }`  
**Serviço:** `patchCustomerSubscriptionNextBillingFromPaidInvoice`

**Efeitos:**

- Atualiza **`subscriptions.next_billing_date`**.
- Cancela apenas jobs com **`status = 'pending'`** (não mexe em `processing`/`completed`/`failed` da mesma forma em massa).
- **Não** cria job novo — o **scheduler** tem de correr depois.

Se após o PATCH o utilizador esperar geração **imediata** sem scheduler, verá na UI “aguardando scheduler/worker” até o próximo `enqueueRenewalJobs` bem-sucedido.

---

## 6. UI do bloco “Recorrência” — fiel ao estado real?

**Ficheiros:**  
- Backend: `packages/backend/src/services/customerInvoiceRecurrenceInsightService.ts`  
- Frontend: `src/components/invoices/InvoiceRecurrenceBlock.tsx`

**Comportamento:**

- **“Próxima cobrança prevista”** = `subscriptions.next_billing_date` (via insight).
- **“Último processamento”** = `updated_at` do **último** job (`billing_recurring_jobs` por `subscription_id` + `tenant_id`). Se **não há linhas**, mostra **“Sem processamento recente registrado.”**
- **“Último resultado”** = se **não há nenhum job** (`!latest`), mostra **“Ainda não há registro de job de recorrência — aguardando scheduler/worker.”**
- Badge **“Agendada”** nesse ramo é o `visual_tag` padrão `scheduled` — **não** implica que exista job `pending` (`is_queued` pode ser `false`).

**Conclusão:** a UI **pode estar correta** e a refletir ausência total de jobs, enquanto a “próxima cobrança” já está no passado/hoje na subscription — o gap é **operacional** (scheduler/worker ou pré-filtro SQL), não necessariamente um bug de desenho da UI.

---

## 7. Segunda trilha — Fatura / renovação “alterada” foi realmente agendada no motor?

**Objetivo:** quando não há evidência de bug no scheduler/worker, verificar se o teste alterou o **campo que o motor usa** ou apenas campos da **fatura atual**.

### 7.1 Dois fluxos de edição no CRM (comprovado no código)

| Fluxo | Quando | Endpoint / serviço | Atualiza `subscriptions.next_billing_date`? | Cria ou reagenda job? |
|--------|--------|-------------------|-----------------------------------------------|------------------------|
| **Renovação (próxima data)** | Fatura **paga**, `editFlow === "renewal"` em `CustomerInvoiceNew.tsx` | `PATCH /api/customer-invoices/:id/recurrence/next-billing` → `patchCustomerSubscriptionNextBillingFromPaidInvoice` | **Sim** (`UPDATE subscriptions`) | **Não** — cancela jobs `pending`; novo job só após **scheduler** |
| **Edição da cobrança atual** | Fatura **não paga** (pendente, etc.), formulário completo | `PATCH /api/customer-invoices/:id` → `patchCustomerInvoiceWithGateway` (`customerInvoiceAdminService.ts`) | **Não** — apenas `customer_invoices` (ex.: `due_date`, itens, gateway) | **Não** |

**Evidência:** `patchCustomerInvoiceWithGateway` só faz `UPDATE customer_invoices` para `due_date`, `description`, `amount_cents`, etc. **Não existe** `UPDATE subscriptions` nesse caminho.

### 7.2 Consequência para o cenário de teste

- Se o utilizador **só mudou o vencimento (`due_date`) ou itens** da fatura **em aberto**, o valor **`subscriptions.next_billing_date`** pode **permanecer** o que estava (ex.: ainda no futuro em relação ao que o utilizador imagina).
- O bloco **“Recorrência”** mostra **sempre** `next_charge_date = subscriptions.next_billing_date`, **não** o `due_date` da fatura aberta.
- **Sintoma possível:** “próxima cobrança” na cabeça do utilizador = data que editou na fatura; **no ecrã** continua a aparecer a data da **subscription** (ou o contrário, se houver confusão). O motor **só** olha para a subscription na fase de enqueue.

### 7.3 Como provar no teste concreto

1. Anotar o `subscription_id` da fatura (`customer_invoices.subscription_id`).
2. `SELECT next_billing_date, due_date FROM customer_invoices WHERE id = '…';` e `SELECT next_billing_date FROM subscriptions WHERE id = '…';`
3. Se `due_date` foi alterado mas `subscriptions.next_billing_date` **não** bate com a expectativa de “hoje”, o agendamento **não** foi feito pelo fluxo de edição de fatura — **não é falha do insight**, é **fluxo de edição que não toca na assinatura**.

### 7.4 Conclusão da segunda trilha

**Se o motor estiver correto e os processos a correr**, mas o teste usou **apenas edição de fatura em aberto**, então a “renovação” **não foi agendada** no sentido do billing engine: **não houve reprogramação de `next_billing_date`**. A correção de produto mais segura (fase seguinte) pode ser: aviso na UI ao editar `due_date` em fatura `origin=subscription` a explicar que a **próxima geração** segue `subscriptions.next_billing_date`; ou oferecer ação explícita para alinhar (com regras de negócio definidas), **sem** misturar silent update com edição de vencimento.

---

## 8. `ON CONFLICT` e `cycle_key` — armadilha

A tabela tem **`UNIQUE(subscription_id, cycle_key)`**. O scheduler faz:

```sql
INSERT INTO billing_recurring_jobs (…, cycle_key, …)
VALUES (…, next_billing_date, …)
ON CONFLICT (subscription_id, cycle_key) DO NOTHING
```

Se existir **qualquer** linha anterior com o mesmo par (ex.: job antigo `completed`/`cancelled` com o mesmo `cycle_key` — dependendo de como o `cycle_key` foi gerido em versões anteriores), o `INSERT` pode **não criar** nova linha `pending` e o scheduler incrementa `skipped` (com log verbose `enqueue_skipped_conflict_or_duplicate`).

**Validação:** `SELECT * FROM billing_recurring_jobs WHERE subscription_id = '…' ORDER BY created_at;`

---

## 9. Ambiente local vs produção

O teste descrito é típico quando:

- Correm **apenas** `npm run dev` (API) e frontend, **sem** `billing:scheduler` e **sem** `billing:worker` nos intervalos esperados.

**Produção** costuma ter cron/supervisor para estes scripts; **local** muitas vezes não.

---

## 10. Respostas objetivas (checklist de confirmação)

| Pergunta | Como confirmar |
|----------|----------------|
| O problema é scheduler, worker, subscription, UI ou teste? | Ver secções 2–6; começar por **existência de linhas** em `billing_recurring_jobs` e **logs** do scheduler. |
| `next_billing_date` foi alterado no teste? | `SELECT next_billing_date FROM subscriptions WHERE id = '…';` + histórico da ação (PATCH next-billing vs edição de invoice). |
| Existe job? | `SELECT id, status, cycle_key, scheduled_at, retry_at, completion_outcome FROM billing_recurring_jobs WHERE subscription_id = '…';` |
| Janela local elegível? | Logs com `BILLING_TIME_WINDOW_VERBOSE` ou reproduzir `buildBillingWindowDiagnostic` com os mesmos inputs. |
| UI reflete o real? | Sim, se `latest` é `null` — mostra exatamente “sem job”. |
| A fatura “alterada” reagendou o motor? | Só se foi `PATCH …/recurrence/next-billing` (fatura paga). `PATCH` geral da fatura **não** altera `subscriptions.next_billing_date` (secção 7). |
| Causa raiz principal (hipótese)? | **(A)** processos scheduler/worker inativos; **(B)** `next_billing_date > CURRENT_DATE` no Postgres; **(C)** skip Fase 2; **(D)** conflito `ON CONFLICT`; **(E)** subscrição não `active` / tipo errado no worker; **(F)** teste alterou só `due_date`/itens sem tocar na subscription. |
| Correção mais segura (planeamento)? | 1) Garantir deploy dos scripts + monitorização; 2) Documentar para QA que “hoje” na UI vs `CURRENT_DATE` do BD pode diferir; 3) Melhorar insight/UI para distinguir “sem job” vs “job pendente” e opcionalmente mostrar último motivo de skip (requer persistência ou logs); 4) Rever semântica `ON CONFLICT` se for causa confirmada; 5) Esclarecer na UX diferença entre vencimento da fatura atual e `next_billing_date` (secção 7). |

---

## 11. Plano de correção sugerido (sem implementação nesta fase)

1. **Operacional:** confirmar que `runRecurringScheduler` e `runRecurringWorker` executam na mesma base que a API de teste.
2. **Dados:** para a `subscription_id` em causa, inspecionar `subscriptions`, `billing_recurring_jobs`, `tenants` (timezone + horário).
3. **Logs:** um ciclo do scheduler com `BILLING_TIME_WINDOW_VERBOSE=true` e `BILLING_SCHEDULER_VERBOSE=true`.
4. **Produto/UX (fase seguinte):** se o diagnóstico for frequente, considerar mensagens na UI quando `next_charge_date <= today` e `pending_jobs_count = 0` e `latest IS NULL` — ex.: “Nenhum job na fila; confirme se o scheduler está a correr ou se a data de cobrança já é elegível no servidor.”

---

## Ficheiros analisados (investigação)

- `packages/backend/src/services/recurringBillingJobService.ts`
- `packages/backend/src/services/billingTimeWindowObservability.ts`
- `packages/backend/src/services/tenantBillingPreferencesService.ts`
- `packages/backend/src/services/customerInvoiceRecurrenceInsightService.ts`
- `packages/backend/src/services/customerInvoiceRecurrenceNextBillingService.ts`
- `packages/backend/src/controllers/customerInvoicesController.ts`
- `packages/backend/src/scripts/runRecurringScheduler.ts`
- `database/init/69_billing_recurring_jobs.sql`
- `src/components/invoices/InvoiceRecurrenceBlock.tsx`
- `src/pages/CustomerInvoiceNew.tsx` (fluxos `invoice` vs `renewal`)
- `src/services/customerInvoices.ts`
- `packages/backend/src/services/customerInvoiceAdminService.ts` (`patchCustomerInvoiceWithGateway` — sem `subscriptions`)
