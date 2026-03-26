# Verificação completa da implementação — Customer Billing

**Data:** 25/02/2026  
**Objetivo:** Confirmar que todas as etapas da auditoria foram implementadas corretamente.  
**Escopo:** Apenas validação; nenhuma alteração de código.

---

## 1) DATABASE

### 1.1 Estrutura da tabela `customer_invoices`

**Migration base:** `70_customer_invoices.sql`  
**Migration de suporte a manuais:** `71_customer_invoices_manual_support.sql`

| Item | Status | Detalhe |
|------|--------|---------|
| Novas colunas | ✔ | `origin` (TEXT NOT NULL DEFAULT 'subscription'), `invoice_type` (TEXT NOT NULL DEFAULT 'recurring'), `description` (TEXT NULL) |
| Colunas opcionais | ✔ | `subscription_id`, `period_start`, `period_end` alterados para NULL (DROP NOT NULL) |
| CHECK status | ✔ | Constraint antiga removida; nova: `status IN ('pending', 'paid', 'overdue', 'cancelled', 'failed', 'refunded')` |
| CHECK origin | ✔ | `origin IN ('manual', 'subscription', 'api', 'import')` |
| CHECK invoice_type | ✔ | `invoice_type IN ('recurring', 'manual')` |
| Consistência origin/subscription | ✔ | `customer_invoices_origin_subscription_consistency`: (origin='subscription' AND subscription_id IS NOT NULL) OR (origin IN ('manual','api','import') AND subscription_id IS NULL) |
| UNIQUE(invoice_number) | ✔ | Após preenchimento de NULLs e desduplicação (CINV-LEGACY-{id}), constraint `customer_invoices_invoice_number_key` |
| Índice parcial (subscription_id, period_start) | ✔ | `idx_customer_invoices_subscription_period` UNIQUE WHERE subscription_id IS NOT NULL |
| Índice (gateway, asaas_payment_id) | ✔ | `idx_customer_invoices_gateway_asaas_payment_id` parcial WHERE gateway IS NOT NULL AND asaas_payment_id IS NOT NULL |
| Índice (tenant_id, created_at DESC) | ✔ | `idx_customer_invoices_tenant_created_at` |
| Índices tenant_status / tenant_due_date | ⚠ | **Não criados** como compostos. Existem índices simples em `tenant_id`, `status` e `due_date` (migration 70). O documento de validação considerou (tenant_id, status) e (tenant_id, due_date) **opcionais**. |
| RLS | ✔ | `ALTER TABLE customer_invoices ENABLE ROW LEVEL SECURITY`; policy `customer_invoices_tenant_policy` com `app_tenant_visible(tenant_id)` e WITH CHECK |

**Resumo DB:** Implementação alinhada à auditoria. Índices compostos (tenant_id, status) e (tenant_id, due_date) não foram criados (eram opcionais); podem ser adicionados depois se houver filtros frequentes por status/due_date por tenant.

---

## 2) SERVICES

### 2.1 customerInvoiceService.ts

| Item | Status | Detalhe |
|------|--------|---------|
| createManualCustomerInvoice | ✔ | Função implementada: INSERT com subscription_id/period_start/period_end NULL, origin='manual', invoice_type='manual'; gera invoice_number único (CINV-YYYY-XXXXXXXX) após INSERT |
| updateCustomerInvoiceStatus | ✔ | Atualiza status, paid_at (quando paid), asaas_status; usado pelo webhook |
| createCustomerInvoice (recorrência) | ✔ | **Não quebrado.** Continua recebendo subscription_id, period_start, period_end; INSERT inclui explicitamente origin='subscription', invoice_type='recurring' |
| Faturas manuais com subscription_id NULL | ✔ | createManualCustomerInvoice insere subscription_id, period_start, period_end como NULL |
| CustomerInvoiceRow | ✔ | Tipos atualizados: subscription_id, period_start, period_end como string \| null; origin, invoice_type, description presentes |
| CUSTOMER_INVOICE_SELECT_COLUMNS | ✔ | Exportado; usado em SELECT/RETURNING e em customerBillingService |
| findCustomerInvoiceBySubscriptionAndPeriod | ✔ | Continua filtrando por subscription_id e period_start (uso exclusivo do worker para recorrência) |
| updateCustomerInvoiceGatewayData | ✔ | Atualiza gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key |

### 2.2 customerBillingService.ts

| Item | Status | Detalhe |
|------|--------|---------|
| Serviço existe | ✔ | Arquivo criado; orquestra faturas manuais |
| createManualInvoice | ✔ | Valida client_id ∈ tenant (clientBelongsToTenant); chama createManualCustomerInvoice; integra gateway (getActiveConfig, getActiveGateway, ensureCustomerForClient, createCharge); externalReference = `tenant_${tenantId}_invoice_${invoiceId}`; updateCustomerInvoiceGatewayData |
| listInvoices | ✔ | Filtra por tenant_id; suporta client_id, status, limit, offset; ORDER BY created_at DESC |
| getInvoiceById | ✔ | WHERE id = $1 AND tenant_id = $2 |
| clientBelongsToTenant | ✔ | JOIN clients c + users u ON u.tenant_id = $1; garante que o cliente pertence ao tenant |

**Resumo Services:** createCustomerInvoice (recorrência) intacto; faturas manuais usam subscription_id NULL e createManualCustomerInvoice. Nenhuma alteração que quebre o Billing Engine.

---

## 3) BILLING ENGINE

### 3.1 recurringBillingJobService.ts

| Item | Status | Detalhe |
|------|--------|---------|
| Worker só com subscription_id | ✔ | Jobs vêm de subscriptions; processOneCustomerRenewalJob chama createCustomerInvoice com subscription_id = subscription.id; findCustomerInvoiceBySubscriptionAndPeriod(subscription_id, period_start) só retorna invoices de recorrência |
| createCustomerInvoice (worker) | ✔ | Usado apenas em processOneCustomerRenewalJob com subscription_id, period_start, period_end preenchidos |
| Nenhuma lógica quebrada | ✔ | Scheduler inalterado; worker type=saas (tenant_billing) e type=customer (customer_invoices com subscription_id) seguem o fluxo existente; faturas manuais não passam pelo worker |

**Resumo Billing Engine:** Worker continua funcionando apenas no contexto de subscriptions; faturas manuais são criadas somente via API (customerBillingService.createManualInvoice), sem uso do scheduler/jobs.

---

## 4) WEBHOOK

### 4.1 asaasService.handlePaymentEvent

| Item | Status | Detalhe |
|------|--------|---------|
| Suporte a customer_invoices | ✔ | Após buscar em tenant_billing, faz segundo lookup em customer_invoices por (gateway = 'asaas' AND asaas_payment_id = $1) |
| Ordem de lookup | ✔ | 1) tenant_billing (gateway = 'asaas', asaas_payment_id); 2) customer_invoices (mesmo critério); return após tratar o primeiro encontro |
| Não chama activatePlanFromBilling para customer_invoices | ✔ | activatePlanFromBilling é chamado apenas no bloco que trata row de tenant_billing; no bloco customer_invoices apenas updateCustomerInvoiceStatus (paid/overdue/asaas_status) |

**Resumo Webhook:** Ordem correta; isolamento entre billing SaaS e faturas de cliente; sem ativação de plano para customer_invoices.

---

## 5) SEGURANÇA

| Item | Status | Detalhe |
|------|--------|---------|
| RLS em customer_invoices | ✔ | Habilitado na migration 71; policy FOR ALL USING (app_tenant_visible(tenant_id)) WITH CHECK (app_can_bypass_rls() OR tenant_id = app_current_tenant_id()) |
| tenant_id filtrado na aplicação | ✔ | listInvoices(tenantId, filters): WHERE ci.tenant_id = $1; getInvoiceById(tenantId, id): WHERE id = $1 AND tenant_id = $2; createManualInvoice valida client via clientBelongsToTenant(tenantId, client_id); PATCH usa getInvoiceById e UPDATE ... WHERE id = $n AND tenant_id = $n+1 |
| customer_invoices em TENANT_SCOPED_TABLES | ✔ | Adicionado em utils/tenantSecurity.ts |

**Resumo Segurança:** RLS ativo; todas as operações de API e serviços filtram por tenant_id; tabela incluída no checklist de segurança do tenant.

---

## 6) API E ROTAS

| Item | Status | Detalhe |
|------|--------|---------|
| Rotas registradas | ✔ | index.ts: app.use('/api/customer-invoices', customerInvoicesRoutes) |
| tenantAuth | ✔ | customerInvoicesRoutes: router.use(...tenantAuth); todas as rotas protegidas |
| GET /api/customer-invoices | ✔ | listCustomerInvoices; tenantId de req.tenantId; listInvoices(tenantId, filters) |
| GET /api/customer-invoices/:id | ✔ | getCustomerInvoiceById; getInvoiceById(tenantId, id); 404 se não pertencer ao tenant |
| POST /api/customer-invoices | ✔ | createCustomerInvoice; body validado com Zod (client_id, amount_cents, due_date, description?, payment_method?); createManualInvoice(tenantId, body); 403 se cliente não pertence ao tenant |
| PATCH /api/customer-invoices/:id | ✔ | updateCustomerInvoice; getInvoiceById antes de alterar; permite description e status = 'cancelled' apenas se invoice.status === 'pending' |

---

## 7) RESUMO FINAL

### O que foi implementado

- **Database:** Migration 71 com novas colunas (origin, invoice_type, description), colunas opcionais (subscription_id, period_start, period_end), CHECKs atualizados, UNIQUE(invoice_number), índice parcial (subscription_id, period_start), índices (gateway, asaas_payment_id) e (tenant_id, created_at DESC), RLS e policy por tenant.
- **Services:** createManualCustomerInvoice e updateCustomerInvoiceStatus em customerInvoiceService; customerBillingService com createManualInvoice, listInvoices, getInvoiceById e clientBelongsToTenant; createCustomerInvoice (recorrência) preservado.
- **Billing Engine:** Worker inalterado no que diz respeito a subscriptions; faturas manuais fora do fluxo de jobs.
- **Webhook:** Lookup em tenant_billing primeiro, depois em customer_invoices; atualização de status para customer_invoices sem chamar activatePlanFromBilling.
- **Segurança:** RLS em customer_invoices; tenant_id em todas as queries de aplicação; customer_invoices em TENANT_SCOPED_TABLES.
- **API:** Rotas GET/POST/PATCH em /api/customer-invoices com tenantAuth e validação Zod.

### O que está faltando (opcional)

- Índices compostos **(tenant_id, status)** e **(tenant_id, due_date)** não foram criados; documentação de validação os considerou opcionais. Podem ser adicionados em uma migration futura se listagens filtradas por status ou due_date por tenant forem críticas.

### Possíveis problemas

- Nenhum bloqueante identificado. O worker para recorrência type=customer usa externalReference = clientId no gateway; o webhook não depende desse valor para customer_invoices (usa asaas_payment_id). Faturas manuais já usam externalReference = tenant_{tenantId}_invoice_{invoiceId} conforme planejado.

### Confirmação final

- **Pronto para uso via API:** Sim.  
- A implementação está alinhada à auditoria e ao plano: criação de faturas manuais, listagem e detalhe por tenant, atualização de descrição/cancelamento, integração com gateway e webhook, isolamento multi-tenant e RLS. Pode seguir para a próxima fase (ex.: frontend, testes E2E ou evoluções opcionais de índices).
