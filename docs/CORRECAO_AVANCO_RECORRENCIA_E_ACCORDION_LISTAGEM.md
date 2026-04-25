# Correção: avanço da próxima recorrência e listagem em accordion

## 1. Causa raiz do avanço incorreto da próxima cobrança (CRM)

### Sintoma
Após gerar a `customer_invoice` do ciclo (worker), `subscriptions.next_billing_date` podia **não refletir o próximo ciclo esperado** (ex.: mensal 23/04 → 23/05), especialmente quando:

1. **`billing_anchor_day` ficava desalinhado** de `next_billing_date` — por exemplo após reagendar só `next_billing_date` via PATCH CRM (`patchCustomerSubscriptionNextBillingFromPaidInvoice`), que **não atualizava** a âncora.
2. O worker calculava o fim do ciclo com `calculateNextBillingDate(periodStart, interval, subscription.billing_anchor_day)`. Com âncora **antiga** (outro dia do mês), o **próximo** `next_billing_date` era calculado em cima desse dia, não do dia da cobrança **efetiva** do ciclo (`periodStart`).

### Comportamento de `calculateNextBillingDate`
Com `billingAnchorDay = null`, a função usa o **dia de mês de `periodStart`** como âncora (`billingAnchorDay ?? dayOfPeriod`). Isso alinha o próximo ciclo ao dia da cobrança que está a ser processada.

### Correções aplicadas

| Área | Alteração |
|------|-----------|
| Worker CRM | `nextCustomerSubscriptionCycleEnd(periodStart, interval)` chama `calculateNextBillingDate(periodStart, interval, null)` nos fluxos **customer** (idempotente + `processOneCustomerRenewalJob`, inclusive ciclo sem invoice elegível). |
| PATCH próxima cobrança | Ao atualizar `next_billing_date` manualmente, também `billing_anchor_day = EXTRACT(DAY FROM data)::int`. |
| Pós-renovação (todas as assinaturas) | `updateSubscriptionAfterRenewal` passa a definir `billing_anchor_day = EXTRACT(DAY FROM next_billing_date::date)::int`, mantendo a âncora igual ao dia da **próxima** cobrança persistida. |

### Fonte de verdade (próximo ciclo)

- **Gatilho do job:** `subscriptions.next_billing_date` (e `cycle_key` alinhado no job).
- **Ciclo em processamento:** `periodStart = subscription.next_billing_date` (normalizado YMD em `getSubscriptionById`).
- **Próximo ciclo após sucesso:** `periodEnd = calculateNextBillingDate(periodStart, billing_interval, null)` para **type=customer** — ou seja, **período seguinte com o mesmo dia de mês que `periodStart`**, com regra de fim de mês já existente em `calculateNextBillingDate`.
- **Persistência:** `updateSubscriptionAfterRenewal` grava `next_billing_date = periodEnd`, `current_period_start/end` do ciclo processado e sincroniza `billing_anchor_day` com o dia de `periodEnd`.

### Idempotência e duplicidade
- Idempotência por `findCustomerInvoiceBySubscriptionAndPeriod(subscription_id, next_billing_date)` mantida.
- Não se usa `invoice.due_date` como substituto de `next_billing_date` da assinatura no cálculo do worker.

---

## 2. UX: listagem de faturas recorrentes (accordion)

### Objetivo
Reduzir poluição na lista geral: **uma linha por assinatura** para faturas com `origin === 'subscription'` e `subscription_id` preenchido; **faturas filhas** (`invoice_type === 'child'`) e demais ciclos aparecem **dentro** do grupo expandido.

### Agrupamento
- **Chave canónica:** `subscription_id`.
- **Critério de grupo:** `subscription_id` não nulo **e** `origin === 'subscription'`.
- **Fora do grupo:** faturas manuais, avulsas, ou sem essa combinação — **linha única** como antes.

### Dados extras na lista
- `GET /api/customer-invoices` (lista) passa a incluir `subscription_next_billing_date` via `LEFT JOIN subscriptions` (somente para exibir **“Próx. cobrança (assinatura)”** no cabeçalho do grupo).

### Nomenclatura na UI
- Cabeçalho do grupo: **Recorrência** + identificador (número da fatura mais recente não-filha ou prefixo do id).
- Coluna de data no cabeçalho: **Próx. cobrança (assinatura)** — vem de `subscriptions.next_billing_date`, não do vencimento de uma invoice isolada.
- Área expandida: **“Faturas geradas nesta recorrência”** com tipo **Ciclo** vs **Filha (item)**.

---

## 3. Riscos remanescentes

- **Paginação:** o agrupamento é feito **apenas sobre as faturas da página atual** (`limit`/`offset`). Uma assinatura com muitas faturas pode aparecer em mais de uma página com subconjuntos diferentes — aceitável para MVP incremental; melhoria futura: endpoint dedicado “assinaturas + última fatura” ou paginação por grupo.
- **Assinaturas SaaS (tenant_billing):** não entram nesta lista CRM; o ajuste de `billing_anchor_day` em `updateSubscriptionAfterRenewal` aplica-se também ao fluxo SaaS — mantém coerência entre dia da próxima cobrança e âncora.
- **Filtro por status:** aplica-se antes do agrupamento; grupos podem conter só faturas de um status conforme o filtro.

---

## 4. Arquivos alterados (resumo)

- `packages/backend/src/services/recurringBillingJobService.ts` — `nextCustomerSubscriptionCycleEnd` e uso nos fluxos customer.
- `packages/backend/src/services/customerInvoiceRecurrenceNextBillingService.ts` — sincronizar `billing_anchor_day` no PATCH.
- `packages/backend/src/services/billingSubscriptionService.ts` — `updateSubscriptionAfterRenewal` + `billing_anchor_day`.
- `packages/backend/src/services/customerBillingService.ts` — `listInvoices` com JOIN e `subscription_next_billing_date`.
- `packages/backend/src/services/customerInvoiceService.ts` — campo opcional em `CustomerInvoiceRow`.
- `src/services/customerInvoices.ts` — tipo TS no front.
- `src/pages/CustomerInvoices.tsx` — agrupamento, expandir/recolher, subtabela.

---

## 5. Checklist de aceite

- [ ] `subscriptions.next_billing_date` avança corretamente após gerar invoice recorrente (CRM)
- [ ] Recorrência mensal avança para o próximo mês no **mesmo dia de mês** que o ciclo processado (com regra de último dia do mês)
- [ ] Não há duplicidade de ciclo (idempotência preservada)
- [ ] Listagem principal menos poluída para recorrências CRM
- [ ] Recorrências agrupadas por `subscription_id`
- [ ] Faturas do grupo expansíveis (sanfona) com histórico e ações por linha
- [ ] Faturas normais (não subscription origin) não agrupadas — comportamento preservado
- [ ] UI distingue recorrência (cabeçalho) vs faturas geradas (expandido) vs tipo filha

---

## 6. Correção crítica: `next_billing_date` não avançava (RLS + ciclo canónico)

### Causa raiz
1. **`SET LOCAL app.bypass_rls`** no worker só vigorava até ao fim da transação **implícita** de cada comando em modo autocommit. O bypass **não** se aplicava aos `UPDATE` seguintes na mesma conexão. O `UPDATE subscriptions` podia ver **0 linhas** (RLS), sem erro — a assinatura ficava com `next_billing_date` antigo mesmo com job e fatura OK.
2. Reforço: ciclo processado passa a derivar prioritariamente de **`job.cycle_key`** (`resolveWorkerJobCycleStartYmd`), alinhado ao que o scheduler enfileirou.

### O que mudou
- `withBillingWorkerRlsBypass`: `set_config('app.bypass_rls', '1', false)` (sessão) + reset no `finally`.
- `updateSubscriptionAfterRenewal(db, subscriptionId, tenantId, …)` com `WHERE id AND tenant_id` e **erro se `rowCount !== 1`**.
- `advanceSubscriptionBillingCycle` + log `[BILLING] subscription_billing_cycle_advance` (`previous_cycle_date`, `new_next_billing_date`, `interval_applied`).
- Paths SaaS/CRM idempotentes e `processOne*` usam o **client** do worker e `periodStartYmd` canónico.

---

*Abril/2026 — alteração incremental; scheduler, worker e janela Fase 2 preservados.*
