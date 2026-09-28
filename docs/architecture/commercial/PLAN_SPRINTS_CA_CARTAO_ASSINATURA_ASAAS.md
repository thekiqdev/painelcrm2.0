# Plano — Cartão via Assinatura Asaas (CA)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Tipo** | Plano de implantação (antes do código) |
| **Nome** | **CA — Credit Card → Asaas Subscription** |
| **Status** | **S0–S5 feitos (eng)** · checklist ops humano pendente |
| **Pedido** | Na contratação com cartão, em vez de cobrança avulsa, criar **assinatura** no Asaas; gerenciar ciclo e dar baixa nos pagamentos futuros |

---

## 1. Investigação Asaas (o que habilitar)

### 1.1 Produto

| Item | Detalhe oficial |
|------|-----------------|
| Endpoint | `POST /v3/subscriptions` com `billingType: CREDIT_CARD` |
| Validação | Cartão é **validado na criação**; 1ª cobrança em `nextDueDate` (se for **hoje**, pode cobrar na hora) |
| Dados | `creditCard` + `creditCardHolderInfo` **ou** `creditCardToken` + `remoteIp` (IP do pagador, não do servidor) |
| Atualizar valor/ciclo | `PUT /v3/subscriptions/{id}` (`updatePendingPayments` opcional) |
| Trocar cartão | `PUT /v3/subscriptions/{id}/creditCard` |
| Cobranças geradas | Asaas cria `payment`s ao longo do tempo; cada um tem `payment.subscription` |

Refs:

- [Criando assinatura com cartão](https://docs.asaas.com/docs/criando-assinatura-com-cartao-de-credito)
- [Introdução — assinaturas](https://docs.asaas.com/docs/assinaturas)
- [Eventos de assinatura](https://docs.asaas.com/docs/eventos-para-assinaturas)
- [Eventos de cobrança](https://docs.asaas.com/docs/payment-events)

### 1.2 Checklist ops (conta Asaas) — **fazer antes do código de produção**

Preencher com gerente Asaas / painel (sandbox ≠ produção):

| # | Item | Sandbox | Produção | Status |
|---|------|---------|----------|--------|
| 1 | Conta aprovada + cartão de crédito liberado | | | |
| 2 | **Tokenização** habilitada (sandbox: sim por doc; produção: **solicitar gerente**) | | | |
| 3 | HTTPS no domínio que captura cartão (obrigatório; sem SSL a conta pode ser bloqueada) | | | |
| 4 | Webhook de **Cobranças** (`PAYMENT_*`) apontando para `/api/webhooks/asaas` (já usado) | | | |
| 5 | Webhook de **Assinaturas** (`SUBSCRIPTION_*`) no **mesmo** endpoint ou dedicado | | | |
| 6 | Token de autenticação do webhook ≠ API Key | | | |
| 7 | Cartões de teste sandbox validados (aprovação / recusa) | | | |
| 8 | Timeout cliente HTTP ≥ **60s** na criação de subscription (doc Asaas) | | | |

**Sem (2) em produção:** dá para criar assinatura com PAN na contratação, mas **alterar valor/cartão** fica limitado — bloquear S3/S4 de produção até tokenização OK.

### 1.3 Eventos que importam para “dar baixa”

| Evento | Uso no PainelCRM |
|--------|------------------|
| `PAYMENT_CONFIRMED` | Cartão aprovado (crédito ainda pode não estar “RECEIVED”) → **tratar como pago comercial** (já é o padrão usual) |
| `PAYMENT_RECEIVED` | Valor disponível na conta Asaas → reforço / idempotente |
| `PAYMENT_CREATED` | Cobrança nova da assinatura → **criar/vincular** `tenant_billing` do ciclo |
| `PAYMENT_OVERDUE` / `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` | Inadimplência / recusa → past_due / dunning |
| `SUBSCRIPTION_INACTIVATED` / `DELETED` | Espelhar cancelamento no nosso lado (sem apagar histórico) |

Campo-chave no payment: **`subscription`** (ex. `sub_…`) para achar a assinatura local.

---

## 2. Como está hoje no PainelCRM

| Camada | Comportamento atual |
|--------|---------------------|
| Checkout cartão | Cria **cobrança avulsa** (`POST /v3/payments`) + captura (`payWithCreditCard` / URL fatura) |
| Ciclo comercial | SoT = `subscriptions` interno + job `executeSaasRenewal` |
| Renovação cartão (opcional) | Flag `card_auto_renew`: job cria charge e captura com **token** salvo — **não** usa `/subscriptions` Asaas |
| PIX recorrente | Pix Automático **MANUAL** (guia explícito: **não** usar Assinatura Asaas como cérebro do ciclo) |
| Webhook | Já ativa plano em `PAYMENT_*` → `activatePlanFromBilling` |

Conclusão: há **dois caminhos possíveis**; o pedido do produto é trocar o cartão na **contratação** para Assinatura Asaas e ainda assim **reconhecer ciclos futuros**.

---

## 3. Decisão de arquitetura (obrigatória)

### D-CA.1 — Cérebro vs executor (híbrido)

| Responsável | O quê |
|-------------|--------|
| **PainelCRM (cérebro)** | Plano, valor contratado, período, activate, upgrade/downgrade comercial, Meu Plano, inadimplência de negócio |
| **Asaas Subscription (executor cartão)** | Gerar e cobrar as cobranças de cartão no vencimento |

**Não** duplicar dois cérebros: o job de renovação **não** deve criar charge avulsa de cartão quando já existir `asaas_subscription_id` ativo.

### D-CA.2 — Escopo do método

- **CREDIT_CARD** na contratação SaaS (self-service / plan-purchase) → Assinatura Asaas.
- **PIX / BOLETO** → permanecem cobrança avulsa (+ Pix Automático no fluxo já documentado).
- CRM `customer_invoices` (cobrar cliente do tenant): **fora** deste plano (fase futura opcional).

### D-CA.3 — Baixa dos ciclos futuros

1. Asaas gera payment da assinatura → webhook `PAYMENT_CREATED` (com `subscription`).
2. Backend cria (ou reusa) `tenant_billing` `plan_renewal` do ciclo, `gateway_reference_id = pay_…`, link `subscriptions.id` interno.
3. `PAYMENT_CONFIRMED` / `RECEIVED` → mesma pipeline de paid → extensão de período / limpa past_due (**sem** `activatePlanFromBilling` “resetando” contrato como 1ª compra — só renovação).

### D-CA.4 — Relação com `card_auto_renew`

| Fase | Política |
|------|----------|
| Durante CA | Contas com Assinatura Asaas: **desligar** captura por token no job |
| Legado | Contas só com token + charge avulsa: manter `card_auto_renew` até migração |
| Meta | Nova contratação cartão = só Assinatura Asaas |

---

## 4. Fluxo-alvo (contratação)

```
Cliente escolhe plano + CREDIT_CARD
  → ensureCustomer Asaas
  → POST /v3/subscriptions (valor, cycle, nextDueDate=hoje|due, cartão/token, externalReference=tenant/billing)
  → persistir asaas_subscription_id na subscription local + metadata da fatura
  → 1ª cobrança (se nextDueDate=hoje) → PAYMENT_CONFIRMED
  → activatePlanFromBilling / sync CS (já existente)
Ciclos seguintes (Asaas gera payment)
  → PAYMENT_CREATED → upsert tenant_billing renewal
  → PAYMENT_CONFIRMED → baixa + avança período
Upgrade/downgrade valor (CS)
  → PUT /v3/subscriptions/{id} com novo value (+ updatePendingPayments se necessário)
Cancelamento
  → inativar/deletar subscription Asaas + cancel_at_period_end local
```

---

## 5. Sprints de implantação

| Sprint | Objetivo | Entrega | Risco se pular |
|--------|----------|----------|----------------|
| **S0 — Habilitação** | Ops + spike sandbox | **Feito (eng)** · ops checklist em [CA_S0_SPIKE_CHECKLIST.md](./CA_S0_SPIKE_CHECKLIST.md) | Código em prod sem produto liberado |
| **S1 — Adapter Asaas** | Cliente API | **Feito** — `create/update/cancel/get` subscription + capability `asaasSubscription` | Integração frágil |
| **S2 — Contratação** | Substituir charge avulsa no checkout cartão SaaS | **Feito** — `saasAsaasSubscriptionCheckoutService` + migração 337 + `remoteIp` nos controllers | Dupla cobrança (avulsa + sub) |
| **S3 — Baixa recorrente** | Reconhecer pagamentos futuros | **Feito** — `saasAsaasSubscriptionRenewalService` + webhook upsert + `plan_renewal` sem reset CS | Ciclos pagos no Asaas e “emidos” no Meu Plano |
| **S4 — Sync comercial** | Upgrade/downgrade/cancel | **Feito** — `saasAsaasSubscriptionSyncService` (PUT + cancel) + Meu Plano | Valor divergente Asaas × contrato |
| **S5 — Motor + migração** | Convivência com job atual | **Feito** — skip charge se `asaas_subscription_id` + flag `asaas_subscription_owns_card_renewal` | Job + Asaas cobrando 2× |

**Estimativa:** 5 sprints (S0 ops pode rodar em paralelo com S1).  
**Kickoff código:** só após **S0** mínimo (sandbox + webhooks). Sugestão: `ok sprint 0` (ops/checklist) → `ok sprint 1` (adapter).

---

## 6. Aceite por sprint (resumo)

### S0
- [x] Auditoria código + gaps documentados ([CA_S0_SPIKE_CHECKLIST.md](./CA_S0_SPIKE_CHECKLIST.md))
- [x] Instrumentação: eventos `SUBSCRIPTION_*` + `payment.subscription` no parser
- [ ] Checklist ops §1.2 / CA_S0 §2 preenchido (humano)
- [ ] Spike sandbox §3 executado e anotado (humano)
- [ ] Tokenização produção confirmada com gerente (gate S4 prod)

### S1
- [x] Métodos no `asaasClient` / `PaymentGateway` (`createSubscription`, update, creditCard, cancel, get)
- [x] Timeout ≥ 60s e **sem retry** na criação/atualização de cartão (anti-duplicidade)
- [x] Mapper: ciclo, cents→reais, sanitização; log sem PAN
- [x] Capability `asaasSubscription` no catálogo Asaas
- [x] User-Agent padrão nas chamadas HTTP Asaas
- [x] Checkout **não** ligado (S2)

### S2
- [x] Checkout CREDIT_CARD SaaS (plan_purchase / plan_upgrade / manual_charge) usa `gateway.createSubscription`
- [x] Migração `337_subscriptions_asaas_subscription_id_ca_s2.sql` + persistência em `subscriptions`
- [x] 1º pagamento CONFIRMADO → `activatePlanFromBilling` (fluxo atual); órfã `pay_` cancelada
- [x] Controllers passam `remoteIp` (Asaas)
- [x] Testes unitários `saasAsaasSubscriptionCheckoutService.test.ts`

### S3
- [x] Todo `pay_` da assinatura vira/atualiza `tenant_billing` (`ensureTenantBillingForAsaasSubscriptionPayment`)
- [x] Baixa idempotente via `confirmSaasRenewalFromAsaasPayment` (não reseta snapshot CS / `activated_billing_id`)
- [x] `activatePlanFromBilling(plan_renewal)` early-return no ramo de renovação
- [x] Recusa cartão (`PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` / failed) → overdue + past_due + metadata clara
- [x] Testes `saasAsaasSubscriptionRenewalService.test.ts`

### S4
- [x] Mudança de valor contratado → `syncAsaasSubscriptionFromLocalContract` (changePlan + snapshot CS explicit)
- [x] Cancelamento local (imediato / fim de período / expire) → `cancelAsaasSubscriptionForLocal`
- [x] Meu Plano: `asaas_card_subscription` no GET + badge na UI
- [x] Testes `saasAsaasSubscriptionSyncService.test.ts`

### S5
- [x] Job renewal / `charge_card` skip avulsa quando `asaas_subscription_id` + flag ON
- [x] Flag `billing2.asaas_subscription_owns_card_renewal` (default **ON**; rollback = OFF)
- [x] Fatura `plan_renewal` local ainda criada (Meu Plano); baixa via webhook S3
- [x] Testes skip/rollback em `saasAsaasSubscriptionSyncService.test.ts`

#### Rollback operacional (S5)

1. Super Admin → Feature Flags → desligar `billing2.asaas_subscription_owns_card_renewal` (ou `BILLING2_FLAG_ASAAS_SUBSCRIPTION_OWNS_CARD_RENEWAL=false`).
2. Job volta a `createCharge` / `card_auto_renew` mesmo com `asaas_subscription_id` (risco de cobrança dupla — só use em emergência).
3. Religar a flag assim que Assinatura Asaas + webhooks S3 estiverem estáveis.

---

## 7. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Dois cérebros (job + Asaas) cobrando | **Mitigado em S5** — skip + flag |
| `activatePlanFromBilling` em renovação reseta período | **Mitigado em S3** — branch `plan_renewal` só confirma ciclo |
| Tokenização prod off | S0 gate; S4 limitado |
| Divergência valor após CS S1–S3 | S4 PUT Asaas obrigatório no mesmo commit de sync |
| PIX doc diz “não use Assinatura” | Mantém-se para **PIX**; CA é **só cartão** (D-CA.2) |
| Timeout / retry duplica subscription | Idempotency-Key + `externalReference` único + não retry cego |

---

## 8. Fora de escopo (agora)

- Trocar PIX/Boleto por Assinatura Asaas
- Customer invoices (CRM) em Assinatura
- Parcelamento (`installment`) ≠ subscription
- Remover `card_auto_renew` do código antes da migração dos legados

---

## 9. Próximo passo

1. **Ops:** checklist/spike em [CA_S0_SPIKE_CHECKLIST.md](./CA_S0_SPIKE_CHECKLIST.md) (webhooks Assinatura + cartão liberado + tokenização prod).
2. **Sanity sandbox:** contratação cartão → `sub_` persistido → renovação sem charge avulsa → webhook baixa `plan_renewal`.
3. **Produção:** só após S0 ops + S5 flag ON. Rollback: §6 S5.
