# Investigação técnica: faturas recorrentes e link público

**Escopo:** apenas investigação e documentação da causa raiz — sem alterações de código nesta fase.  
**Data:** 2026-04-22.

---

## Resumo executivo

1. **A recorrência CRM (`subscriptions.type = 'customer'`) não roda “dentro” da API HTTP principal.** O motor depende de **dois processos separados**: um **scheduler** que enfileira jobs e um **worker** que os processa. Se em produção só existir o processo da API (por exemplo, um único container/serviço Node sem cron ou segundo serviço), **nenhuma fatura nova será gerada** pelo ciclo, embora a primeira fatura (criada na UI) exista com link.

2. **Quando o worker executa, é possível o job concluir com sucesso sem criar fatura:** em `processOneCustomerRenewalJob`, se **nenhum item** da fatura anterior passar nos filtros de recorrência, o código **avança a assinatura** (`next_billing_date`, períodos, contador) e marca o job como `completed` **sem** `result_invoice_id`. Nesse caso **não há nova linha em `customer_invoices`**, logo **não há novo `payment_token`** — o sintoma externo é “a recorrência correu, mas não há fatura nem link”.

3. **O link público (`/pay/:token` → `get_customer_invoice_by_payment_token`) não discrimina `invoice_type`.** Faturas geradas pelo worker (`origin = 'subscription'`, `invoice_type = 'recurring'`) **devem** ser resolvidas da mesma forma que manuais, **desde que** existam no banco com `payment_token` preenchido. Ou seja: se o link “não funciona” para recorrência, na maior parte dos cenários a causa não é o SQL do token, e sim **fatura inexistente**, **token inexistente** (legado) ou **processo operacional** (scheduler/worker).

4. **Risco adicional:** o worker valida `subscription.next_billing_date > today` usando `today` em **UTC** (`toISOString().slice(0, 10)`), enquanto o scheduler usa `CURRENT_DATE` no Postgres (timezone da sessão/servidor). Em bordas de dia pode haver **jobs cancelados** (`cancelled`) ou comportamento inesperado se servidor e convenção de datas não forem alinhados.

---

## Arquitetura atual encontrada

### Tabelas principais

| Tabela | Papel |
|--------|--------|
| `subscriptions` | Assinatura universal: `type` `saas` \| `customer`; `next_billing_date`, `current_period_start` / `current_period_end`, `status`, `tenant_id`, `customer_id` (cliente CRM quando `customer`). |
| `billing_recurring_jobs` | Fila: um registro por `(subscription_id, cycle_key)`; estados `pending` → `processing` → `completed` \| `failed` \| `cancelled`. |
| `customer_invoices` | Faturas CRM; campos relevantes: `payment_token`, `subscription_id`, `period_start` / `period_end`, `origin`, `invoice_type`, `gateway*`, `status`. |
| `customer_invoice_items` | Itens; colunas avançadas (`is_recurring`, `recurring_interval`, `scheduled_due_date`) quando migração aplicada. |

### Função SQL pública

- `get_customer_invoice_by_payment_token(uuid)` — `SECURITY DEFINER`, filtra apenas por `payment_token`; **retorna também** `origin` e `invoice_type` (não há exclusão de `recurring`).

---

## Como a recorrência funciona hoje (CRM / customer)

1. **Criação inicial:** `createRecurringManualInvoice` (`customerBillingService.ts`) cria `subscription` (`type: 'customer'`, `next_billing_date` = fim do primeiro período, `current_period_start` / `current_period_end` preenchidos) e em seguida chama `createManualInvoice` → `createManualCustomerInvoice` (fatura `origin=manual`, depois `updateCustomerInvoiceSubscriptionLink` define `subscription_id`, `period_*`, `origin='subscription'`, `invoice_type='recurring'`). A primeira fatura recebe **`payment_token`** no insert manual.

2. **Próximos ciclos:** o **scheduler** (`enqueueRenewalJobs`) seleciona assinaturas `active` com `next_billing_date <= CURRENT_DATE` e insere jobs em `billing_recurring_jobs` (idempotência por `cycle_key`).

3. O **worker** (`processNextBatch`) pega jobs `pending`, revalida assinatura, e para `type === 'customer'` chama `processOneCustomerRenewalJob` se ainda **não** existir fatura para `(subscription_id, period_start = next_billing_date)`.

4. **Geração da fatura:** `createCustomerInvoice` insere linha com `payment_token = randomUUID()`, `origin='subscription'`, `invoice_type='recurring'`, `status='pending'`. Itens são copiados da fatura do período anterior (`current_period_start` da assinatura antes do renewal), com regras D5/E2 (ver abaixo).

5. **Gateway:** tentativa de `createCharge` com `billingType: 'crm'`; erro de gateway é logado em `console.error` mas **não impede** a persistência da fatura (comportamento alinhado ao fluxo SaaS no mesmo arquivo).

---

## Como o agendamento / cron / worker funciona hoje

| Pergunta | Resposta |
|----------|----------|
| Existe cron dentro do `index.ts` da API? | **Não** foi identificado agendamento de recorrência no bootstrap da API. |
| O que existe no repositório? | Scripts: `runRecurringScheduler.ts` e `runRecurringWorker.ts`; npm scripts `billing:scheduler` e `billing:worker` em `packages/backend/package.json`. |
| Frequência esperada? | Comentários nos scripts sugerem cron a cada **10–15 min** (scheduler) e **1–2 min** (worker) — **configuração de infra**, não do código. |
| O worker faz mais alguma coisa? | Sim: chama `processChildItemDueInvoices` (faturas “filhas” por item com `scheduled_due_date` fora do ciclo), sujeito a `BILLING_CHILD_ITEM_INVOICES_ENABLED` (default: ativo, exceto se `=false`). |
| Logs? | `billingLog` emite linhas `[BILLING]` JSON (`scheduler`, `worker`, `job`, `invoice`). Falhas definitivas de job: `notifyBillingJobFailed`. |

**Conclusão operacional:** em produção, a recorrência **só é “de ponta a ponta”** se existirem processos (ou cron) executando **explicitamente** esses scripts com o mesmo `.env`/DB da API.

---

## Comparação: fatura manual vs fatura gerada na recorrência

| Aspeto | Manual (primeira da recorrência) | Renovada pelo worker |
|--------|----------------------------------|----------------------|
| Criação | `createManualCustomerInvoice` + opcional fluxo gateway em `createManualInvoice`; depois link à subscription | `createCustomerInvoice` |
| `origin` / `invoice_type` | Inicialmente `manual`; após link: `subscription` / `recurring` | `subscription` / `recurring` |
| `payment_token` | Gerado no insert manual | Gerado no insert do worker |
| Itens | Da requisição UI; default `is_recurring ?? true` quando colunas existem | Copiados da fatura anterior; só linhas com `is_recurring` e regras de data |
| `invoice_number` | Padrão manual | `generateInvoiceNumber` no serviço de invoice |
| Listagem / detalhe API | `selectList` inclui `payment_token` (`customerInvoiceSchema.ts`) | Idem |
| Página pública | `getByPaymentToken` sem filtro por tipo | Idem |

**Diferença relevante para o sintoma “sem link”:** na renovação, **se nenhum item entra em `includedItems`**, **não há insert** de fatura → **não há token novo**. Na manual, quase sempre há itens ou valor.

---

## Investigação do link público

- **Geração:** `payment_token` é definido na criação (`createManualCustomerInvoice`, `createCustomerInvoice`, `createChildCustomerInvoice`).
- **Resolução:** `get_customer_invoice_by_payment_token` + `getByPaymentToken` no backend.
- **UI interna:** `CustomerInvoiceDetail.tsx` mostra o link se `invoice.payment_token` existir.
- **UI pública:** rota `/pay/:token` em `App.tsx` → `CustomerInvoicePay.tsx`.

**Hipóteses compatíveis com o código (por ordem de plausibilidade):**

1. **Worker/scheduler não rodam em produção** → nenhuma fatura nova → usuário testa link da fatura antiga ou espera uma nova que nunca veio.  
2. **Job completa sem fatura** (`includedItems.length === 0`) → assinatura avança; usuário vê “próximo ciclo” no sentido de datas mas não nova cobrança/link.  
3. **Itens da primeira fatura com `is_recurring = false`** (explícito na UI/API) → todas as linhas excluídas no ciclo.  
4. **Itens com `scheduled_due_date` desalinhada do `period_start` do ciclo** → linha vai para fila de faturas filhas (E2), não para a fatura “mãe”; se E2 ou dados estiverem incorretos, pode parecer “buraco” na cobrança.  
5. **Jobs cancelados** por `next_billing_date > today` (UTC vs DB) ou assinatura inativa.  
6. **Faturas antigas** sem migração de `payment_token` (índice parcial `WHERE payment_token IS NOT NULL`).

---

## Causa raiz (síntese)

Não há uma única causa para todos os ambientes; as **causas raiz mais prováveis** são:

1. **Operacional:** ausência de **scheduler + worker** em produção.  
2. **Lógica de negócio no worker:** conclusão de job **sem** criação de fatura quando **não há itens recorrentes elegíveis**, sem erro explícito para o operador.  
3. **Menos provável para “404 no link”:** falha específica do pipeline de token para `invoice_type = recurring` — o SQL **não** exclui esse caso.

---

## Riscos

- **Avançar ciclo sem fatura:** risco financeiro e de confiança; histórico em `billing_recurring_jobs` pode mostrar `completed` sem `result_invoice_id`.  
- **Dependência de infra:** PM2/EasyPanel com um único comando `node index.js` **não** executa recorrência.  
- **Timezone:** divergência entre `CURRENT_DATE` e `today` UTC no worker.  
- **Gateway:** cobrança externa pode falhar silenciosamente (fatura existe; link pode abrir mas fluxo de pagamento incompleto até retentativa/manual).

---

## Plano de correção sugerido (seguro, incremental)

1. **Confirmar em produção:** processos/cron para `billing:scheduler` e `billing:worker`; logs `[BILLING]`; linhas em `billing_recurring_jobs` e `subscriptions.next_billing_date`.  
2. **Se jobs `completed` sem `result_invoice_id`:** auditar `customer_invoice_items` da fatura anterior (`is_recurring`, `scheduled_due_date`) e alinhar expectativa com regras D5/E2 ou ajustar dados.  
3. **Documentar no deploy** (sem refactor): variáveis `BILLING_CHILD_ITEM_INVOICES_ENABLED`, `BILLING_CHILD_BATCH_LIMIT`, `RECURRING_WORKER_ID`.  
4. **Correções de código (fase posterior, após validação):** apenas após métricas — por exemplo: logging mais visível quando `includedItems` é vazio; alinhar comparação de datas (UTC vs `CURRENT_DATE`); opcional alerta se ciclo avança sem fatura.

---

## Arquivos analisados (amostra central)

- `packages/backend/src/services/recurringBillingJobService.ts`
- `packages/backend/src/scripts/runRecurringScheduler.ts`, `runRecurringWorker.ts`
- `packages/backend/package.json`
- `packages/backend/src/services/customerInvoiceService.ts`
- `packages/backend/src/services/customerBillingService.ts`
- `packages/backend/src/services/customerInvoiceSchema.ts`
- `packages/backend/src/controllers/publicCustomerInvoicesController.ts`
- `packages/backend/src/services/billingLogger.ts`
- `packages/backend/src/config/billingEnv.ts`
- `packages/backend/src/index.ts`, `routes/billingRoutes.ts`
- `database/init/67_subscriptions.sql`, `69_billing_recurring_jobs.sql`, `77_payment_token_customer_invoices.sql`
- `src/pages/CustomerInvoiceDetail.tsx`, `CustomerInvoicePay.tsx`, `App.tsx`

---

## Respostas objetivas finais

| Pergunta | Resposta |
|----------|----------|
| O agendamento está realmente funcionando? | **Só se** scheduler e worker estiverem agendados em produção. A API sozinha **não** dispara isso. |
| A recorrência gera a fatura corretamente? | **Quando** o worker roda **e** há itens elegíveis, sim (`createCustomerInvoice` + itens). Caso contrário, o ciclo pode avançar **sem** fatura. |
| O link da fatura recorrente existe? | **Para cada fatura criada pelo worker**, sim (`payment_token` no insert). **Não existe** para ciclos em que nenhuma fatura foi criada. |
| Causa raiz mais provável | **Infra sem worker/scheduler** e/ou **lógica que permite ciclo completo sem fatura** quando não há itens recorrentes elegíveis. |
| Correção mais segura | **Operacional primeiro** (garantir jobs); depois **observabilidade** e revisão de dados/itens; alterações de código **mínimas** e atrás de validação em produção/staging. |
