# Auditoria: `/meu-plano`, ciclo de renovação e preço contratado

**Escopo:** investigação apenas (sem alterações a billing, gateways, checkout, webhooks, UI ou BD).  
**Data da análise:** 2026-05-08  

---

## 1. Fluxo atual de `/meu-plano`

### 1.1 Página (`src/pages/MeuPlano.tsx`)

A página carrega em paralelo:

| Endpoint | Uso na UI |
|----------|-----------|
| `GET /api/me/tenant/plan` | Plano ligado ao tenant (`tenants` + `plans`), trial, `plan_period_*`, cobrança em aberto (`pending_billing`), assentos agendados, seat addon pendente |
| `GET /api/me/tenant/subscription` | Assinatura SaaS ativa: `amount_cents`, `next_billing_date`, `current_period_*`, `users_count`, flags de atraso/cancelamento |
| `GET /api/me/tenant/limits` | Limite de usuários vs uso atual |
| `GET /api/me/tenant/commercial-billings` | Histórico de cobranças “pai” (`tenant_billing`) |
| `GET /api/plans` | Catálogo para comparação / checkout |

**Restrição:** `GET /api/me/tenant/plan` responde **403** para quem não é o usuário primário do tenant (primeiro usuário criado); o código em `myTenantPlanController.ts` usa `getMyTenantAndPrimary`.

### 1.2 Como a tela calcula “valor atual”, “próxima cobrança”, “período” e histórico

- **Valor exibido no herói / próxima cobrança (referência mensal):**  
  - Se existe assinatura com `subscription.amount_cents > 0`, usa **`subscription.amount_cents`** (`GET /api/me/tenant/subscription`).  
  - Caso contrário, calcula no front o preço “de catálogo” do plano atual:  
    - **Custom:** `price_per_user_cents × contractedSeats` a partir de `plan.interval_prices` e `plan.billing_interval` (`MeuPlano.tsx`, variável `currentPriceCents`).  
    - **Standard:** `plan.price_cents`.  

  Trecho relevante:

```917:918:src/pages/MeuPlano.tsx
  const currentPriceCents =
    isCustom && priceRow ? priceRow.price_per_user_cents * contractedSeats : plan.price_cents;
```

```1065:1068:src/pages/MeuPlano.tsx
  const mainDisplayPriceCents =
    subscription != null && subscription.amount_cents > 0 ? subscription.amount_cents : currentPriceCents;
  const nextBillingLine =
    subscription?.next_billing_date != null ? formatDate(subscription.next_billing_date) : '—';
```

- **Próxima cobrança (data):** vem de **`subscription.next_billing_date`** (mesmo endpoint). Textos auxiliares usam `days_until_next_billing` (diferença em dias até essa data).

- **Período vigente:** prioriza **`subscription.current_period_start` → `subscription.current_period_end`**; se ausente, cai para **`myPlan.plan_period_start` / `plan_period_end`** do tenant.

- **Histórico de cobranças:** lista **`tenant_billing`** via `listCommercialBillingsForHub`: por linha mostra `amount_cents`, `due_date`, `period_start`/`period_end`, `billing_reason`, `paid_at`, método efetivo (`commercialTenantBillingsHubService.ts`). Os valores são os **persistidos na fatura**, não recalculados pelo front.

---

## 2. Fluxo backend: próxima cobrança e renovação

### 2.1 Fonte de verdade da “próxima cobrança”

- **`subscriptions.next_billing_date`** — tratada como **data de vencimento do ciclo** (competência); o scheduler usa também antecipação por tenant (`recurring_invoice_generate_days_before_due`). Ver `docs/GERACAO_ANTECIPADA_FATURAS_RECORRENTES.md`.

### 2.2 Geração mensal / anual / renovação (SaaS)

1. **Scheduler** (`enqueueRenewalJobs` em `recurringBillingJobService.ts`): seleciona assinaturas `active` com `(next_billing_date - dias_antecipação) <= CURRENT_DATE`, depois janela horária local (Fase 2).

2. **Worker** (`processNextBatch`): processa jobs em `billing_recurring_jobs`; para SaaS chama `processOneRenewalJob`.

3. **Ciclo processado:** `periodStart` alinha-se ao **`cycle_key` do job** (= vencimento normalizado), não a “hoje” (`resolveWorkerJobCycleStartYmd`).

4. **Valor da fatura de renovação:** `calculateInvoiceAmount(planId, interval, usersForRenewal)` — ver secção 4.

5. **Após criar a fatura (e fluxo completado):**  
   **`advanceSubscriptionAfterCompletedCycle`** → **`updateSubscriptionAfterRenewal`**, que grava `next_billing_date`, `current_period_start`, `current_period_end`, `billing_cycle_count`, **`billing_anchor_day = EXTRACT(DAY FROM next_billing_date)`**.

### 2.3 Regra matemática do “próximo mês” após um ciclo

- **`nextSubscriptionBillingAfterCycle`** = `calculateNextBillingDate(periodStart, interval, null)` — **ignora** `subscriptions.billing_anchor_day` antigo; usa o dia do próprio `periodStart` como âncora implícita (`recurringBillingJobService.ts`, comentário nas linhas 45–52).

- **`computeFinalNextBillingForCompletedCycle`** decide o novo `next_billing_date` após concluir o ciclo:
  - Calcula `computedNext` = um intervalo à frente do **dia do ciclo** (ex.: mensal 07/05 → 07/06).
  - Se `old_next <= cycleDate` → aplica `computed` (caso normal).
  - Se `old_next > cycleDate` → `final = max(computed, old_next)` (**anti-regressão**: não “volta” a data se alguém já adiantou a assinatura).

Testes em `recurringBillingJobService.advance.test.ts` documentam inclusive o caso “next já à frente” (`kept_subscription_ahead_no_regress`).

### 2.4 Onde pode aparecer “próxima cobrança no mesmo mês”

Com base no código e na documentação interna já existente:

| Cenário | Referência |
|--------|------------|
| **`old_next` já maior que `computedNext`** (ex.: reagendamento manual ou estado inconsistente) | `computeFinalNextBillingForCompletedCycle` mantém a data mais à frente — pode **não** coincidir com “mês seguinte ao pagamento” esperado pelo utilizador se o estado prévio estava errado |
| **Âncora desalinhada** antes das correções documentadas | `docs/CORRECAO_AVANCO_RECORRENCIA_E_ACCORDION_LISTAGEM.md`, `docs/CORRECAO_AVANCO_DEFINITIVO_NEXT_BILLING_DATE.md` |
| **Job completado mas assinatura não avançada** (legado) | `docs/CORRECAO_AVANCO_DEFINITIVO_NEXT_BILLING_DATE.md` — possível inconsistência histórica; exige reconciliação de dados |
| **Pagamento atrasado** | O avanço usa **`cycleDate` do job**, não `paid_at`; atraso no pagamento não deve, por si só, mudar a fórmula `cycle + 1 intervalo`, desde que o job corresponda ao ciclo correto |

**Regra esperada pelo produto (mensal):** após processar o ciclo com vencimento **07/05**, o próximo `next_billing_date` deve ser **07/06** (sujeito à regra de fim de mês em `calculateNextBillingDate`, ex. 31 Jan → fevereiro).

### 2.5 Pagamento manual vs gateway

- Faturas SaaS são linhas em **`tenant_billing`** com gateway opcional (`createCharge`, etc.).
- O histórico na UI usa valores e datas **da linha** (`amount_cents`, `paid_at`, `period_*`).
- O avanço de **`subscriptions.next_billing_date`** no motor recorrente passa pelos caminhos documentados em `advanceSubscriptionAfterCompletedCycle` (`source`: `saas_new_invoice`, `saas_idempotent_invoice`, etc.), não pela UI.

---

## 3. Como o valor da renovação é definido hoje

### 3.1 Motor de renovação (`processOneRenewalJob`)

- Lê **`plans.price_cents`** e **`plans.plan_type`** e, para custom, **`plan_interval_prices.price_per_user_cents`**.
- **`amountCents = await calculateInvoiceAmount(planId, interval, usersForRenewal)`** — sempre a partir das **tabelas de plano atuais**, não de um preço congelado por tenant.

```112:143:packages/backend/src/services/billingService.ts
export async function calculateInvoiceAmount(
  planId: string,
  billingInterval: BillingInterval,
  usersCount?: number | null
): Promise<number> {
  const planRow = await pool.query<{ plan_type: string; price_cents: number | null }>(
    'SELECT plan_type, price_cents FROM plans WHERE id = $1 AND is_active = true',
    [planId]
  );
  // ...
  if (planType === 'custom') {
    const priceRow = await pool.query<{ price_per_user_cents: number }>(
      'SELECT price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1 AND billing_interval = $2',
      [planId, billingInterval]
    );
    // ...
    return Math.max(0, pricePerUser * count);
  }
  return Math.max(0, plan.price_cents ?? 0);
}
```

- Na criação da fatura, grava-se também **`plan_name_snapshot`** e **`plan_price_snapshot`** (derivados do plano atual / fallback), em **`tenant_billing`** — são **cópias na fatura**, não substituem o motor para o *próximo* ciclo.

### 3.2 Linha `subscriptions.amount_cents`

- Preenchida na criação da assinatura (`createSubscription`) e atualizada em **`changeSubscriptionPlan`** (PATCH assinatura, ou após seat addon pago via `changeSubscriptionPlan`).

- **Importante:** o worker de renovação **calcula** `amountCents` para a nova `tenant_billing`, mas **não foi identificado** um `UPDATE subscriptions SET amount_cents = …` no próprio fluxo de `processOneRenewalJob` antes do bloco que chama `advanceSubscriptionAfterCompletedCycle`. Ou seja, o valor **exposto em `GET /api/me/tenant/subscription`** pode ficar **desalinhado** do valor **real da última/próxima fatura** até algum fluxo chamar `changeSubscriptionPlan` (ex.: custom com `max_users_scheduled_next_cycle` aplicado no fim do trecho de renovação).

Trecho que **sincroniza** assinatura após aplicar assentos agendados (custom):

```1777:1794:packages/backend/src/services/recurringBillingJobService.ts
  if (isCustom && scheduledNext != null && scheduledNext >= 1) {
    await pool.query(
      `UPDATE tenants ... max_users_override ...`,
      [scheduledNext, subscription.tenant_id]
    );
    const sync = await changeSubscriptionPlan(subscription.id, subscription.tenant_id, {
      plan_id: planId,
      users_count: scheduledNext,
      billing_interval: interval,
    });
```

`changeSubscriptionPlan` recalcula `amount_cents` com **`calculateInvoiceAmount`** (preços atuais do plano):

```582:597:packages/backend/src/services/billingSubscriptionService.ts
  const amountCents = await calculateInvoiceAmount(
    data.plan_id,
    (data.billing_interval ?? sub.billing_interval) as BillingInterval,
    data.users_count ?? sub.users_count ?? null
  );
  await pool.query(
    `UPDATE subscriptions
     SET plan_id = $1, amount_cents = $2, billing_interval = $3, users_count = COALESCE($4, users_count), ...
```

---

## 4. Snapshot de “preço contratado”

### 4.1 O que existe hoje

| Artefacto | Conteúdo | Propósito |
|-----------|----------|-----------|
| **`tenant_billing.amount_cents`** | Valor cobrado naquela fatura | Histórico fiável por cobrança |
| **`tenant_billing.plan_name_snapshot` / `plan_price_snapshot`** | Metadados opcionais na fatura | Exibir contexto; não governam renovação |
| **`subscriptions`**: `plan_id`, `billing_interval`, `users_count`, `amount_cents` | Estado vigente da assinatura | UI usa `amount_cents`; valor pode ficar atrás do catálogo ou da última fatura |
| **`plans` / `plan_interval_prices`** | Preço público atual | **Fonte do cálculo** em `calculateInvoiceAmount` |

### 4.2 O que **não** existe (para a regra de negócio desejada)

Não há, nesta investigação, estrutura dedicada tipo:

- `contracted_plan_price_cents` / `contracted_extra_user_price_cents` por tenant **imutável após contratação**, ou  
- `tenant_plan_price_snapshot` **utilizada pelo worker** para renovações.

**Conclusão:** **não há “preço contratado congelado”** aplicado ao motor recorrente: renovações seguem **preço atual do plano** em `plans` / `plan_interval_prices` (desde que `is_active` e linhas existam).

---

## 5. Clientes antigos vs alteração de preço no Super Admin

- Alterar **`plans.price_cents`** ou **`plan_interval_prices`** afeta **imediatamente** o resultado de **`calculateInvoiceAmount`** e, portanto, **renovações futuras** e **PATCH de assinatura** — não há segregação “só novos clientes” no código analisado.

---

## 6. Usuários adicionais (custom)

### 6.1 Renovação integral do ciclo

- Usa **`subscription.users_count`** (e para custom pode aplicar **`max_users_scheduled_next_cycle`** no ciclo de renovação — ver `processOneRenewalJob`).
- Preço por usuário vem de **`plan_interval_prices`** atual.

### 6.2 Seat addon (pró-rata)

- **`calculateSeatAddonProrata`** lê **`plan_interval_prices.price_per_user_cents`** para o intervalo da assinatura — também **preço de catálogo atual**, não histórico por tenant.

```73:76:packages/backend/src/services/billingService.ts
  const priceRow = await pool.query<{ price_per_user_cents: number }>(
    'SELECT price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1 AND billing_interval = $2',
    [planId, billingInterval]
  );
```

### 6.3 Após pagamento de seat addon

- `activateSeatAddonFromBilling` chama **`changeSubscriptionPlan`**, que **recalcula** `amount_cents` com **preços atuais** do plano.

---

## 7. Histórico na UI vs mudanças no catálogo

- **Histórico:** cada linha reflete **`tenant_billing.amount_cents`** na altura da cobrança — **preserva valores antigos** nas linhas já criadas.
- **“Valor atual” no herói:** mistura **`subscription.amount_cents`** (assinatura) com **catálogo** se não houver valor na assinatura — pode **diferir** do histórico (ex.: R$ 49 vs R$ 69) quando:
  - o catálogo foi alterado,
  - a assinatura não foi atualizada,
  - ou o utilizador compara **preço de lista** com **faturas antigas**.

---

## 8. Riscos identificados

1. **Renovação sem preço congelado:** promoções ou mudanças de lista alteram cobranças recorrentes de **todos** os tenants no mesmo `plan_id`.
2. **`subscriptions.amount_cents` pode não refletir** o valor da última renovação gerada pelo worker (dependência de outros fluxos para sincronizar).
3. **UI “valor atual”** pode mostrar catálogo enquanto faturas/histórico mostram outros valores — risco de **percepção de bug** mesmo com dados historicamente corretos por fatura.
4. **`computeFinalNextBillingForCompletedCycle` + estado antigo de `next_billing_date`** pode manter datas “à frente” ou estranhas até dados legados serem corrigidos (já documentado em correções anteriores).

---

## 9. Proposta de correção incremental (futura)

1. **Introduzir snapshot contratual** (tabela ou colunas em `subscriptions` / `tenants`), p.ex.:  
   `contracted_base_price_cents`, `contracted_price_per_user_cents`, `contracted_billing_interval`, `contracted_seats`, `contracted_at`, preenchidos **no primeiro pagamento** ou checkout.
2. **Alterar `calculateInvoiceAmount`** (ou criar `calculateRenewalAmount`) para usar snapshot **na renovação**, e opcionalmente manter `plans` só para **novas contratações** / upgrades explícitos.
3. **Atualizar `subscriptions.amount_cents`** sempre que uma fatura de renovação for gerada (alinhamento UI/API).
4. **Webhook / ativação:** garantir que upgrades de preço de lista não sobrescrevem snapshot sem evento de negócio (upgrade assinado).

---

## 10. Plano seguro de implementação (alto nível)

1. Migração + backfill conservador (snapshot = último valor pago ou plano atual, por decisão de produto).
2. Feature flag: motor usa snapshot apenas quando preenchido.
3. Monitorização: comparar valor renovação vs snapshot vs lista.
4. Só depois: alterações de UX em `/meu-plano` para mostrar “preço contratado” vs “preço de lista”.

---

## 11. Checklist de validação (após futura implementação)

- [ ] Renovar mensal: `next_billing_date` avança exatamente um período a partir do **ciclo processado**, com casos 31→fim de mês.
- [ ] Alterar preço no Super Admin **não** altera renovação de tenant com snapshot antigo.
- [ ] Novo checkout usa preço de lista atual.
- [ ] Seat addon usa **preço contratado** por usuário adicional (se política assim definir).
- [ ] Histórico continua a mostrar valores antigos por `tenant_billing`.
- [ ] `GET /subscription.amount_cents` alinha com próxima fatura esperada.

---

## 12. Referências rápidas de ficheiros

| Área | Ficheiro |
|------|----------|
| UI Meu plano | `src/pages/MeuPlano.tsx` |
| Plano tenant | `packages/backend/src/controllers/myTenantPlanController.ts` (`getMyTenantPlan`) |
| Assinatura SaaS | `packages/backend/src/controllers/myTenantSubscriptionController.ts` |
| Lista cobranças hub | `packages/backend/src/services/commercialTenantBillingsHubService.ts` |
| Cálculo valores | `packages/backend/src/services/billingService.ts` |
| Renovação / avanço ciclo | `packages/backend/src/services/recurringBillingJobService.ts` |
| Assinatura CRUD / mudança plano | `packages/backend/src/services/billingSubscriptionService.ts` |
| Ativação pós-pagamento | `packages/backend/src/services/subscriptionService.ts` (`activatePlanFromBilling`, `ensureSaasSubscriptionAfterPaidActivation`) |
| Próximo billing date (matemática) | `packages/backend/src/services/subscriptionService.ts` (`calculateNextBillingDate`) |

---

## 13. Tabelas relevantes (mapeamento)

| Tabela | Campos / notas |
|--------|----------------|
| **`tenants`** | `plan_id`, `plan_period_start/end`, `activated_billing_id`, `max_users_override`, `max_users_scheduled_next_cycle`, `seat_addon_pending_billing_id`, `status`, … |
| **`plans`** | `price_cents`, `plan_type`, `billing_interval`, `is_active`, … |
| **`plan_interval_prices`** | `plan_id`, `billing_interval`, `price_per_user_cents` (custom) |
| **`subscriptions`** | `type='saas'`, `plan_id`, `amount_cents`, `billing_interval`, `next_billing_date`, `current_period_*`, `users_count`, `billing_anchor_day`, … |
| **`tenant_billing`** | `amount_cents`, `due_date`, `period_start/end`, `billing_reason`, `plan_name_snapshot`, `plan_price_snapshot`, `status`, `paid_at`, `subscription_id`, … |
| **`billing_recurring_jobs`** | fila de renovação (`cycle_key`, etc.) |
| **`subscription_cycles`** | dual-write / diagnóstico de ciclo (ver docs de billing engine) |

**Nota:** `plan_purchases` não foi mapeada como fonte do motor de renovação nesta leitura orientada ao código acima; se existir em migrações específicas do projeto, pode ser cruzada numa fase de inventário de BD.

---

*Fim do documento de auditoria.*
