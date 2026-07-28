# AUDIT — SUPER ADMIN BILLING 2.0 (ASAAS)

| Campo | Valor |
|-------|-------|
| **Nome** | `AUDIT_SUPERADMIN_BILLING_ASAAS` |
| **Versão** | 1.0 |
| **Tipo** | `investigation_only` |
| **Prioridade** | critical |
| **Escopo** | Super Admin SaaS (PainelCRM → clientes da plataforma) |
| **Data** | 2026-07-23 |
| **Modo** | READ ONLY — nenhum código, migration, rota ou config foi alterado |
| **Docs oficiais Asaas** | [Assinaturas](https://docs.asaas.com/docs/assinaturas-recorr%C3%AAncia), [Cartão em assinatura](https://docs.asaas.com/docs/criando-assinatura-com-cartao-de-credito), [Pix Automático](https://docs.asaas.com/docs/pix-automatico), [Eventos de assinatura](https://docs.asaas.com/docs/subscription-events) |

**Fora de escopo:** cobranças CRM dos clientes finais dos tenants (`customer_invoices`, Billing Execution V2 CRM).

**Docs relacionados:** `docs/platform-billing/`, `docs/PLANO-INTEGRACAO-ASAAS.md`, `docs/INTEGRACAO_ASAAS_AUTOMATICA_WEBHOOK.md`, `docs/architecture/billing/AUDIT_RECURRING_BILLING_NOTIFICATIONS.md`, `docs/architecture/commercial/AUDIT_TENANT_COMMERCIAL_OVERRIDES.md`.

---

## 1. Resumo Executivo

### Situação atual

O PainelCRM já opera um **faturamento SaaS maduro** sobre o Asaas:

1. Checkout cria `tenant_billing` + customer Asaas + cobrança avulsa (`POST /v3/payments`).
2. Webhook confirma pagamento e **ativa o plano** (`activatePlanFromBilling`).
3. Recorrência é **própria da plataforma** (`subscriptions` + `billing_recurring_jobs` + scheduler/worker), não usa Assinaturas nativas do Asaas.
4. Na renovação, o motor **emite nova fatura/cobrança** (PIX/boleto/cartão “aberto”); o cliente paga (ou usa `/saas-pay/:token`). **Não há captura automática de cartão tokenizado.**

### Veredito de viabilidade

| Capacidade desejada | Viabilidade | Comentário |
|---------------------|-------------|------------|
| PIX “automático” no sentido **gerar QR na renovação + webhook + reativar** | **Alta — já existe em grande parte** | Renovação já cria charge PIX; falta motor de retry/dunning configurável e hardening de notificação no worker |
| **Pix Automático** (BACEN — débito automático com autorização) | **Alta via API oficial — zero no código hoje** | Produto Asaas distinto; exige novos endpoints, webhooks e elegibilidade da conta |
| Assinatura com cartão recorrente | **Alta via API oficial — zero no código hoje** | `POST /v3/subscriptions` + tokenização; ou modelo híbrido (token + `payWithCreditCard` na renovação) |
| Motor configurável (tentativas, canais, suspender/cancelar) | **Média-alta — parcialmente no sistema** | Existem jobs, grace/auto-suspend settings, notificações plataforma; **não** há tela/policy engine unificado “Cobrança Automática” |
| Ciclos mensal/trimestral/semestral/anual | **Já existe** | `subscriptions.billing_interval` + `plan_interval_prices` |
| Upgrade / downgrade / pró-rata | **Parcial** | Upgrade via `plan_upgrade` + ativação; seat/instance addon com pró-rata; downgrade “próximo ciclo” parcial (scheduled overrides); pró-rata de troca de plano não é genérico |

**Conclusão:** Billing 2.0 é **tecnicamente viável** reaproveitando gateway, webhooks de payment, motor de renovação e ativação. O salto crítico é escolher **estratégia de recorrência no gateway** (Assinatura Asaas vs recorrência própria + token) e implementar o **policy engine** no Super Admin — a maior parte das regras de negócio (suspender, WhatsApp, e-mail, gerar novo PIX) é **do sistema**, não do Asaas.

---

## 2. Arquitetura Atual

### 2.1 Fluxo canônico (compra → ativação)

```text
Cliente compra plano (checkout / PlanPurchaseModal)
        ↓
POST /api/plan-purchase  →  planPurchaseController
        ↓
Cria/reusa tenant (status payment_pending | trial)
        ↓
subscribePlan()  →  createInvoice() → tenant_billing
        ↓
getActiveGateway({ billingType: 'saas' })  →  Asaas (scope=global)
        ↓
ensureCustomer(tenant)  →  tenants.asaas_customer_id + payment_customers
        ↓
createCharge()  →  POST /v3/payments  (+ GET .../pixQrCode se PIX)
        ↓
Persiste gateway_reference_id / attempts / notifica charge.created
        ↓
[Cartão] payWithCreditCard  (checkout ou /saas-pay/:token)
        ↓
Asaas webhook  POST /api/webhooks/asaas
        ↓
asaasWebhookHandler → handleWebhook → applyPaymentEvent / attempt event
        ↓
status paid → activatePlanFromBilling()
        ↓
tenant active + subscriptions(type=saas) + notificações / lifecycle
```

### 2.2 Fluxo de renovação (já em produção no código)

```text
runRecurringScheduler  →  enqueueRenewalJobs  →  billing_recurring_jobs
        ↓
runRecurringWorker  →  processNextBatch
        ↓
BillingRenewalEngine  (somente type=saas; CRM bloqueado neste engine)
        ↓
executeSaasRenewal
  · calcula preço (contrato + extras WhatsApp/seats)
  · createInvoice (billing_reason=plan_renewal)
  · createCharge (método automático da subscription/gateway)
  · publishPlatformBillingChargeCreated
  · advanceSubscriptionAfterCompletedCycle (next_billing_date)
        ↓
Cliente paga (PIX/boleto/página pública) → webhook → paid → extensão do período
```

**Gap crítico:** renovação **não** chama `payWithCreditCard` com token salvo. Cartão na renovação gera cobrança aberta; liquidação exige ação do cliente (ou futuro token/assinatura Asaas).

### 2.3 Separação de domínios (não misturar)

| Domínio | Escopo gateway | Fatura | Motor |
|---------|----------------|--------|-------|
| **SaaS plataforma** | `payment_gateway_configs.scope=global` | `tenant_billing` | `BillingRenewalEngine` + jobs |
| **CRM tenant** | `scope=tenant` | `customer_invoices` | Billing Execution V2 (outro pipeline) |

Billing 2.0 deve tocar **apenas** o domínio SaaS.

---

## 3. Recursos já existentes (reaproveitar)

| Recurso | Onde | Reuso no Billing 2.0 |
|---------|------|----------------------|
| Cliente HTTP Asaas v3 | `modules/gateways/asaas/client/asaasClient.ts` | Estender com `/subscriptions`, Pix Automático, token |
| `PaymentGateway` multi-gateway | `modules/payments/*` | Manter abstração; novos métodos no adapter Asaas |
| Cobrança avulsa PIX/boleto/cartão | `asaasService.createCharge`, `payWithCreditCard` | Checkout e fallback pós-falha |
| QR PIX + retry de readiness | `getPixQrCode` + `fetchPixQrWithRetry` | Renovação e “gerar novo PIX” |
| Webhook payment + idempotência | `asaasWebhook*`, `payment_events`, `asaas_webhook_events` | Base; expandir eventos |
| Ativação pós-pago | `activatePlanFromBilling` | Reativação automática após falha |
| Assinatura interna SaaS | `subscriptions` (`type=saas`) | Source of truth comercial |
| Motor renovação | `billingRenewalEngine`, `executeSaasRenewal`, scheduler/worker | Orquestrar charges + policy |
| Tentativas por método | `tenant_billing_payment_attempts` | Troca PIX↔boleto↔cartão |
| Página pública | `/saas-pay/:token` | Fallback humano / troca de cartão |
| Super Admin gateway | `/superadmin/pagamentos` | Credenciais Asaas |
| Super Admin faturas | `/superadmin/platform-billings` | Operação |
| Ops motor | `/superadmin/billing/operations` | Saúde jobs |
| Settings grace/suspend | `billingSettingsService` + `superadmin_settings` | Semente do policy engine |
| Notificações plataforma | `platform.billing.charge.created`, WhatsApp/e-mail | Canais pós-ação do motor |
| Ciclos | `monthly` / `quarterly` / `semi_annual` / `yearly` | Já no schema |
| Idempotência renovação | `idempotencyKey = saas_renew_{sub}_{periodStart}` | Manter |

---

## 4. Recursos ausentes (desenvolver)

| Recurso | Dependência | Esforço relativo |
|---------|-------------|------------------|
| Client Asaas: Assinaturas (`/subscriptions`) | API oficial | Médio |
| Client Asaas: Pix Automático (autorização + instruções) | API oficial + elegibilidade conta | Alto |
| Persistência `creditCardToken` / `asaas_subscription_id` / `pix_automatic_authorization_id` | Migration futura | Médio |
| Captura automática de cartão na renovação **ou** sync com Assinatura Asaas | Arquitetura | Alto |
| Troca de cartão (UI + API) | Asaas `PUT .../creditCard` ou novo pay | Médio |
| Policy engine “Cobrança Automática” (tentativas, intervalos, ações) | Só sistema | Alto |
| Tela Super Admin Financeiro → Cobrança Automática | Frontend + settings | Médio |
| Webhooks `SUBSCRIPTION_*` e `PIX_AUTOMATIC_*` | Parser + handlers | Médio-Alto |
| Dunning: suspender/cancelar por dias de atraso (policy-driven) | Jobs + lifecycle | Médio |
| Upgrade imediato com pró-rata genérico de plano | Pricing | Médio |
| Downgrade formal “próximo ciclo” | Já há scheduled overrides parciais | Baixo-Médio |
| Retry de cobrança cartão com política própria | Asaas retry nativo limitado; motor próprio | Médio |
| Hardening notificação no worker de renovação | Já auditado | Baixo-Médio |

---

## 5. Compatibilidade com API oficial do Asaas

### 5.1 Tabela de suporte

| Capacidade | Oficial Asaas? | No PainelCRM hoje? | Endpoints / mecanismo futuro |
|------------|----------------|--------------------|------------------------------|
| PIX avulso + QR | ✅ | ✅ | `POST /v3/payments` + `GET /v3/payments/{id}/pixQrCode` |
| PIX na renovação (gerar cobrança) | ✅ | ✅ parcial | Mesmo; motor já gera |
| **Pix Automático** (débito recorrente autorizado) | ✅ | ❌ | `POST /v3/pix/automatic/authorizations`; cobranças com `pixAutomaticAuthorizationId`; retries `POST /v3/pix/automatic/paymentInstructions/{id}/retries` |
| Assinatura recorrente (boleto/PIX/cartão) | ✅ | ❌ (só assinatura interna) | `POST /v3/subscriptions` |
| Assinatura cartão + validação | ✅ | ❌ | `POST /v3/subscriptions` com `creditCard` / `creditCardHolderInfo` |
| Tokenização cartão | ✅ (prod: habilitar com gerente) | ❌ (só tipagem opcional no client) | Token no create/pay; sandbox liberado |
| Alteração / troca de cartão | ✅ | ❌ | `PUT /v3/subscriptions/{id}/creditCard` |
| Cobrança cartão avulsa | ✅ | ✅ | `POST /v3/payments/{id}/payWithCreditCard` |
| Ciclos WEEKLY…YEARLY | ✅ | ✅ (mapeamento interno) | `cycle`: MONTHLY, QUARTERLY, SEMIANNUALLY, YEARLY |
| Upgrade valor assinatura | ✅ (com tokenização) | Parcial (modelo próprio) | `PUT /v3/subscriptions/{id}` |
| Downgrade | ✅ (atualizar valor/ciclo) | Parcial (scheduled next cycle) | Mesmo + política interna |
| Retry automático cartão | Parcial (gateway/adquirente) | ❌ policy | Assinatura Asaas tenta nas datas; falhas → webhooks; Pix Automático tem retry policy |
| Retry Pix Automático | ✅ | ❌ | Endpoint de retries + webhooks `PIX_AUTOMATIC_*` |
| Webhooks payment | ✅ | ✅ (subset) | Já usados |
| Webhooks subscription | ✅ | ❌ | `SUBSCRIPTION_CREATED/UPDATED/INACTIVATED/DELETED/...` |
| Webhooks Pix Automático | ✅ | ❌ | `PIX_AUTOMATIC_RECURRING_*` |
| Cancelamento assinatura | ✅ | Interno only | `DELETE /v3/subscriptions/{id}` ou status INACTIVE |
| Cancelamento programado | Parcial Asaas + ✅ interno | ✅ campo `cancel_at_period_end` | Preferir política no `subscriptions` local |
| Reativação | ✅ (nova assinatura / reativar) | ✅ ativação pós-pago + status tenant | Combinar webhook paid + `activatePlanFromBilling` |
| Cobrança proporcional | ❌ não é feature nativa completa | Parcial (seat/instance addon) | Calcular no `billingService` e ajustar valor da cobrança/assinatura |
| Chargeback | ✅ eventos | Recebidos na config; tratamento de negócio limitado | Handlers dedicados |

### 5.2 PIX Automático vs “gerar PIX automaticamente”

| Termo | Significado | Status |
|-------|-------------|--------|
| **Gerar PIX na renovação** | Sistema cria cobrança PIX + QR; cliente paga | **Já existe** |
| **Pix Automático (BACEN)** | Autorização única → débitos futuros sem ação do cliente | **API Asaas existe; código não** |

O brief do Billing 2.0 mistura os dois. Recomendação: tratar como **duas features** no plano de implantação.

### 5.3 Respostas objetivas — seção 1 do brief (PIX)

| Pergunta | Resposta |
|----------|----------|
| Geração automática do PIX na renovação | **Parcialmente existe** (`executeSaasRenewal` → `createCharge`) |
| Vencimentos automáticos | **Existe** (`due_date` = `periodStart` / ciclo) |
| Atualização automática do QRCode | **Parcial** — QR na criação; “novo PIX” por nova attempt/charge precisa policy |
| Expiração | **Parcial** — `cancelExpiredPendingBillings`; não é policy de dunning 2.0 |
| Webhook | **Existe** para payment |
| Confirmação automática | **Existe** (`paid` → activate) |
| Reativação após pagamento | **Existe** via `activatePlanFromBilling` |
| Endpoint oficial Pix Automático | **Sim** — ver tabela 5.1 |
| Precisa desenvolver? | Sim para Pix Automático BACEN + motor de retry/novo PIX configurável |

### 5.4 Respostas objetivas — cartão (oficial Asaas)

| Recurso | Oficial Asaas |
|---------|---------------|
| Cobrança recorrente | ✅ Assinaturas |
| Tokenização | ✅ (habilitar em produção) |
| Reutilização do cartão | ✅ via token / assinatura |
| Alteração / troca do cartão | ✅ `PUT /subscriptions/{id}/creditCard` |
| Renovação automática | ✅ (Asaas gera cobranças do ciclo) |
| Cancelamento | ✅ delete / inactivate |
| Pausa | ✅ status INACTIVE (suspensão) |
| Upgrade / downgrade | ✅ atualizar valor/ciclo (tokenização recomendada); **pró-rata é responsabilidade da aplicação** |

---

## 6. Arquivos envolvidos

### 6.1 Backend — Gateway Asaas

- `packages/backend/src/modules/gateways/asaas/index.ts`
- `packages/backend/src/modules/gateways/asaas/asaasEvents.ts`
- `packages/backend/src/modules/gateways/asaas/asaasTypes.ts`
- `packages/backend/src/modules/gateways/asaas/asaasErrors.ts`
- `packages/backend/src/modules/gateways/asaas/client/asaasClient.ts`
- `packages/backend/src/modules/gateways/asaas/services/asaasService.ts`
- `packages/backend/src/modules/gateways/asaas/mappers/asaasMapper.ts`
- `packages/backend/src/modules/gateways/asaas/webhooks/asaasWebhook.ts`
- `packages/backend/src/modules/gateways/asaas/webhooks/asaasWebhookParser.ts`

### 6.2 Backend — Payments / webhooks genéricos

- `packages/backend/src/modules/payments/gatewayProvider.ts`
- `packages/backend/src/modules/payments/gatewayResolver.ts`
- `packages/backend/src/modules/payments/gatewayRegistry.ts`
- `packages/backend/src/modules/payments/paymentGatewayTypes.ts`
- `packages/backend/src/modules/payments/webhook/webhookCore.ts`
- `packages/backend/src/modules/payments/webhook/paymentDomainService.ts`
- `packages/backend/src/modules/payments/webhook/statusNormalizer.ts`
- `packages/backend/src/modules/payments/webhook/paymentEventsService.ts`

### 6.3 Backend — Checkout / assinatura / fatura SaaS

- `packages/backend/src/controllers/planPurchaseController.ts`
- `packages/backend/src/routes/planPurchaseRoutes.ts`
- `packages/backend/src/services/subscriptionService.ts`
- `packages/backend/src/services/billingSubscriptionService.ts`
- `packages/backend/src/services/billingService.ts`
- `packages/backend/src/services/invoiceService.ts`
- `packages/backend/src/services/saasPlanCheckoutPaymentAttemptService.ts`
- `packages/backend/src/services/tenantBillingPaymentAttemptsService.ts`
- `packages/backend/src/services/customerBillingService.ts` (`payTenantBillingWithCard`)
- `packages/backend/src/controllers/publicSaasBillingController.ts`
- `packages/backend/src/services/paymentGatewayConfigService.ts`
- `packages/backend/src/services/paymentCustomersService.ts`
- `packages/backend/src/services/gatewayPaymentMethodPolicy.ts`
- `packages/backend/src/services/billingGatewayChargeService.ts`
- `packages/backend/src/services/asaasIntegrationService.ts`
- `packages/backend/src/controllers/asaasIntegrationController.ts`
- `packages/backend/src/routes/asaasIntegrationRoutes.ts`
- `packages/backend/src/routes/asaasWebhookRoutes.ts`
- `packages/backend/src/services/superadminPlatformBillingsService.ts`
- `packages/backend/src/controllers/superadminPlatformBillingsController.ts`
- `packages/backend/src/services/billingSettingsService.ts`

### 6.4 Backend — Motor de renovação / jobs

- `packages/backend/src/services/billingRenewalEngine/billingRenewalEngine.ts`
- `packages/backend/src/services/billingRenewalEngine/executeSaasRenewal.ts`
- `packages/backend/src/services/billingRenewalEngine/types.ts`
- `packages/backend/src/services/recurringBillingJobService.ts`
- `packages/backend/src/services/billingRecurringJobPersistence.ts`
- `packages/backend/src/services/billingRecurringJobsOpsService.ts`
- `packages/backend/src/services/billingManualRenewalService.ts`
- `packages/backend/src/services/billingRecoveryService.ts`
- `packages/backend/src/scripts/runRecurringScheduler.ts`
- `packages/backend/src/scripts/runRecurringWorker.ts`
- `Dockerfile.billing.scheduler` / `Dockerfile.billing.worker`
- `scripts/start-billing-scheduler.sh` (e equivalentes worker)

### 6.5 Backend — Notificações (canais do motor futuro)

- `packages/backend/src/services/platformNotifications/platformBusinessNotifications.ts`
- `packages/backend/src/services/notificationsEngine/*` (WhatsApp plataforma / outbound)
- Docs: `docs/architecture/billing/AUDIT_RECURRING_BILLING_NOTIFICATIONS.md`

### 6.6 Frontend Super Admin / checkout

- `src/pages/superadmin/SuperAdminPagamentos.tsx`
- `src/pages/superadmin/SuperAdminPlatformBillings.tsx`
- `src/pages/superadmin/SuperAdminBillingOperations.tsx`
- `src/pages/superadmin/SuperAdminPlans.tsx`
- `src/pages/superadmin/SuperAdminClientFaturamento.tsx`
- `src/pages/superadmin/SuperAdminSubscriptionCyclesSettings.tsx`
- `src/pages/PlanCheckout.tsx`
- `src/pages/PublicSaasBillingPay.tsx`
- `src/pages/InternalBillingCheckout.tsx`
- `src/components/plan/PlanPurchaseModal.tsx`

### 6.7 Docs / config

- `docs/platform-billing/*`
- `docs/PLANO-INTEGRACAO-ASAAS.md`
- `docs/INTEGRACAO_ASAAS_AUTOMATICA_WEBHOOK.md`
- `docs/EASYPANEL-BILLING-WORKER-SCHEDULER.md`
- `env.example` (`ASAAS_*`, `BILLING_*`, `PUBLIC_API_URL`, `FRONTEND_URL`)

---

## 7. Banco de Dados

### 7.1 Tabelas centrais (SaaS)

| Tabela | Papel |
|--------|-------|
| `plans` / `plan_features` / `plan_interval_prices` | Catálogo e preços por ciclo |
| `tenants` | Cliente plataforma; `asaas_customer_id`, `plan_id`, `status`, `activated_billing_id`, overrides comerciais |
| `tenant_billing` | Fatura canônica SaaS |
| `tenant_billing_payment_attempts` | Tentativas por método na mesma fatura |
| `subscriptions` | Contrato recorrente `type='saas'` |
| `billing_recurring_jobs` | Fila renovação |
| `subscription_cycles` | Ciclos / reconciliação (quando usado) |
| `payment_gateways` | Catálogo de gateways |
| `payment_gateway_configs` | Config **global** Asaas (SaaS) |
| `payment_customers` | Mapa tenant → `gateway_customer_id` |
| `asaas_webhook_events` | Log/idempotência Asaas |
| `payment_events` | Idempotência multi-gateway |
| `payment_webhook_events` | Resumo operacional |
| `superadmin_settings` | `billing_grace_period_days`, `billing_auto_suspend_enabled` |
| `platform_notification_deliveries` | Notificações de cobrança plataforma |

### 7.2 Campos relevantes em `subscriptions`

- `billing_interval`: `monthly` \| `quarterly` \| `semi_annual` \| `yearly`
- `status`: `active` \| `cancelled` \| `past_due` \| `trialing` \| `paused`
- `next_billing_date`, `current_period_*`, `grace_period_days`
- `default_payment_method`, `cancel_at_period_end`
- `contracted_*` (snapshot comercial)
- **Ausente hoje:** `gateway_subscription_id`, `credit_card_token`, `pix_automatic_authorization_id`

### 7.3 Status típicos

| Entidade | Valores |
|----------|---------|
| `tenant_billing.status` | pending, waiting_payment, processing, paid, overdue, cancelled, … |
| Gateway Asaas bruto | PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED, … |
| Jobs | pending → processing → completed / failed (+ retry_at, attempts) |

### 7.4 Migrations de referência (não criar novas nesta auditoria)

`33_tenant_billing`, `59_asaas_*`, `60_payment_gateway_configuration`, `61_payment_customers`, `62_payment_webhook_events`, `67_subscriptions`, `68_tenant_billing_subscription_id`, `69_billing_recurring_jobs`, `73_gateway_payment_generic_columns`, `74_drop_asaas_payment_columns`, `93_tenant_billing_payment_attempts`, `144_platform_public_pay_token`, `173_asaas_webhook_auto_config_fields`, `31_superadmin_settings`.

---

## 8. Webhooks

### 8.1 Tipados no código (`asaasEvents.ts`)

`PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_RESTORED`, `PAYMENT_REFUNDED`, `PAYMENT_RECEIVED_IN_CASH_UNDONE`, `PAYMENT_CHARGEBACK_*`, `PAYMENT_DUNNING_*`, `PAYMENT_BANK_SLIP_VIEWED`, `PAYMENT_CHECKOUT_VIEWED`.

### 8.2 Registrados na auto-config (`asaasIntegrationService`)

Subset de payment: created/updated/confirmed/received/overdue/deleted/refunded/restored/refund_in_progress/chargebacks.

### 8.3 Processamento real hoje

- Só eventos com `paymentId` e `isAsaasPaymentEvent`.
- Status interno deriva de **`payment.status`**, não do nome do evento.
- Lookup: attempt SaaS → attempt CRM → `tenant_billing` → `customer_invoice`.
- Em `paid` + `tenant_billing` → `activatePlanFromBilling`.

### 8.4 Matriz: usamos / não usamos / deveríamos

| Evento | Hoje | Billing 2.0 |
|--------|------|-------------|
| `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` | ✅ Usados (via status) | Manter — confirmação e reativação |
| `PAYMENT_OVERDUE` | ✅ Recebido | Acionar policy (novo PIX, WhatsApp, suspender timer) |
| `PAYMENT_REFUNDED` / chargebacks | ⚠️ Registrados; negócio limitado | Política de suspensão / alerta SA |
| `PAYMENT_DELETED` | ✅ | Cleanup attempts |
| `SUBSCRIPTION_*` | ❌ Não usados | **Obrigatórios** se adotar Assinatura Asaas |
| `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_*` | ❌ | **Obrigatórios** se Pix Automático |
| `PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_*` | ❌ | Agendamento / recusa / retry |
| `PAYMENT_DUNNING_*` | Tipados; pouco usados | Avaliar vs motor próprio de dunning |

### 8.5 Rotas

- `POST /api/webhooks/asaas`
- `POST /webhooks/asaas`
- Auth: header `asaas-access-token` vs token em `payment_gateway_configs`

---

## 9. Motor de Cobrança Inteligente — arquitetura recomendada

### 9.1 Princípio

**Source of truth comercial = `subscriptions` (plataforma).**  
**Gateway = executor de cobrança** (Asaas payment / subscription / pix automatic).  
**Policy engine = orquestrador configurável pelo Super Admin** (não hardcode no worker).

```text
┌─────────────────────────────────────────────────────────┐
│ Super Admin → Financeiro → Cobrança Automática (config) │
│  (superadmin_settings ou tabela billing_collection_policy) │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ CollectionPolicyEngine                                   │
│  on: renewal_due | payment_failed | payment_overdue     │
│      charge_refused | authorization_cancelled           │
│  actions: charge_card | create_pix | notify_wa |        │
│           notify_email | suspend | cancel | retry       │
└───────────┬─────────────────────┬───────────────────────┘
            │                     │
            ▼                     ▼
   BillingRenewalEngine    Webhook handlers
   executeSaasRenewal      (payment / sub / pix auto)
            │
            ▼
         Asaas Adapter
```

### 9.2 Configurações: sistema vs Asaas

| Configuração UI | Dono |
|-----------------|------|
| Renovar cartão automaticamente | **Sistema** (dispara captura/assinatura); Asaas executa |
| Gerar PIX automaticamente | **Sistema** (já quase); Asaas só cria payment |
| Qtd. máxima de tentativas | **Sistema** (jobs); Pix Automático também tem retry policy no Asaas |
| Intervalo entre tentativas | **Sistema** (`retry_at`); Asaas Pix Automático: política própria |
| Após falha → gerar novo PIX | **Sistema** |
| Enviar WhatsApp / E-mail | **Sistema** (platform notifications) |
| Suspender conta | **Sistema** (`tenants.status`, settings grace) |
| Cancelar assinatura | **Sistema** + opcional sync `DELETE` Asaas subscription |
| Reativar automaticamente | **Sistema** (já via webhook paid) |
| Tokenização / Assinatura / Pix Automático | **Asaas** (feature flags / elegibilidade conta) |

### 9.3 Fluxo exemplo (falha de cartão)

```text
Tentativa 1 cartão falha
  → retry em N dias (config)
Tentativa 2 falha
  → gerar PIX + WhatsApp + e-mail
Ainda unpaid após X dias
  → suspender tenant
Após Y dias
  → cancelar subscription (cancel_at_period_end ou imediato)
Pagamento chega (PIX)
  → webhook paid → reativar
```

---

## 10. Assinaturas (ciclo de vida comercial)

| Capacidade | Situação atual | Notas |
|------------|----------------|-------|
| Mensal / trimestral / semestral / anual | ✅ | `billing_interval` |
| Alteração de plano | ✅ parcial | Via billing `plan_upgrade` + `changeSubscriptionPlan` |
| Upgrade imediato | ✅ parcial | Ativa no pagamento do upgrade |
| Downgrade próximo ciclo | ✅ parcial | Overrides `*_scheduled_next_cycle` (seats/WhatsApp); plano formal pode precisar formalizar |
| Cobrança proporcional | ✅ parcial | Seat/instance addon; não genérico para troca de plano |
| Próximo vencimento | ✅ | `next_billing_date` |
| Cancelamento ao final do período | ✅ schema | `cancel_at_period_end` — validar cobertura operacional E2E |
| Suspensão | ✅ tenant + settings | Grace / auto_suspend; status `paused`/`past_due` na subscription |
| Reativação | ✅ | Pagamento + activate / ações SA |

---

## 11. Riscos Técnicos (priorizados)

| # | Criticidade | Risco | Mitigação |
|---|-------------|-------|-----------|
| 1 | **P0** | Duas fontes de verdade se adotar Assinatura Asaas **e** manter `subscriptions` local sem sync | Escolher modelo A ou B (abaixo); sync unidirecional claro |
| 2 | **P0** | Tokenização em produção exige habilitação Asaas | Solicitar cedo ao gerente de contas; sandbox já ok |
| 3 | **P0** | Pix Automático: janela 2–10 dias úteis antes do vencimento | Scheduler deve criar instrução antecipada; não no dia D |
| 4 | **P1** | Renovação avança `next_billing_date` mesmo se charge falhar no gateway (hoje try/catch engole erro de charge) | Separar “ciclo avançado” vs “cobrança liquidada”; past_due |
| 5 | **P1** | Notificação de renovação pode não flushar no worker one-shot | Já documentado em AUDIT_RECURRING_BILLING_NOTIFICATIONS |
| 6 | **P1** | Confundir Pix Automático BACEN com “gerar PIX” | Naming e sprints separados |
| 7 | **P1** | Misturar pipelines CRM e SaaS no mesmo handler | Manter guards `billingType=saas` / `type=saas` |
| 8 | **P2** | Chargeback / refund sem política de acesso | Handler + suspender automático opcional |
| 9 | **P2** | PCI: capturar cartão sem tokenização/hosted fields | Preferir tokenização Asaas + HTTPS |
| 10 | **P2** | Compatibilidade: tenants já ativos só com payment avulso | Migração gradual (opt-in por método) |

---

## 12. Recomendação Técnica

### 12.1 Estratégia de implantação (mais segura)

**Modelo híbrido recomendado (Modelo B+):**

1. **Manter** `subscriptions` + `BillingRenewalEngine` como SSOT de ciclo comercial, preço, add-ons e policy.
2. **Fase 1 — Cartão automático sem Assinatura Asaas (menor acoplamento):**  
   - Habilitar tokenização; persistir `credit_card_token` por tenant/customer.  
   - Na renovação, se policy “renovar cartão” = SIM → `payWithCreditCard` com token na charge criada.  
   - Fallback policy → PIX + notificação.
3. **Fase 2 — Policy engine + UI Cobrança Automática** (só sistema): tentativas, intervalos, suspender/cancelar, canais.
4. **Fase 3 — Pix Automático (opcional premium):** autorização no primeiro PIX; renovações com `pixAutomaticAuthorizationId`; webhooks dedicados.
5. **Fase 4 (opcional) — Assinatura nativa Asaas:** só se quiser transferir geração de cobranças ao gateway; exige sync forte de valor/ciclo/upgrade (maior risco P0).

**Evitar no início:** migrar 100% da recorrência para `/subscriptions` Asaas sem policy local — quebra add-ons, overrides comerciais e WhatsApp extras já acoplados a `executeSaasRenewal`.

### 12.2 Ordem segura de sprints (sugerida para o Plano de Implantação)

| Sprint | Entrega |
|--------|---------|
| B2.0-0 | Decisão formal Modelo B+ vs Assinatura Asaas; checklist elegibilidade (token + Pix Automático) com Asaas |
| B2.0-1 | Schema: tokens / authorization ids / policy settings (sem ativar comportamento) |
| B2.0-2 | Adapter Asaas: token pay na renovação + troca de cartão |
| B2.0-3 | CollectionPolicyEngine + jobs de dunning |
| B2.0-4 | UI Super Admin Cobrança Automática |
| B2.0-5 | Webhooks falha/overdue → policy; reativação E2E |
| B2.0-6 | Pix Automático (se aprovado comercialmente) |
| B2.0-7 | Soft sync Assinatura Asaas (somente se métrica de falha de cartão exigir) |

### 12.3 O que NÃO fazer

- Não unificar motor CRM V2 com SaaS Renewal Engine.
- Não criar segunda fatura canônica fora de `tenant_billing`.
- Não avançar ciclo comercial sem rastrear liquidação (risco de “renovou no papel, não cobrou”).
- Não implementar Pix Automático sem webhooks `PIX_AUTOMATIC_*` e idempotência.

---

## 13. Entregáveis do brief — checklist

| # | Seção pedida | Status neste doc |
|---|--------------|------------------|
| 1 | Resumo Executivo | §1 |
| 2 | Arquitetura Atual | §2 |
| 3 | Recursos já existentes | §3 |
| 4 | Recursos ausentes | §4 |
| 5 | Compatibilidade API Asaas | §5 |
| 6 | Arquivos envolvidos | §6 |
| 7 | Banco de Dados | §7 |
| 8 | Webhooks | §8 |
| 9 | Riscos Técnicos | §11 |
| 10 | Recomendação Técnica | §12 |
| — | Motor inteligente + configs SA | §9 |
| — | Ciclo de vida assinaturas | §10 |

---

## 14. Apêndice — Endpoints Asaas a utilizar no futuro

| Uso | Método | Path |
|-----|--------|------|
| Customer | POST/GET/PUT | `/v3/customers` |
| Cobrança avulsa | POST | `/v3/payments` |
| QR PIX | GET | `/v3/payments/{id}/pixQrCode` |
| Pagar com cartão | POST | `/v3/payments/{id}/payWithCreditCard` |
| Cancelar cobrança | DELETE | `/v3/payments/{id}` |
| Criar assinatura | POST | `/v3/subscriptions` |
| Atualizar assinatura | PUT | `/v3/subscriptions/{id}` |
| Cartão da assinatura | PUT | `/v3/subscriptions/{id}/creditCard` |
| Remover assinatura | DELETE | `/v3/subscriptions/{id}` |
| Autorização Pix Automático | POST | `/v3/pix/automatic/authorizations` |
| Cobrança com autorização | POST | `/v3/payments` + `pixAutomaticAuthorizationId` |
| Retry instrução Pix Auto | POST | `/v3/pix/automatic/paymentInstructions/{id}/retries` |
| Webhooks config | POST/GET | `/v3/webhooks` |

---

**Fim da auditoria.** Pronto para servir de baseline do Sprint Planning **Billing 2.0 — Super Admin**.
`)