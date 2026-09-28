# Lista de Verificação: Implementação Ativação Automática de Planos

> Referência: [PLANO-ATIVACAO-AUTOMATICA-PLANOS-PAGAMENTO.md](./PLANO-ATIVACAO-AUTOMATICA-PLANOS-PAGAMENTO.md)

---

## Fase 1 – Modelagem do banco

### 1.1 tenant_billing – Novas colunas

| # | Tarefa | Status |
|---|--------|--------|
| 1.1.1 | Criar migration: `ALTER TABLE tenant_billing ADD COLUMN users_count INTEGER;` | ☐ |
| 1.1.2 | Criar migration: `ALTER TABLE tenant_billing ADD COLUMN source TEXT;` (valores: `superadmin`, `self_service`, `api`) | ☐ |
| 1.1.3 | Criar migration: `ALTER TABLE tenant_billing ADD COLUMN billing_reason TEXT;` (valores: `plan_purchase`, `plan_upgrade`, `plan_renewal`, `manual_charge`) | ☐ |
| 1.1.4 | Garantir coluna `payment_method` existe e está preenchida na criação e no webhook | ☐ |
| 1.1.5 | (Opcional) `ALTER TABLE tenant_billing ADD COLUMN gateway_payment_id TEXT;` se multi-gateway | ☐ |

### 1.2 tenant_billing – Índices

| # | Tarefa | Status |
|---|--------|--------|
| 1.2.1 | Verificar se existe índice em `asaas_payment_id`; se não: `CREATE INDEX idx_tenant_billing_payment ON tenant_billing(asaas_payment_id) WHERE asaas_payment_id IS NOT NULL;` | ☐ |
| 1.2.2 | `CREATE INDEX idx_tenant_billing_tenant_id ON tenant_billing(tenant_id);` — **já existe** em `33_tenant_billing.sql` | ☑ |

### 1.3 tenants – Novas colunas e status

| # | Tarefa | Status |
|---|--------|--------|
| 1.3.1 | `ALTER TABLE tenants ADD COLUMN plan_period_start DATE;` | ☐ |
| 1.3.2 | `ALTER TABLE tenants ADD COLUMN plan_period_end DATE;` | ☐ |
| 1.3.3 | `ALTER TABLE tenants ADD COLUMN activated_billing_id UUID REFERENCES tenant_billing(id);` | ☐ |
| 1.3.4 | Alterar CHECK de `tenants.status` para incluir `payment_pending`: `trial | payment_pending | active | suspended` | ☐ |

### 1.4 Validação

| # | Tarefa | Status |
|---|--------|--------|
| 1.4.1 | Rodar migration em ambiente de dev | ☐ |
| 1.4.2 | Confirmar que consultas atuais (Super Admin, webhook) continuam funcionando | ☐ |
| 1.4.3 | Backfill: tenants existentes com `plan_period_end = NULL` não devem ser bloqueados | ☐ |

---

## Fase 2 – Serviços de billing

### 2.1 BillingService

| # | Tarefa | Status |
|---|--------|--------|
| 2.1.1 | Criar arquivo `packages/backend/src/services/billingService.ts` | ☑ |
| 2.1.2 | Implementar `calculateInvoiceAmount(planId, billingInterval, usersCount?): number` (standard: plans.price_cents; custom: plan_interval_prices × users_count) | ☑ |
| 2.1.3 | Implementar `validatePlanForPurchase(planId, usersCount?): void` (plano existe, ativo, users_count obrigatório se custom) | ☑ |
| 2.1.4 | Testes unitários para cálculo standard e custom | ☐ |

### 2.2 InvoiceService

| # | Tarefa | Status |
|---|--------|--------|
| 2.2.1 | Criar arquivo `packages/backend/src/services/invoiceService.ts` | ☑ |
| 2.2.2 | Implementar `createInvoice(data: CreateInvoiceInput): TenantBilling` | ☑ |
| 2.2.3 | Implementar `getInvoiceByGatewayPaymentId(gateway, paymentId): TenantBilling \| null` | ☑ |
| 2.2.4 | Implementar `updateInvoiceStatus(billingId, status, paidAt?, paymentMethod?): void` | ☑ |
| 2.2.5 | Gerar `invoice_number` (ex.: INV-{tenant_id}-{seq}) na criação | ☑ |
| 2.2.6 | Testes unitários ou de integração | ☐ |

### 2.3 SubscriptionService

| # | Tarefa | Status |
|---|--------|--------|
| 2.3.1 | Criar arquivo `packages/backend/src/services/subscriptionService.ts` | ☑ |
| 2.3.2 | Implementar `subscribePlan(tenantId, planId, billingInterval, usersCount?): { billing, paymentUrls }` (Fase 3: sem gateway; Fase 4: com gateway) | ☑ |
| 2.3.3 | Implementar `activatePlanFromBilling(billingId): void` com lógica de 5.3 (calcular period_start/end, activated_billing_id) | ☑ |
| 2.3.4 | Implementar `addInterval(date, interval)` para monthly, quarterly, semi_annual, yearly | ☑ |
| 2.3.5 | Refatorar `activatePlanForTenant` existente para chamar `subscriptionService.activatePlanFromBilling` | ☑ |

### 2.4 Validação

| # | Tarefa | Status |
|---|--------|--------|
| 2.4.1 | Testes unitários ou de integração para cálculo e criação de invoice | ☐ |

---

## Fase 3 – Criação de invoices (sem gateway)

### 3.1 Endpoint POST /api/plan-purchase

| # | Tarefa | Status |
|---|--------|--------|
| 3.1.1 | Criar rota `POST /api/plan-purchase` em `planPurchaseRoutes.ts` ou similar | ☑ |
| 3.1.2 | Body: `{ plan_id: UUID, billing_interval?, users_count?, tenant_id?, name? }` | ☑ |
| 3.1.3 | Resolver tenant: req.tenantId (se logado), body.tenant_id ou criar tenant com status `payment_pending` (exige `name`) | ☑ |
| 3.1.4 | Validar plano via `billingService.validatePlanForPurchase` | ☑ |
| 3.1.5 | Calcular valor via `billingService.calculateInvoiceAmount` | ☑ |
| 3.1.6 | Criar registro em `tenant_billing` via `subscriptionService.subscribePlan` → `invoiceService.createInvoice` (sem gateway) | ☑ |
| 3.1.7 | Definir tenant: `plan_id`, `status = 'payment_pending'`, `max_users_override` (se custom) | ☑ |
| 3.1.8 | Retornar `{ billing_id, invoice_number, amount_cents, status, tenant_id }` (sem URLs por enquanto) | ☑ |

### 3.2 Validação

| # | Tarefa | Status |
|---|--------|--------|
| 3.2.1 | Teste manual: POST com plan_id standard → invoice criada | ☐ |
| 3.2.2 | Teste manual: POST com plan_id custom + users_count → valor correto | ☐ |

---

## Fase 4 – Integração com gateway

### 4.1 Fluxo subscribePlan com gateway

| # | Tarefa | Status |
|---|--------|--------|
| 4.1.1 | Em `subscribePlan`: chamar `getActiveGateway({ tenantId, billingType: 'saas' })` | ☑ |
| 4.1.2 | Chamar `ensureCustomer(tenantId)` no gateway | ☑ |
| 4.1.3 | Chamar `gateway.createCharge({ customerId, amountCents, dueDate, externalReference: tenantId, ... })` | ☑ |
| 4.1.4 | Persistir `asaas_payment_id` no `tenant_billing` via `updateInvoiceGatewayData` | ☑ |
| 4.1.5 | Obter e retornar `invoice_url`, `bank_slip_url`, `pix_qr_code`, `pix_copy_paste` na resposta | ☑ |

### 4.2 Endpoint completo

| # | Tarefa | Status |
|---|--------|--------|
| 4.2.1 | Atualizar response de POST /api/plan-purchase para incluir URLs de pagamento | ☑ |
| 4.2.2 | Garantir `payment_method` enviado ao gateway e persistido em tenant_billing | ☑ |

### 4.3 Validação

| # | Tarefa | Status |
|---|--------|--------|
| 4.3.1 | Teste end-to-end: criar cobrança → verificar registro no Asaas | ☐ |
| 4.3.2 | Verificar vínculo tenant_billing ↔ gateway_payment_id | ☐ |

---

## Fase 5 – Webhook e ativação automática

### 5.1 Idempotência no webhook

| # | Tarefa | Status |
|---|--------|--------|
| 5.1.1 | Em `handlePaymentEvent`: antes de processar, verificar `tenant_billing.status == 'paid'` → retornar sem processar | ☑ |
| 5.1.2 | Atualizar `payment_method` a partir do payload quando `payment.billingType` disponível | ☑ |
| 5.1.3 | `updateInvoiceStatus(id, 'paid', now(), paymentMethod)` + asaas_status em tenant_billing | ☑ |

### 5.2 activatePlanFromBilling

| # | Tarefa | Status |
|---|--------|--------|
| 5.2.1 | Dupla checagem: validar `tenant_billing.status == 'paid'` antes de ativar | ☑ |
| 5.2.2 | Calcular `plan_period_start = new Date()` | ☑ |
| 5.2.3 | Calcular `plan_period_end = addInterval(periodStart, billingInterval)` usando `tenant_billing.billing_interval` | ☑ |
| 5.2.4 | **Não** copiar period_start/period_end de tenant_billing (gateway) | ☑ |
| 5.2.5 | `UPDATE tenants SET plan_id, status='active', plan_period_start, plan_period_end, activated_billing_id, max_users_override, updated_at WHERE id=?` | ☑ |
| 5.2.6 | Para planos custom: definir `max_users_override` a partir de `tenant_billing.users_count` | ☑ |

### 5.3 Validação de período ativo

| # | Tarefa | Status |
|---|--------|--------|
| 5.3.1 | Middleware `requireActivePlanPeriod`: se `tenant.plan_period_end < now()` → 402 + code PLAN_EXPIRED, redirect /renovar-plano | ☑ |

### 5.4 Validação

| # | Tarefa | Status |
|---|--------|--------|
| 5.4.1 | Simular webhook PAYMENT_CONFIRMED → tenant ativo, plan_period_* preenchidos | ☐ |
| 5.4.2 | Enviar webhook duplicado → nenhuma duplicação de ativação | ☐ |

---

## Fase 6 – Interface de compra de plano

### 6.1 Página de preços / Landing

| # | Tarefa | Status |
|---|--------|--------|
| 6.1.1 | Adicionar botão "Contratar" em cada card de plano | ☑ |
| 6.1.2 | Botão abre modal (PlanPurchaseModal) | ☑ |

### 6.2 Checkout / Modal

| # | Tarefa | Status |
|---|--------|--------|
| 6.2.1 | Componente de seleção de `billing_interval` (monthly, quarterly, semi_annual, yearly) | ☑ |
| 6.2.2 | Se plano custom: input `users_count` + valor em tempo real | ☑ |
| 6.2.3 | Botão "Gerar cobrança" → POST /api/plan-purchase | ☑ |
| 6.2.4 | Tratamento de erros (toast) | ☑ |

### 6.3 Exibição de pagamento

| # | Tarefa | Status |
|---|--------|--------|
| 6.3.1 | Exibir `invoice_url` (link para página do gateway) | ☑ |
| 6.3.2 | Exibir `bank_slip_url` e/ou `pix_qr_code`, `pix_copy_paste` | ☑ |
| 6.3.3 | Mensagem "Aguardando pagamento" com instruções | ☑ |

### 6.4 Pós-pagamento

| # | Tarefa | Status |
|---|--------|--------|
| 6.4.1 | Modal exibe sucesso com links de pagamento | ☑ |
| 6.4.2 | Se novo tenant: fluxo de conclusão de cadastro (fora do escopo v1) | ☐ |

### 6.5 Meu Plano

| # | Tarefa | Status |
|---|--------|--------|
| 6.5.1 | Exibir "Assinar" / "Ver link de pagamento"; "Próxima cobrança" se ativo | ☑ |
| 6.5.2 | Exibir `plan_period_end` e aviso de renovação próxima | ☑ |

### 6.6 Validação

| # | Tarefa | Status |
|---|--------|--------|
| 6.6.1 | Fluxo completo: escolher plano → pagar → ver tenant ativo | ☐ |

---

## Opcional – Timeout de pagamento (48h)

| # | Tarefa | Status |
|---|--------|--------|
| O.1 | Job/cron: buscar `tenant_billing` com `status='pending'` e `created_at < now() - 48h` | ☑ |
| O.2 | Marcar billing como `cancelled` | ☑ |
| O.3 | Reverter tenant para `trial` (quando status = payment_pending) | ☑ |
| O.4 | Opcional: cancelar cobrança no gateway se suportado | ☐ |

**Como rodar:** `cd packages/backend && npm run cancel-expired-billings` (ou `npx tsx src/scripts/cancelExpiredBillings.ts`). Variável opcional `BILLING_EXPIRE_HOURS` (default 48). Agendar no cron, ex.: `0 * * * *` (a cada hora).

---

## Critérios de conclusão

| Fase | Entregável |
|------|------------|
| 1 | Migrations aplicadas; índices criados; tenants.status com payment_pending |
| 2 | billingService, invoiceService, subscriptionService implementados e testados |
| 3 | POST /api/plan-purchase retorna invoice (sem gateway) |
| 4 | Cobrança criada no Asaas; URLs de pagamento na resposta |
| 5 | Webhook ativa tenant; idempotência; plan_period_* calculados no backend |
| 6 | UI: botão Contratar, checkout, exibição de PIX/boleto |

---

## Ordem sugerida

1. Fase 1 (banco) — pré-requisito de tudo  
2. Fase 2 (serviços) — núcleo da lógica  
3. Fase 3 (endpoint sem gateway) — validar fluxo básico  
4. Fase 4 (gateway) — fechar criação de cobrança  
5. Fase 5 (webhook) — fechar ativação automática  
6. Fase 6 (frontend) — experiência do usuário  
