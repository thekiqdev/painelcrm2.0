# Investigação — estrutura de planos, assinaturas e snapshot de preço contratado

**Objetivo:** definir o melhor local e formato para futura migration de “preço contratado”, sem implementar alterações.  
**Data:** 2026-05-08  

---

## 1. Estrutura atual das tabelas (resumo do repositório)

### 1.1 `plans`

- **Origem:** `database/init/24_plans_and_plan_features.sql` + alterações posteriores (`38_plans_plan_type_and_default.sql`, `43_plans_free.sql`, etc.).
- **Campos relevantes:** `id`, `name`, `slug`, `description`, **`price_cents`**, **`billing_interval`** (default do catálogo; CHECK inicial `monthly` | `yearly` na criação — ver evolução em migrações), **`plan_type`** (`standard` | `custom`), **`max_users`**, `is_active`, `is_free`, trial/free_access, `benefits`, etc.

### 1.2 `plan_interval_prices`

- **Origem:** `database/init/39_plan_interval_prices.sql`.
- **Uso:** apenas planos **`custom`** — uma linha por par **`(plan_id, billing_interval)`** com **`price_per_user_cents`**.
- **Intervalos:** `monthly`, `quarterly`, `semi_annual`, `yearly`.

### 1.3 `subscriptions`

- **Origem:** `database/init/67_subscriptions.sql` (+ colunas posteriores).
- **Chave de negócio:** `type` (`saas` | `customer`); para SaaS existe **no máximo uma assinatura ativa por tenant** — índice único parcial `idx_subscriptions_saas_active_tenant` em `database/init/67_subscriptions.sql`.
- **Campos já usados no produto:** `plan_id`, **`amount_cents`**, **`billing_interval`**, **`users_count`**, **`next_billing_date`**, `current_period_start/end`, `billing_anchor_day`, `status`, `cancel_at_period_end`, …

### 1.4 `tenants`

- **Origem:** `database/init/26_tenants_and_user_tenant.sql` + dezenas de `ALTER` (plan_period, overrides comerciais, billing preferences, etc.).
- **Relação com plano:** `plan_id` FK para `plans`; limites/overrides (`max_users_override`, `max_users_scheduled_next_cycle`, `seat_addon_pending_billing_id`, …) convivem com a assinatura SaaS.

### 1.5 `tenant_billing`

- **Origem:** `database/init/33_tenant_billing.sql`, estendida por várias migrações (`40_tenant_billing_interval_extend.sql`, `63_activation_plan_phase1.sql`, `68_tenant_billing_subscription_id.sql`, …).
- **Campos de valor / período:** `plan_id`, `billing_interval`, **`amount_cents`**, `due_date`, `period_start`, `period_end`, **`users_count`**, `billing_reason`, `subscription_id`, status, gateway, …
- **Snapshots já na tabela:** **`plan_name_snapshot`**, **`plan_price_snapshot`** (`database/init/68_tenant_billing_subscription_id.sql`) — histórico **por fatura**, não regra global do tenant.

### 1.6 `subscription_cycles`

- **Origem:** `database/init/141_subscription_cycles_phase1.sql`.
- **Propósito:** rastrear ciclos (`cycle_date`, `period_*`, `status`, `job_id`, …) — **telemetria / motor de ciclo**, não armazena matriz de preços contratados.

### 1.7 `plan_purchases` / checkout dedicado

- **Não há tabela `plan_purchases`** como entidade separada nos `database/init` analisados.
- Checkout comercial usa **`POST /api/plan-purchase`** (`planPurchaseController.ts`) → **`subscribePlan`** em `subscriptionService.ts`, que cria/atualiza **`tenant_billing`** (fatura pai).

---

## 2. Fluxo de contratação (checkout)

1. Cliente chama **`subscribePlan(tenantId, planId, billingInterval, { usersCount, billingReason, … })`** (`subscriptionService.ts`).
2. **`validatePlanForPurchase`** + **`calculateInvoiceAmount(planId, billingInterval, usersCount)`** (`billingService.ts`) — valores vêm das tabelas **`plans`** / **`plan_interval_prices`** **no momento da chamada**.
3. **`createInvoice`** grava **`tenant_billing`** com `amount_cents`, `users_count`, etc.

**Observação importante:** o `CreateInvoiceInput` em **`subscribePlan`** (trecho ~889–898) **não preenche** `plan_name_snapshot` nem `plan_price_snapshot`. Ou seja, na primeira cobrança de checkout esses campos tendem a ficar **`NULL`**, salvo outro fluxo os injete. Já o fluxo de **renovação automática** em `recurringBillingJobService.ts` passa `plan_name_snapshot` e `plan_price_snapshot` ao criar a fatura de renovação.

---

## 3. Fluxo de renovação (motor recorrente)

- Scheduler/worker (`recurringBillingJobService.ts`) calcula valor com **`calculateInvoiceAmount(planId, interval, usersForRenewal)`** — mesma fonte “lista atual” do catálogo.
- Avanço de datas em **`advanceSubscriptionAfterCompletedCycle`** / **`updateSubscriptionAfterRenewal`** (`billingSubscriptionService.ts`).
- Detalhe já auditado: **`subscriptions.amount_cents`** pode não ser atualizado em todos os caminhos do worker; a fatura nova carrega o valor calculado.

---

## 4. Diferença `standard` vs `custom` (hoje)

| Aspeto | `standard` | `custom` |
|--------|------------|----------|
| **Preço base** | `plans.price_cents` (fixo por plano/intervalo implícito no catálogo) | Por usuário: `plan_interval_prices.price_per_user_cents` × **`users_count`** |
| **Quantidade** | Não usa `users_count` no cálculo de valor base | **`users_count`** obrigatório para compra |
| **Limite** | `max_users` do plano quando aplicável | `max_users` + overrides no tenant |

Implementação de referência: **`calculateInvoiceAmount`** (`billingService.ts`).

---

## 5. Uso de `price_cents`, `interval_prices` e `users_count`

- **`plans.price_cents`:** usado para **`standard`** em `calculateInvoiceAmount`.
- **`plan_interval_prices`:** usado para **`custom`**; o intervalo efetivo é o da **assinatura** / checkout (**`billing_interval`** em `subscriptions` e `tenant_billing`), não o default em `plans.billing_interval`.
- **`users_count`:** na assinatura e nas faturas; para custom define quantos “assentos” entram no **total** `price_per_user × users_count`. Não existe no modelo atual um campo separado “preço só do usuário extra” — **usuário adicional** no mesmo plano custom usa o **mesmo** `price_per_user_cents` (pró-rata no addon via `calculateSeatAddonProrata`).

---

## 6. Respostas diretas às perguntas

### 6.1 O snapshot deve ficar em `subscriptions`, `tenants` ou nova tabela?

**Recomendação principal:** **`subscriptions` (type = `saas`)** — é a entidade que o worker e a API de assinatura já tratam como “contrato recorrente” do tenant, com um único registro ativo.

- **`tenants`:** bom para overrides operacionais (`max_users_override`), mas misturar “preço congelado” com estado comercial genérico tende a duplicar semântica com `subscriptions`.
- **Nova tabela** (`subscription_pricing_revision` ou similar): faz sentido se precisarem **histórico versionado** de reajustes; para **Etapa 1** costuma ser excesso.

**Alternativa:** colunas em `subscriptions` **ou** um único **`JSONB`** (ex.: `contract_pricing`) com matriz por intervalo para custom — trade-off entre consultas SQL simples vs flexibilidade.

### 6.2 Existe apenas uma assinatura SaaS ativa por tenant?

**Sim**, pelo desenho do BD: índice único **`idx_subscriptions_saas_active_tenant`** em `subscriptions` onde `type = 'saas'` e `status = 'active'`.

### 6.3–6.5 Standard/custom e preço por usuário extra

Respondido nas secções 4 e 5: **custom é totalmente por usuário** no intervalo escolhido; **não há** coluna dedicada “extra seat price” — addons usam o mesmo **`price_per_user_cents`** do intervalo (`calculateSeatAddonProrata`).

### 6.6 O checkout já salva snapshot em `tenant_billing`?

**Colunas existem** (`plan_name_snapshot`, `plan_price_snapshot`), mas **`subscribePlan`** não as envia no `createInvoice` atual — snapshots **nulos** na primeira emissão são plausíveis. Renovações geradas pelo worker tendem a **preencher** snapshots na criação da fatura.

### 6.7 Melhor regra de backfill para preservar ex. R$ 49,90

Ordem sugerida (conservadora):

1. **Última fatura paga** de plano (`tenant_billing` com `billing_reason` em `plan_purchase` | `plan_upgrade` | `plan_renewal`, `status = paid`), ordenada por `paid_at` / `updated_at`.
2. Usar **`amount_cents`** dessa linha como **total contratado** naquele intervalo.
3. **Custom:** `contracted_price_per_user_cents = round(amount_cents / users_count)` com validação (`users_count >= 1`); se der inconsistência, usar último **`subscriptions.amount_cents`** coerente ou fallback manual.
4. **Standard:** `contracted_plan_price_cents = amount_cents` (com intervalo da própria linha).
5. Guardar também **`billing_interval`** e **`contracted_at`** (data da fatura ou `paid_at`).

### 6.8 Como evitar quebrar renovações antigas?

- Campos **nullable** + motor: **se snapshot ausente**, manter comportamento atual = **`calculateInvoiceAmount`** a partir de `plans` / `plan_interval_prices`.
- Opcional: **feature flag** por tenant ou global (“usar preço contratado”).
- Testes com tenants que já têm `next_billing_date` próximo — garantir que mudança só altera **origem do valor**, não calendário.

### 6.9 Representação sugerida por cenário

| Cenário | Representação mínima |
|---------|----------------------|
| Plano fixo (standard) | `contracted_base_price_cents` + `contracted_billing_interval` |
| Plano por usuário (custom) | `contracted_price_per_user_cents` + `contracted_seats` (ou confiar em `subscriptions.users_count` versionado no momento do contrato) + `contracted_billing_interval` |
| “Usuários adicionais” | Mesmo **`contracted_price_per_user_cents`** do intervalo; quantidade futura continua em `users_count` / upgrades pagos |
| Mensal vs anual | Sempre amarrar snapshot ao **par** `(billing_interval)` efetivo da assinatura; para custom com vários intervalos no catálogo, considerar **JSONB** `per_interval: { monthly: {…}, yearly: {…} }` **ou** snapshot apenas do intervalo contratado (mais simples) |

---

## 7. Campos recomendados (primeira versão, conceitual)

Em **`subscriptions`** (nomes ilustrativos — alinhar na migration):

| Campo | Tipo | Notas |
|-------|------|--------|
| `contracted_at` | `timestamptz` | Momento em que o preço foi “fixado” (ex.: primeiro pagamento) |
| `contracted_billing_interval` | `text` | Redundante com `billing_interval` se política for “um intervalo por contrato”; senão documentar semântica |
| `contracted_plan_price_cents` | `int null` | Standard: valor base do ciclo |
| `contracted_price_per_user_cents` | `int null` | Custom: unitário |
| `contract_currency` | `text` default `BRL` | Se um dia multi-moeda |

**Ou** um único **`contract_pricing jsonb`** com schema versionado internamente (`{ "v":1, "kind":"custom", "per_user_cents":…, "interval":"monthly" }`).

**Não** substituir `tenant_billing.plan_price_snapshot`: continua sendo auditoria **por fatura**.

---

## 8. Riscos

| Risco | Mitigação |
|-------|-----------|
| Backfill errado (divisão custom, fatura seat_addon misturada) | Filtrar `billing_reason`, validar `users_count`, auditar outliers |
| Duplicidade de verdade (`amount_cents` vs snapshot) | Regra clara: renovação usa snapshot **se** preenchido e flag ativa; senão lista |
| Planos com vários intervalos no catálogo | Snapshot só do intervalo contratado ou JSONB |
| Mudança de `plan_id` no upgrade | Definir se snapshot **reseta** ou mantém legado até novo checkout |

---

## 9. Plano da Etapa 1 (revisado, só desenho)

1. **Migration:** adicionar colunas nullable em **`subscriptions`** (ou JSONB único), **sem** alterar `calculateInvoiceAmount`.
2. **Backfill offline:** script SQL/job que preenche a partir de **`tenant_billing` pago** (regra secção 6.7), com relatório de linhas ignoradas.
3. **Código (fase seguinte, fora deste escopo):** flag → renovação lê snapshot; checkout/primeiro pagamento **grava** snapshot na assinatura **e** opcionalmente preenche `plan_*_snapshot` na primeira `tenant_billing`.
4. **Validação:** comparar valor renovação “novo” vs “antigo” em staging para um conjunto de tenants reais ou clones.

---

## 10. Referências de código

| Tema | Ficheiro |
|------|----------|
| Cálculo de valor | `packages/backend/src/services/billingService.ts` |
| Assinatura / mudança de plano | `packages/backend/src/services/billingSubscriptionService.ts` |
| Renovação SaaS | `packages/backend/src/services/recurringBillingJobService.ts` |
| Checkout / fatura | `packages/backend/src/services/subscriptionService.ts` (`subscribePlan`, `activatePlanFromBilling`) |
| Fatura + colunas snapshot | `packages/backend/src/services/invoiceService.ts` |
| API plano atual | `packages/backend/src/controllers/myTenantPlanController.ts` |
| Seat addon | `packages/backend/src/services/tenantSeatCommercialService.ts` |
| Compra plano HTTP | `packages/backend/src/controllers/planPurchaseController.ts` |

---

*Documento apenas investigativo — sem migrations nem alterações de runtime.*
