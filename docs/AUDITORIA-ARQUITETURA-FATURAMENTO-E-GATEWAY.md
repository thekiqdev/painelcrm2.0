# Auditoria completa — Arquitetura de faturamento e integração com gateway

**Objetivo:** Entender como o sistema está estruturado hoje (customer_invoices + Asaas) e identificar se já existe base para múltiplos gateways (Asaas, Mercado Pago, Banco Cora).  
**Escopo:** Apenas análise técnica; sem proposta de implementação nem refatoração.

---

## 1. Fluxo completo de criação de fatura (customer_invoices)

### 1.1 Visão geral

```
Frontend (CustomerInvoices.tsx)
    → POST /api/customer-invoices (body: client_id, amount_cents, due_date, description?, payment_method?)
    → customerInvoicesController.createCustomerInvoice
    → customerBillingService.createManualInvoice
    → [pré-condições] → [gateway] → [persistência]
    → resposta: { invoice, paymentUrls? }
```

### 1.2 Passo a passo (request → processamento → gateway → persistência)

| Etapa | Componente | Ação |
|-------|------------|------|
| 1 | **Controller** `customerInvoicesController.createCustomerInvoice` | Valida tenant, faz parse do body (Zod), chama `createManualInvoice(tenantId, body)`. |
| 2 | **customerBillingService.createManualInvoice** | Verifica `clientBelongsToTenant`; chama `validateInvoicePreconditions(tenantId, client_id)` (CPF do cliente + gateway configurado). |
| 3 | **Config** | `getActiveConfig('crm', tenantId)` → `payment_gateway_configs` (scope=tenant, status=active). Obtém `gateway_key` (ex.: `asaas`) e `credentials`. |
| 4 | **Gateway** | `getActiveGateway({ billingType: 'crm', tenantId })` → `gatewayResolver.resolvePaymentGateway` → `buildGateway(config.gateway_key, config)` → instância que implementa `PaymentGateway`. |
| 5 | **Cliente no gateway** | Busca `payment_customers` por (tenant_id, gateway_key, client_id). Se não existir, chama `gateway.ensureCustomerForClient(tenantId, clientId, clientData)` (nome, email, phone, cpf_cnpj). No Asaas: `asaasClient.createCustomer`; persiste em `payment_customers`. |
| 6 | **Cobrança no gateway** | `gateway.createCharge({ customerId, amountCents, dueDate, paymentMethod, description, idempotencyKey, externalReference })`. No Asaas: `asaasMapper.toAsaasPayment` + `asaasClient.createPayment` (POST /payments). Retorno: `{ paymentId, status, invoiceUrl?, bankSlipUrl?, pixQrCode?, pixCopyPaste? }`. |
| 7 | **Persistência fatura** | `customerInvoiceService.createManualCustomerInvoice(data)` → INSERT em `customer_invoices` (sem gateway/payment_id ainda). Depois `updateCustomerInvoiceGatewayData(invoice.id, { gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key })` → UPDATE com dados do gateway. |
| 8 | **Resposta** | Controller retorna 201 com `{ invoice, paymentUrls }` (invoiceUrl, bankSlipUrl, pixQrCode, pixCopyPaste). |

### 1.3 Observações do fluxo

- **Ordem:** Pré-condições → gateway (cliente + cobrança) → só então INSERT da fatura e UPDATE com IDs do gateway. Evita fatura “órfã” sem cobrança no gateway.
- **externalReference:** Montado no `customerBillingService` (tenant_id + client_id + due_date + shortId) para caber em 100 caracteres (limite Asaas). Usado no webhook para contexto; o webhook identifica a fatura por `gateway + asaas_payment_id`.
- **Idempotency:** `idempotency_key` gerado no service e enviado ao gateway; reconhecido pelo Asaas para evitar cobrança duplicada em retentativas.

---

## 2. Pontos de acoplamento ao Asaas

### 2.1 Onde o Asaas está diretamente acoplado

| Local | Tipo de acoplamento | Descrição |
|-------|---------------------|-----------|
| **gatewayResolver.ts** | Fallback hardcoded | Se `billingType === 'saas'` e não houver config no banco, chama `getAsaasGateway()` (variáveis de ambiente). Único gateway no fallback. |
| **gatewayRegistry.ts** | Registro único | Apenas `registerGateway('asaas', factory)`. A factory converte credentials em `AsaasConfig` e chama `getAsaasGateway(asaasConfig)`. |
| **customerBillingService.ts** | Nomes de retorno | Usa `chargeResult.paymentId` e `chargeResult.status` (genéricos), mas persiste em colunas `asaas_payment_id` e `asaas_status`. |
| **customerInvoiceService.ts** | Colunas e interface | `updateCustomerInvoiceGatewayData` recebe e grava `asaas_payment_id`, `asaas_status`. Interface TypeScript e SQL usam nomes Asaas. |
| **asaasService.handlePaymentEvent** | Lógica e SQL | Busca primeiro em `tenant_billing` com `gateway = 'asaas' AND asaas_payment_id = $1`; depois em `customer_invoices` com `gateway = 'asaas' AND asaas_payment_id = $1`. Atualiza status via `updateCustomerInvoiceStatus`. Toda a função é específica do fluxo Asaas (eventos PAYMENT_RECEIVED, etc.). |
| **asaasWebhook.ts** | Rota e handler | POST `/webhooks/asaas`; handler chama `handlePaymentEvent` do asaasService. Rota fixa por gateway. |
| **billingStatusController.ts** | Condição e coluna | Só faz polling no gateway se `row.gateway === 'asaas'`. Usa coluna `asaas_payment_id` no SELECT. |
| **invoiceService.ts** (tenant_billing) | Colunas e lookup | `findByGatewayAndPaymentId(gateway, paymentId)` usa `WHERE gateway = $1 AND asaas_payment_id = $2`. `updateInvoiceGatewayData` grava `asaas_payment_id`, `asaas_status`. |
| **billingReconciliationService.ts** | Colunas na persistência | Usa `updateInvoiceGatewayData` (tenant_billing) com `asaas_payment_id`, `asaas_status`. |
| **myTenantPaymentGatewayController.ts** | URL de webhook | Retorna `webhookUrl = ${baseUrl}/webhooks/asaas` fixo na resposta da config do tenant. |
| **Banco de dados** | Schema | `customer_invoices`: colunas `asaas_payment_id`, `asaas_status`. Índice `idx_customer_invoices_gateway_asaas_payment_id`. `tenant_billing`: colunas `asaas_payment_id`, `asaas_status` e índice por `gateway, asaas_payment_id`. |

### 2.2 Chamadas diretas ao “Asaas” (por nome)

- **gatewayResolver:** `import { getAsaasGateway } from '../gateways/asaas/index.js'`; chamada `getAsaasGateway()` no fallback saas.
- **gatewayRegistry:** `import { getAsaasGateway } from '../gateways/asaas/index.js'`; `registerGateway('asaas', ...)`.
- **asaasWebhook:** `import { handlePaymentEvent } from '../services/asaasService.js'` — handler do webhook é 100% Asaas.
- **billingStatusController:** condição `row.gateway === 'asaas'` antes de chamar `getActiveGateway` e `getPayment`.

Não há chamadas do tipo `asaasService.createPayment` a partir do fluxo de customer invoice: o fluxo usa sempre `getActiveGateway()` → `gateway.createCharge()`. A implementação concreta que executa é a do Asaas (asaasService.buildGateway → asaasClient.createPayment).

---

## 3. Estrutura atual de gateway (multi-gateway ou não?)

### 3.1 O que já existe e é reutilizável

| Elemento | Descrição | Multi-gateway? |
|----------|-----------|----------------|
| **PaymentGateway** (paymentGatewayTypes.ts) | Interface: `createCustomer`, `ensureCustomer?`, `ensureCustomerForClient?`, `createCharge`, `getPayment`, `getCharge?`. DTOs: `CreateChargeInput`, `CreateChargeResult`, etc. | Sim. Qualquer gateway pode implementar a mesma interface. |
| **gatewayResolver** | Resolve gateway por contexto (`billingType`, `tenantId`): lê config em `payment_gateway_configs`, chama `buildGateway(gateway_key, config)`. | Sim. Não conhece Asaas; só usa `gateway_key` e credentials. |
| **gatewayRegistry** | Map `gateway_key → factory(config)`. `buildGateway(key, config)` retorna `PaymentGateway \| null`. | Parcial. Registry é genérico, mas hoje só existe a factory do Asaas. |
| **gatewayProvider** | Fachada: `getActiveGateway(context)` delega ao resolver; `getActiveAsaasConfigForSaas()` é compatibilidade (usa config global para saas). | Resolver sim; `getActiveAsaasConfigForSaas` é Asaas-específico. |
| **paymentGatewayConfigService** | CRUD de configs (global/tenant); `getActiveConfig(billingType, tenantId)`; valida `gateway_key` em `payment_gateways`. | Sim. Não depende do Asaas. |
| **payment_gateways** | Catálogo (key, name, is_enabled, credentials_schema). Seed inicial só com `asaas`. | Sim. Basta inserir Mercado Pago, Cora, etc. |
| **payment_gateway_configs** | Config por escopo (global/tenant), `gateway_key`, credentials, status. | Sim. |

Conclusão: a **camada de orquestração** (resolver, registry, config, interface PaymentGateway) está preparada para múltiplos gateways. O que não está é: (1) implementações além do Asaas; (2) persistência e webhooks ainda amarradas a nomes/colunas Asaas.

### 3.2 O que é específico do Asaas

- **Módulo gateways/asaas:** cliente HTTP, tipos, mapper, eventos, webhook handler, `handlePaymentEvent` (atualiza tenant_billing e customer_invoices).
- **Persistência:** colunas `asaas_payment_id` e `asaas_status` em `customer_invoices` e `tenant_billing`; interfaces e funções que recebem/gravam esses nomes.
- **Webhook:** rota fixa `/webhooks/asaas` e handler que só entende eventos Asaas.
- **Fallback:** em saas, quando não há config, `getAsaasGateway()` (env).

Não existe hoje um “PaymentService” ou “GatewayService” genérico que abstraia o nome do gateway na persistência (ex.: um único campo `gateway_payment_id` ou JSON por gateway). O serviço de negócio (`customerBillingService`) chama a interface genérica mas depois grava em colunas com nome Asaas.

---

## 4. Modelo de dados (customer_invoices e gateway)

### 4.1 customer_invoices (schema relevante)

- **gateway:** TEXT NULL — identificador do gateway (ex.: `asaas`). Já genérico.
- **payment_method:** TEXT NULL — PIX, BOLETO, CREDIT_CARD. Genérico.
- **asaas_payment_id:** TEXT NULL — ID do pagamento no gateway.
- **asaas_status:** TEXT NULL — status vindo do gateway.

Índice: `idx_customer_invoices_gateway_asaas_payment_id` em `(gateway, asaas_payment_id)` WHERE gateway e asaas_payment_id NOT NULL.

### 4.2 Avaliação para múltiplos gateways

| Aspecto | Situação | Comentário |
|---------|----------|------------|
| Identificação do gateway | OK | Coluna `gateway` (ex.: asaas, mercadopago, cora). |
| ID do pagamento no gateway | Acoplado | Coluna se chama `asaas_payment_id`. Para outro gateway seria outro ID (ex.: Mercado Pago); hoje não há coluna genérica tipo `gateway_payment_id`. |
| Status no gateway | Acoplado | Coluna `asaas_status`. Outros gateways têm seus próprios status; não há coluna genérica `gateway_status` ou equivalente. |
| Lookup no webhook | Acoplado | O handler Asaas faz `WHERE gateway = 'asaas' AND asaas_payment_id = $1`. Para multi-gateway seria necessário: (a) coluna genérica de payment_id e buscar por `gateway + gateway_payment_id`, ou (b) um handler por gateway que saiba em qual coluna escrever. |

Resumo: o modelo **não está** preparado para múltiplos gateways sem mudança. É necessário generalizar o armazenamento do ID e do status do pagamento (ex.: `gateway_payment_id` + `gateway_status`, ou manter `asaas_*` só para gateway asaas e adicionar colunas por outro gateway — não escalável).

### 4.3 tenant_billing

Mesma situação: colunas `gateway`, `asaas_payment_id`, `asaas_status` e índice por `gateway, asaas_payment_id`. Comentários equivalentes ao de customer_invoices.

---

## 5. Problemas identificados (impedem ou dificultam múltiplos gateways)

1. **Colunas com nome do gateway no schema**  
   `asaas_payment_id` e `asaas_status` em `customer_invoices` e `tenant_billing`. Qualquer novo gateway exigiria colunas novas (ex.: `mercadopago_payment_id`) ou migração para nomes genéricos (`gateway_payment_id`, `gateway_status`).

2. **Interfaces e serviços que recebem “asaas_*”**  
   `customerInvoiceService.updateCustomerInvoiceGatewayData` e `invoiceService.updateInvoiceGatewayData` têm parâmetros e SQL com `asaas_payment_id` e `asaas_status`. Código que chama (customerBillingService, billingReconciliationService, recurringBillingJobService) passa `chargeResult.paymentId` e `chargeResult.status` para esses parâmetros — hoje funciona porque só existe Asaas; o “contrato” do tipo está atado ao nome Asaas.

3. **Webhook 100% Asaas**  
   Um único endpoint `/webhooks/asaas` e um handler que atualiza tenant_billing e customer_invoices com lógica e colunas Asaas. Para Mercado Pago e Cora seria necessário: rota própria por gateway (ex.: `/webhooks/mercadopago`), handler que identifique a fatura/cobrança e atualize status usando um modelo de dados genérico (não `asaas_status`).

4. **handlePaymentEvent acoplado a tabelas e colunas**  
   `asaasService.handlePaymentEvent` faz SELECT por `gateway = 'asaas' AND asaas_payment_id` e UPDATE em `tenant_billing`/`customer_invoices` com `asaas_status`. Para outro gateway seria preciso ou duplicar lógica (por gateway) ou generalizar: um “payment event handler” que recebe (gateway_key, payment_id, status) e atualiza uma estrutura única (ex.: gateway_payment_id + gateway_status).

5. **billingStatusController**  
   Condição `row.gateway === 'asaas'` antes de consultar o gateway. Para outros gateways seria necessário usar o gateway resolvido por `row.gateway` e chamar `getPayment` sem hardcode de nome, e persistir status em coluna genérica.

6. **URL de webhook na API do tenant**  
   `myTenantPaymentGatewayController` retorna sempre `webhookUrl = .../webhooks/asaas`. Com vários gateways, a URL deveria depender do `gateway_key` da config (ex.: `/webhooks/mercadopago` para config Mercado Pago).

7. **Índice com nome no meio**  
   `idx_customer_invoices_gateway_asaas_payment_id` e equivalente em tenant_billing: o nome do índice é Asaas; a definição (gateway + asaas_payment_id) funciona para qualquer gateway desde que o valor seja guardado na mesma coluna. Ou seja: o problema é o nome da coluna, não do índice em si.

8. **Fallback saas**  
   Quando não há config global, o resolver usa `getAsaasGateway()`. Com múltiplos gateways não faz sentido fallback para um único; ou não há fallback ou há regra explícita (ex.: gateway padrão configurável).

9. **Reconciliação e recorrência**  
   `billingReconciliationService` e `recurringBillingJobService` usam a interface `PaymentGateway` (createCharge, ensureCustomer, etc.) e `getActiveConfig`/`getActiveGateway`. A única parte acoplada é a persistência do resultado (`asaas_payment_id`/`asaas_status`). Trocar para colunas genéricas permitiria reaproveitar o mesmo fluxo para qualquer gateway.

---

## 6. Riscos atuais e possíveis bugs futuros

- **Manutenção:** Qualquer mudança em “ID de pagamento” ou “status” exige tocar em vários pontos (customer_invoices, tenant_billing, invoiceService, customerInvoiceService, asaasService, billingStatusController). Risco de inconsistência (ex.: atualizar um e esquecer outro).
- **Novo gateway:** Incluir Mercado Pago ou Cora sem refatorar exige colunas novas por gateway e lógica duplicada no webhook e no status. Aumenta complexidade e chance de erro.
- **Testes:** Mocks e testes que dependem de “asaas_payment_id” ou “asaas_status” quebram se um dia as colunas forem renomeadas para genéricas sem um plano único de migração e atualização de tipos.
- **Webhook e idempotência:** O handler Asaas persiste eventos em `asaas_webhook_events` e evita reprocessamento por hash/event_id. Outro gateway precisará de estratégia equivalente (tabela por gateway ou tabela genérica com gateway_key).

---

## 7. Oportunidades (o que já está bem e pode ser reaproveitado)

1. **Interface PaymentGateway e DTOs**  
   Bem definidos e usados em todo o fluxo de criação de cobrança (customer + charge). Novos gateways só precisam implementar a mesma interface e serem registrados no registry.

2. **Resolução por contexto (billingType + tenantId)**  
   `getActiveConfig` e `resolvePaymentGateway` já separam saas (global) e crm (tenant). Suporta um gateway por contexto sem mudar a lógica de resolução.

3. **Catálogo e config por escopo**  
   `payment_gateways` e `payment_gateway_configs` já permitem vários gateways e credenciais por tenant/global. Falta apenas seed para Mercado Pago/Cora e uso das configs na resolução (já usado para Asaas).

4. **Fluxo “gateway antes da fatura”**  
   Ordem createCharge → depois persistir fatura e atualizar com payment_id evita órfãs e está correta para qualquer gateway.

5. **payment_customers**  
   Estrutura por (tenant_id, gateway_key, client_id) e (tenant_id, gateway_key) para saas já é agnóstica; Asaas só preenche `gateway_customer_id`. Reaproveitável para outros gateways.

6. **Idempotency e externalReference**  
   Uso de idempotency_key e externalReference no createCharge é genérico; cada gateway pode mapear para o que sua API oferece (Asaas já usa).

7. **Logger e diagnóstico**  
   `logGatewayOperation` e logs [DIAG] no asaasService são por gateway; podem ser mantidos em qualquer implementação.

8. **Webhook events (Asaas)**  
   Tabela e deduplicação por event_id/hash podem servir de modelo para um padrão genérico de “payment_webhook_events” com gateway_key.

---

## 8. Resumo executivo

| Pergunta | Resposta |
|----------|----------|
| Existe base para múltiplos gateways? | **Sim** na camada de orquestração: interface PaymentGateway, resolver, registry, configs e catálogo. **Não** na persistência e no webhook: colunas e handlers são Asaas-específicos. |
| Onde está o acoplamento direto ao Asaas? | Colunas `asaas_payment_id` e `asaas_status`; funções que as recebem/gravam; handler do webhook e `handlePaymentEvent`; fallback no resolver; URL de webhook fixa na API do tenant; condição `gateway === 'asaas'` no billing status. |
| O que precisa mudar para multi-gateway? | (1) Generalizar armazenamento do pagamento (ex.: `gateway_payment_id`, `gateway_status` ou equivalente). (2) Generalizar update de status (customer_invoices e tenant_billing) sem nomes Asaas. (3) Webhook por gateway (rotas + handlers) ou dispatcher por gateway_key que atualize um modelo único. (4) Remover ou parametrizar fallback e URL de webhook. (5) Implementar e registrar PaymentGateway para Mercado Pago e Cora. |
| Riscos atuais | Manutenção espalhada; duplicação de lógica e colunas se adicionar gateway sem refatorar; testes e tipos atados a “asaas_*”. |
| O que reaproveitar | Interface e DTOs, resolver, registry, configs, fluxo “gateway antes da fatura”, payment_customers, idempotency/externalReference, padrão de webhook events. |

Esta auditoria serve de base para um plano de evolução (refatoração de modelo e webhooks + novas implementações de gateway) quando for decidido suportar múltiplos gateways.
