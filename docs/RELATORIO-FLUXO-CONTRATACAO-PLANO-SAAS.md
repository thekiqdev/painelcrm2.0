# Relatório: Fluxo de contratação do plano SaaS

**Data:** 2026-03  
**Objetivo:** Mapear o que já está implementado e o que falta para completar o fluxo de contratação SaaS (criação de tenant → cobrança → ativação após pagamento).

---

## 1. Fluxo atual do endpoint POST /api/plan-purchase

### Ordem das operações

| # | Etapa | Onde | Implementado |
|---|--------|------|--------------|
| 1 | Resolver ou criar tenant | `planPurchaseController.resolveTenantId()` | ✅ |
| 2 | Associar plano ao tenant | Dentro de `resolveTenantId` (INSERT/UPDATE) e após `subscribePlan` (UPDATE se tenant existente) | ✅ |
| 3 | Salvar quantidade de usuários | `resolveTenantId` (tenant novo) e bloco `if (!isNewTenant)` (tenant existente); `subscribePlan` recebe e repassa para billing | ✅ |
| 4 | Criar registro de billing | `subscriptionService.subscribePlan()` → `invoiceService.createInvoice()` | ✅ |
| 5 | Gerar cobrança no gateway (Asaas) | `subscribePlan()` → `getActiveGateway()` → `gateway.createCharge()`; depois `updateInvoiceGatewayData()` | ✅ |

### Detalhamento

#### 1. Onde o tenant é criado

- **Arquivo:** `packages/backend/src/controllers/planPurchaseController.ts`
- **Função:** `resolveTenantId()`
- **Quando:** Chamada sem usuário logado (`!req.tenantId`), sem `body.tenant_id` válido, e com `company_name` ou `name` no body.
- **O que faz:**
  - Gera `slug` único a partir do nome.
  - **INSERT** em `tenants` com: `name`, `slug`, `plan_id`, `status = 'payment_pending'`, `created_via = 'registration'`, `billing_email`, `billing_phone`, `cpf_cnpj`, `responsible_name`.
  - Se `usersCount` informado: **UPDATE** em `tenants` com `max_users_override = usersCount`.
- **Conclusão:** O tenant é criado **antes** da cobrança (antes de `subscribePlan`).

#### 2. Onde o plano é associado ao tenant

- **Tenant novo:** no próprio **INSERT** em `resolveTenantId` (`plan_id` já vem no INSERT).
- **Tenant existente (logado ou `tenant_id` no body):** após `subscribePlan`, no **UPDATE** em `planPurchaseController.postPlanPurchase`:
  - `plan_id = body.plan_id`, `status = 'payment_pending'`, `max_users_override = COALESCE(usersCount, max_users_override)` e demais campos de billing/contato.

#### 3. Onde a quantidade de usuários é salva

- **Tenant novo:** em `resolveTenantId`, **UPDATE** em `tenants` com `max_users_override = usersCount` (se `usersCount != null && usersCount > 0`).
- **Tenant existente:** no **UPDATE** do bloco `if (!isNewTenant)` com `max_users_override = COALESCE($2, max_users_override)`.
- **Billing:** em `subscribePlan` → `createInvoice(invoiceData)` com `users_count: options?.usersCount ?? null`; a coluna **`tenant_billing.users_count`** é preenchida no **INSERT** de `createInvoice`.

**Persistência:**

- `tenants.max_users_override` — limite de usuários do tenant (usado pelo sistema).
- `tenant_billing.users_count` — quantidade de usuários naquela fatura (usado na ativação e auditoria).

#### 4. Onde o registro de billing é criado

- **Arquivo:** `packages/backend/src/services/subscriptionService.ts` → `subscribePlan()`.
- **Chamada:** `createInvoice(invoiceData)` em `packages/backend/src/services/invoiceService.ts`.
- **Dados:** `tenant_id`, `plan_id`, `billing_interval`, `amount_cents`, `due_date`, `source`, `billing_reason`, `users_count`, `gateway`.
- **INSERT** em `tenant_billing` com `status = 'pending'`. Após criar a cobrança no Asaas, `updateInvoiceGatewayData()` preenche `gateway`, `payment_method`, `asaas_payment_id`, `asaas_status`, `idempotency_key`.

---

## 2. Ordem: tenant antes ou depois da cobrança

- O tenant é **sempre** resolvido ou criado **antes** da cobrança.
- Sequência: `resolveTenantId()` → `subscribePlan(tenantId, ...)` → `createInvoice(tenant_id, ...)` → `createCharge()`.
- **Conclusão:** Ordem está correta (tenant existe antes do billing e do charge).

---

## 3. Quantidade de usuários no checkout

- **Checkout (front):** envia `users_count` no body do POST /api/plan-purchase (quando plano é custom).
- **Backend:**
  - `planPurchaseController` repassa `usersCount` para `resolveTenantId` e para `subscribePlan`.
  - **Tenant:** `tenants.max_users_override` é setado no INSERT (tenant novo) ou no UPDATE (tenant existente).
  - **Billing:** `tenant_billing.users_count` é setado em `createInvoice(invoiceData)`.
- **Conclusão:** A quantidade escolhida no checkout é persistida em **tenant** e em **billing**.

---

## 4. Ativação do plano após pagamento (webhook Asaas)

### Serviço de ativação

- **Função:** `subscriptionService.activatePlanFromBilling(billingId)`.
- **Arquivo:** `packages/backend/src/services/subscriptionService.ts`.
- **O que faz:**
  - Busca a fatura por `billingId`; se não existir ou `status !== 'paid'`, retorna.
  - Calcula `plan_period_start` (hoje) e `plan_period_end` (start + intervalo).
  - **UPDATE** em `tenants`: `plan_id`, `status = 'active'`, `plan_period_start`, `plan_period_end`, `activated_billing_id`, `max_users_override = COALESCE(users_count da fatura, max_users_override)`.

### Onde é chamada

- **Arquivo:** `packages/backend/src/modules/gateways/asaas/services/asaasService.ts`
- **Função:** `handlePaymentEvent()`.
- **Quando:** Após atualizar o billing para pago (`updateInvoiceStatus(row.id, 'paid', ...)`), é chamada `activatePlanFromBilling(row.id)`.

---

## 5. Webhook Asaas: eventos e fluxo

### Rota

- **POST /webhooks/asaas** → `asaasWebhookRoutes` → `asaasWebhookHandler` (`packages/backend/src/modules/gateways/asaas/webhooks/asaasWebhook.ts`).

### Eventos considerados “de pagamento”

- **Arquivo:** `packages/backend/src/modules/gateways/asaas/asaasEvents.ts`
- Lista: `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, etc.
- Se o evento for de pagamento (`isAsaasPaymentEvent(eventType)`) e houver `paymentId`, o handler chama `handlePaymentEvent()`.

### Tratamento em handlePaymentEvent

- **Arquivo:** `packages/backend/src/modules/gateways/asaas/services/asaasService.ts`
- Busca `tenant_billing` por `gateway = 'asaas' AND asaas_payment_id = asaasPaymentId`.
- Considera **pago** quando:
  - `params.eventType === 'PAYMENT_RECEIVED'` ou
  - `params.eventType === 'PAYMENT_CONFIRMED'` ou
  - `asaasStatus === 'RECEIVED'` ou
  - `asaasStatus === 'CONFIRMED'`.
- Se **pago:**
  1. `updateInvoiceStatus(row.id, 'paid', new Date(), paymentMethod)` (atualiza `tenant_billing.status`, `paid_at`, `payment_method`).
  2. Atualiza `tenant_billing.asaas_status`.
  3. Chama **`activatePlanFromBilling(row.id)`** (ativa o plano no tenant).
- Se **overdue:** atualiza `tenant_billing` para `status = 'overdue'` e `asaas_status`.
- Outros eventos: só atualiza `asaas_status` no billing.

### Nomes no código

- Não existe função com nome exato `activateTenantPlan()` ou `finalizeSubscription()`.
- A ativação é feita por **`activatePlanFromBilling(billingId)`** (subscriptionService).
- O Asaas exporta **`activatePlanForTenant({ tenantId, planId, billingId })`**, que apenas delega para `activatePlanFromBilling(billingId)`.

**Conclusão:** O webhook está preparado para **PAYMENT_CONFIRMED** e **PAYMENT_RECEIVED** e, ao considerar o pagamento como pago, chama o serviço de ativação (`activatePlanFromBilling`), que atualiza o tenant (plano, status, período, limite de usuários).

---

## 6. Resumo: o que está funcionando e o que falta

### Já implementado e funcionando

| Item | Detalhe |
|------|--------|
| 1. Criar tenant | Tenant criado em `resolveTenantId` (nome, slug, plan_id, status payment_pending, dados de billing/contato). |
| 2. Associar plano ao tenant | No INSERT (tenant novo) ou no UPDATE após subscribePlan (tenant existente). |
| 3. Salvar quantidade de usuários | Em `tenants.max_users_override` e em `tenant_billing.users_count`. |
| 4. Criar registro de billing | `createInvoice()` com todos os campos necessários, incluindo `users_count` e `gateway`. |
| 5. Gerar cobrança no Asaas | `getActiveGateway()` → `ensureCustomer()` → `createCharge()`; PIX com GET pixQrCode; `updateInvoiceGatewayData()`. |
| 6. Webhook: PAYMENT_RECEIVED / PAYMENT_CONFIRMED | Tratados em `handlePaymentEvent`; billing atualizado para `paid`; `activatePlanFromBilling(row.id)` é chamado. |
| 7. Ativação após pagamento | `activatePlanFromBilling`: atualiza tenant com `status = 'active'`, `plan_period_start`, `plan_period_end`, `activated_billing_id`, `max_users_override` a partir do billing. |
| 8. Liberar acesso ao tenant | Feito ao setar `tenants.status = 'active'` em `activatePlanFromBilling`. |
| 9. Aplicar limite de usuários | Feito com `max_users_override = COALESCE(billing.users_count, max_users_override)` no UPDATE do tenant em `activatePlanFromBilling`. |

### Pontos a validar / melhorar (não bloqueantes do fluxo básico)

| Ponto | Situação | Sugestão |
|-------|----------|----------|
| Registro do usuário pós-pagamento | Tenant fica `active` mas o usuário que comprou (não logado) ainda precisa se cadastrar e ser vinculado ao tenant. | Documentar fluxo “pagar → depois cadastrar” ou fluxo de “convite” ao tenant. |
| Duplicidade de eventos no webhook | Handler evita reprocessar por `event_id` e por `payload_hash`; eventos já processados retornam 200. | Opcional: idempotência explícita em `activatePlanFromBilling` (ex.: só ativar se tenant ainda não estiver active para esse billing). |
| URL do webhook no Asaas | Backend expõe POST /webhooks/asaas; é necessário configurar essa URL no painel Asaas. | Conferir em produção se a URL está configurada e acessível. |
| Logs de diagnóstico | Existem logs `[DIAG ...]` no resolver, subscription e asaas. | Remover ou reduzir em produção após validação. |

### O que não falta para o fluxo descrito

- Não é necessário implementar nova lógica de “ativar plano após pagamento”: já existe e é acionada pelo webhook.
- Não é necessário criar `activateTenantPlan()` ou `finalizeSubscription()` com outro nome: a ativação já está centralizada em `activatePlanFromBilling`.

---

## 7. Diagrama resumido do fluxo

```
[Checkout] POST /api/plan-purchase (plan_id, billing_interval, users_count, payment_method, dados empresa)
    │
    ▼
resolveTenantId()
    │ → Se não logado e sem tenant_id: INSERT tenants (plan_id, status=payment_pending, max_users_override)
    │ → Se tenant existente: usa req.tenantId ou body.tenant_id
    ▼
subscribePlan(tenantId, planId, billingInterval, { usersCount, paymentMethod, ... })
    │
    ├─ createInvoice() → INSERT tenant_billing (tenant_id, plan_id, users_count, gateway, status=pending)
    ├─ getActiveGateway() → ensureCustomer(tenantId) → createCharge(...)
    ├─ Asaas: POST /payments (billingType PIX/BOLETO/CREDIT_CARD); se PIX: GET /payments/{id}/pixQrCode
    └─ updateInvoiceGatewayData() → UPDATE tenant_billing (asaas_payment_id, asaas_status, ...)
    │
    ▼
Resposta 201: billing_id, invoice_number, amount_cents, pix_qr_code, pix_copy_paste, invoice_url, etc.

--- Após pagamento no Asaas ---

Asaas envia POST /webhooks/asaas (event: PAYMENT_RECEIVED ou PAYMENT_CONFIRMED)
    │
    ▼
asaasWebhookHandler → handlePaymentEvent()
    │
    ├─ Busca tenant_billing por asaas_payment_id
    ├─ Se evento = pago: updateInvoiceStatus(id, 'paid') → activatePlanFromBilling(id)
    ▼
activatePlanFromBilling(billingId)
    │
    └─ UPDATE tenants SET status='active', plan_period_start, plan_period_end, activated_billing_id, max_users_override
```

---

## Conclusão

O fluxo de contratação SaaS está implementado de ponta a ponta:

1. Tenant criado ou reutilizado antes da cobrança.  
2. Plano e quantidade de usuários associados ao tenant e gravados no billing.  
3. Billing criado e cobrança gerada no Asaas (incluindo PIX com QR Code).  
4. Webhook trata PAYMENT_RECEIVED e PAYMENT_CONFIRMED e chama `activatePlanFromBilling`.  
5. Ativação atualiza o tenant para `active`, define período do plano e aplica o limite de usuários.

Próximo passo recomendado: testar em ambiente de homologação (sandbox Asaas) o fluxo completo (checkout → pagamento PIX → webhook) e confirmar que a URL do webhook está configurada no Asaas e que o tenant fica `active` com `plan_period_start`/`plan_period_end` e `max_users_override` corretos.
