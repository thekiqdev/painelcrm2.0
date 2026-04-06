# Relatório de Auditoria Técnica — Pós-Implementação Multi-Gateway

**Data da auditoria:** Verificação do estado atual do código e do banco (sem alterações).  
**Escopo:** Conformidade com o plano aprovado em `docs/PLANO-REFATORACAO-MULTI-GATEWAY.md`.  
**Regra:** Nenhuma implementação ou alteração foi feita; apenas análise e relatório.

---

## 1) DATABASE VALIDATION

### 1.1 Estrutura real encontrada (migrations)

**Migrations analisadas:** `59`, `63`, `70`, `71`, `73`, `74`.

| Item | customer_invoices | tenant_billing | payment_events |
|------|-------------------|----------------|----------------|
| **gateway_reference_id** | ✅ Adicionado em 73 (TEXT NULL) | ✅ Adicionado em 73 (TEXT NULL) | — |
| **gateway_metadata** | ✅ 73 (JSONB NULL) | ✅ 73 (JSONB NULL) | — |
| **gateway_status** | ✅ 73 (TEXT NULL) | ✅ 73 (TEXT NULL) | — |
| **asaas_payment_id / asaas_status** | ❌ Removidos em 74 | ❌ Removidos em 74 | — |
| **idempotency_key** | ✅ Já existia em 70 | ✅ 59 | — |
| **UNIQUE (gateway, gateway_reference_id)** | ✅ 73, WHERE gateway_reference_id IS NOT NULL | ✅ 73, idem | — |
| **Índice antigo asaas_payment_id** | ✅ Removido em 74 (idx_customer_invoices_gateway_asaas_payment_id) | ✅ Removidos em 74 (idx_tenant_billing_gateway_asaas_payment_id, idx_tenant_billing_asaas_payment_id) | — |
| **Tabela payment_events** | — | — | ✅ 73 |
| **payment_events: id, gateway, event_id, reference_id, payload, processed, processed_at, processed_result, created_at** | — | — | ✅ 73 |
| **payment_events: UNIQUE (gateway, event_id)** | — | — | ✅ 73 (constraint uq_payment_events_gateway_event_id) |

**Backfill:** Migration 73 executa UPDATE em `customer_invoices` e `tenant_billing` copiando `asaas_payment_id` → `gateway_reference_id` e `asaas_status` → `gateway_status` onde existir. ✅ Conforme.

**Ordem de migrations:** 73 (colunas genéricas + payment_events + backfill + UNIQUE) antes de 74 (DROP colunas e índices asaas). ✅ Consistente.

### 1.2 CHECK de status — divergência com o plano

O plano (seção 4.1) exige que o CHECK aceite: `pending`, `waiting_payment`, `processing`, `paid`, `overdue`, `cancelled`, `failed`, `refunded`.

**customer_invoices (71):**  
`CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled', 'failed', 'refunded'))`.  
**Faltam:** `waiting_payment`, `processing`.

**tenant_billing (63):**  
`CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled'))`.  
**Faltam:** `waiting_payment`, `processing`, `failed`, `refunded`.

**Consequência:** O tipo TypeScript `InternalPaymentStatus` e a função `normalizeGatewayStatus` incluem `waiting_payment` e `processing`, mas o banco não os aceita. O código atual faz cast para `'pending' | 'paid' | 'overdue' | 'cancelled'` ao chamar `updateInvoiceStatus`, então o Asaas não quebra. Porém, um futuro gateway que normalize para `waiting_payment` ou `processing` causaria violação de CHECK ao atualizar `status`. **Risco:** falha em UPDATE ao integrar gateways com estados intermediários.

### 1.3 Resumo database

| O que bate com o plano | O que não bate |
|------------------------|----------------|
| Colunas genéricas em ambas as tabelas | CHECK de status não expandido para waiting_payment, processing (e em tenant_billing também failed, refunded) |
| Backfill asaas_* → gateway_* | — |
| UNIQUE (gateway, gateway_reference_id) | — |
| payment_events com todas as colunas e UNIQUE (gateway, event_id) | — |
| Remoção de asaas_payment_id/asaas_status e índices antigos (74) | — |

**Banco:** Pronto para múltiplos gateways do ponto de vista de colunas e índices. **Não** está alinhado ao plano no que diz respeito aos status intermediários no CHECK (estado intermediário não implementado no schema).

---

## 2) SERVICE LAYER VALIDATION

### 2.1 Métodos e assinaturas auditados

| Arquivo | Método / tipo | Conformidade |
|---------|----------------|--------------|
| **paymentGatewayTypes.ts** | `GatewayPaymentData`: gateway, payment_method, gateway_reference_id, gateway_metadata?, gateway_status, idempotency_key? | ✅ Conforme; sem asaas_* |
| **customerInvoiceService.ts** | `CustomerInvoiceRow`: sem asaas_payment_id/asaas_status; apenas gateway_reference_id, gateway_metadata, gateway_status | ✅ |
| **customerInvoiceService.ts** | `updateCustomerInvoiceGatewayData(invoiceId, data: GatewayPaymentData)`: UPDATE só gateway_* e idempotency_key | ✅ Sem dual write |
| **customerInvoiceService.ts** | `updateCustomerInvoiceStatus(invoiceId, status, paidAt?, gatewayStatus?)`: UPDATE status e gateway_status | ✅ |
| **invoiceService.ts** | `TenantBillingRow` e `CreateInvoiceInput`: sem asaas_* | ✅ |
| **invoiceService.ts** | `createInvoice`: INSERT sem asaas_*; RETURNING com gateway_* | ✅ |
| **invoiceService.ts** | `updateInvoiceGatewayData(billingId, data: GatewayPaymentData)`: só gateway_* | ✅ |
| **invoiceService.ts** | `updateInvoiceStatus(..., gatewayStatus?)`: atualiza status e gateway_status | ✅ |
| **invoiceService.ts** | `getInvoiceByGatewayReferenceId(gateway, referenceId)`: WHERE gateway AND gateway_reference_id | ✅ |
| **customerBillingService.ts** | Chamada a `updateCustomerInvoiceGatewayData` com gateway_reference_id, gateway_status | ✅ |
| **recurringBillingJobService.ts** | `updateInvoiceGatewayData` e `updateCustomerInvoiceStatus` com dados genéricos | ✅ |
| **subscriptionService.ts** | `updateInvoiceGatewayData` com gateway_reference_id, gateway_status | ✅ |
| **billingReconciliationService.ts** | Query por `gateway_reference_id IS NULL`; `updateInvoiceGatewayData` com dados genéricos | ✅ |

### 2.2 Pontos ainda acoplados ao Asaas

- **Fallback de gateway_key:** Vários serviços usam `config?.gateway_key ?? 'asaas'` como valor default. Isso é configuração/fallback, não persistência; aceitável para ambiente com Asaas como padrão.
- **getActiveAsaasConfigForSaas** (gatewayProvider.ts): Usado em `tenantsController` (createTenantCharge) para passar config ao `ensureCustomerForTenant`. Específico do Asaas; não bloqueia multi-gateway, pois o gateway efetivo vem de `getActiveConfig('saas')` e `getActiveGateway`.
- **Teste de conexão** (myTenantPaymentGatewayController): `postMyTenantPaymentGatewayTest` verifica `config.gateway_key !== 'asaas'` e chama `testConnection` do módulo Asaas. Outros gateways precisarão de teste próprio; não impede registrar novo gateway.

**Conclusão:** Persistência desacoplada do Asaas. Leitura e escrita usam apenas o modelo genérico. Não há escrita direta em asaas_payment_id ou asaas_status no código.

---

## 3) WEBHOOK ARCHITECTURE VALIDATION

### 3.1 Desenho real encontrado

```
POST /webhooks/asaas  →  asaasWebhookHandler (Express)
       ↓
  getEventPayload (local) + isAsaasPaymentEvent
       ↓
  asaas_webhook_events (hash + event_id) — idempotência legada
       ↓
  handleWebhook('asaas', body)  [webhookCore]
       ↓
  asaasWebhookParser.parsePayload(body)  →  ParsedWebhookPayload
       ↓
  insertPaymentEvent (payment_events)  →  se conflito 23505 → 200
       ↓
  findBillingOrCustomerInvoice(gateway, referenceId)  [tenant_billing depois customer_invoices]
       ↓
  normalizeGatewayStatus(gatewayKey, externalStatus)
       ↓
  applyPaymentEvent(...)  [paymentDomainService]
       ↓
  canTransition? → updateInvoiceStatus / updateCustomerInvoiceStatus; activatePlanFromBilling se tenant_billing+paid
       ↓
  markPaymentEventProcessed(eventId, processedResult)
```

### 3.2 Verificação das 3 camadas

| Camada | Existe? | Comportamento |
|--------|---------|----------------|
| **A. gatewayParser** | ✅ | Asaas: `asaasWebhookParser.parsePayload` → `{ eventId, referenceId, externalStatus, metadata? }`. Só traduz payload; não acessa banco. |
| **B. webhookCore** | ✅ | `handleWebhook(gatewayKey, payload)`: obtém parser por gateway, parse, `insertPaymentEvent` (idempotência), `findBillingOrCustomerInvoice(gateway, referenceId)`, `normalizeGatewayStatus`, chama `applyPaymentEvent`. |
| **C. paymentDomainService** | ✅ | `applyPaymentEvent`: `canTransition`; atualiza status e gateway_status via `updateInvoiceStatus` / `updateCustomerInvoiceStatus`; para tenant_billing + paid chama `activatePlanFromBilling`; retorna `ProcessedResult`; webhookCore chama `markPaymentEventProcessed`. |

### 3.3 Itens adicionais

- **handlePaymentEvent (asaasService):** Reduzido a wrapper que chama `handleWebhook(GATEWAY_KEY, payload)`. Não contém mais lógica antiga. ✅
- **Rota:** Ainda fixa `app.use('/webhooks/asaas', asaasWebhookRoutes)`. Para novo gateway é necessário registrar rota `/webhooks/{gateway_key}` e handler que chame `handleWebhook(gateway_key, body)`. Estrutura suporta isso. ✅
- **SQL no webhook:** Nenhum uso de asaas_payment_id ou asaas_status; lookup apenas por gateway_reference_id. ✅

**Conclusão:** As 3 camadas estão implementadas; webhook desacoplado do Asaas no fluxo de negócio (parser por gateway + core único + domain único).

---

## 4) IDEMPOTENCY VALIDATION

### 4.1 Criação da cobrança

- **idempotency_key:** Presente em `customer_invoices` e `tenant_billing`; usado em `createManualInvoice`, `subscribePlan`, `recurringBillingJobService`, `tenantsController.createTenantCharge`.
- **Uso:** Enviado ao gateway em `createCharge` (ex.: idempotencyKey) e persistido em `updateCustomerInvoiceGatewayData` / `updateInvoiceGatewayData` (idempotency_key na tabela).
- **Unicidade:** Por operação/fatura (ex.: subscription + period, ou manual com chave própria). ✅ Conforme.

### 4.2 Webhook (payment_events)

- **Uso:** `insertPaymentEvent` faz INSERT em `payment_events`. Conflito 23505 (UNIQUE gateway, event_id) → retorna `{ inserted: false }`; webhookCore retorna 200 sem reprocessar. ✅
- **processed e processed_result:** Após aplicar o evento, `markPaymentEventProcessed` define processed = true, processed_at = now(), processed_result = JSON (previous_status, new_status, action, reason). ✅
- **Replay seguro:** O plano prevê “comando ou endpoint interno (ex.: admin) que permita reprocessar um evento por id”. **Não implementado** no código; apenas documentado. Divergência menor (replay é caso de suporte/debug).

**Conclusão:** Idempotência na criação (idempotency_key) e no webhook (payment_events) está ativa. processed_result preenchido. Replay não implementado.

---

## 5) STATUS MODEL VALIDATION

### 5.1 Fonte da verdade e papéis

- **status:** Usado como fonte da verdade nas decisões (ex.: billingStatusController, activatePlanFromBilling). ✅
- **gateway_status:** Apenas atualizado com valor bruto do gateway; não usado para regras de negócio. ✅
- **Webhook:** Responsável por normalizar e persistir status; polling/reconciliação usados como correção. ✅

### 5.2 normalizeGatewayStatus e canTransition

- **normalizeGatewayStatus(gatewayKey, externalStatus):** Existe em `statusNormalizer.ts`; mapeamento Asaas (RECEIVED/CONFIRMED→paid, OVERDUE→overdue, etc.); retorna tipo `InternalPaymentStatus`. ✅
- **canTransition(currentStatus, newStatus):** Existe; usa ordem e conjunto FINAL; não permite regressão (ex.: paid não volta para pending); permite overdue→paid. ✅

### 5.3 Comportamento no código

- **paid → pending:** Bloqueado por `canTransition`; retorno `skipped_regression` e atualização só de gateway_status; processed_result registrado. ✅
- **cancelled → processing:** Bloqueado (cancelled está em FINAL). ✅
- **overdue → paid:** Permitido. ✅
- **Evento duplicado:** Idempotência por payment_events; segundo evento retorna 200 sem aplicar. ✅

### 5.4 Restrição do banco

- **InternalPaymentStatus** inclui `waiting_payment` e `processing`, mas o CHECK do banco (em ambas as tabelas) **não** os aceita. O código só persiste o subconjunto aceito pelo CHECK (cast em `applyPaymentEvent`). Portanto a anti-regressão e a lógica de status estão implementadas na aplicação; o schema não foi expandido para estados intermediários conforme o plano.

**Conclusão:** Modelo de status e anti-regressão implementados na aplicação; fonte da verdade e papel do gateway_status conformes. CHECK de status no banco incompleto em relação ao plano.

---

## 6) ASAAS COMPATIBILITY VALIDATION

- **Criação de cobrança manual (customer):** createManualInvoice → createCharge → updateCustomerInvoiceGatewayData com gateway_reference_id, gateway_status. ✅
- **Criação tenant (createTenantCharge):** INSERT em tenant_billing com gateway_reference_id, gateway_metadata, gateway_status; idempotency por gateway_reference_id. ✅
- **Webhook Asaas:** asaasWebhookHandler → handleWebhook('asaas', body) → parser → payment_events → find por gateway_reference_id → normalize → apply. ✅
- **Atualização de status:** updateCustomerInvoiceStatus / updateInvoiceStatus com gateway_status; activatePlanFromBilling para tenant_billing pago. ✅
- **Polling (getBillingStatus):** SELECT por gateway_reference_id; getActiveGateway().getPayment(gateway_reference_id); updateInvoiceStatus + activatePlanFromBilling. ✅
- **Reconciliação:** getPendingInvoicesWithoutPaymentId por gateway_reference_id IS NULL; createCharge com idempotency_key; updateInvoiceGatewayData. ✅

**Conclusão:** Fluxo Asaas utiliza o novo modelo (gateway_reference_id, gateway_status). Compatibilidade preservada; não há dependência de colunas legadas no código.

---

## 7) MULTI-GATEWAY READINESS VALIDATION

- **gatewayRegistry:** Genérico (Map gateway_key → factory); Asaas registrado como `registerGateway('asaas', ...)`. ✅
- **gatewayResolver / getActiveGateway:** Resolução por config (gateway_key); não hardcode de gateway na persistência. ✅
- **PaymentGateway:** Interface estável; createCharge retorna paymentId/status; getPayment(paymentId). ✅
- **Persistência:** Sem asaas_*; apenas gateway_reference_id, gateway_metadata, gateway_status. ✅
- **Webhook:** Lookup por (gateway, gateway_reference_id); payment_events por gateway; processed_result genérico. ✅
- **URL de webhook:** getMyTenantPaymentGatewayConfig retorna webhookUrl = `${baseUrl}/webhooks/${config.gateway_key}`. ✅
- **Hardcode gateway === 'asaas':** Apenas em getActiveAsaasConfigForSaas (config SaaS) e no teste de conexão (postMyTenantPaymentGatewayTest). Não em fluxo crítico de persistência ou webhook. ✅

**O que falta para integrar outro gateway (ex.: Mercado Pago, Cora) sem refatoração adicional:**

1. **Registrar factory** em `gatewayRegistry` (ex.: `registerGateway('mercadopago', ...)`).
2. **Implementar parser** (ex.: `parseMercadopagoWebhookPayload`) e `registerGatewayParser('mercadopago', parser)`.
3. **Nova rota** (ex.: `app.use('/webhooks/mercadopago', mercadopagoWebhookRoutes)` com handler que chama `handleWebhook('mercadopago', body)`).
4. **normalizeGatewayStatus:** Incluir ramo para o novo gateway_key (já preparado no código).
5. **CHECK de status (opcional mas recomendado):** Expandir CHECK em `customer_invoices` e `tenant_billing` para incluir `waiting_payment` e `processing` (e em tenant_billing também `failed`, `refunded`) se o novo gateway usar esses estados; caso contrário, manter mapeamento apenas para o subconjunto atual para evitar erro de constraint.

**Conclusão:** Sistema pronto para múltiplos gateways no código e no fluxo. Único ponto de atenção é o CHECK de status se um futuro gateway precisar persistir waiting_payment/processing (e em tenant_billing também failed/refunded).

---

## 8) RELATÓRIO FINAL OBRIGATÓRIO

### A. O que foi implantado corretamente

- Schema genérico: gateway_reference_id, gateway_metadata, gateway_status em customer_invoices e tenant_billing.
- Remoção de asaas_payment_id e asaas_status (migration 74) e dos índices antigos.
- Backfill asaas_* → gateway_* na migration 73.
- UNIQUE (gateway, gateway_reference_id) em ambas as tabelas.
- Tabela payment_events com id, gateway, event_id, reference_id, payload, processed, processed_at, processed_result, created_at e UNIQUE (gateway, event_id).
- Interface GatewayPaymentData e uso apenas de colunas genéricas nos serviços.
- updateCustomerInvoiceGatewayData e updateInvoiceGatewayData sem dual write; chamadores passando dados genéricos.
- Tipos CustomerInvoiceRow e TenantBillingRow sem asaas_*; SELECTs e INSERTs sem essas colunas.
- Webhook em 3 camadas: parser Asaas, webhookCore (idempotência, find, normalize, delegate), paymentDomainService (canTransition, update status/gateway_status, activatePlanFromBilling, processed_result).
- Idempotência: payment_events no webhook; idempotency_key na criação e persistência.
- processed_result preenchido em payment_events ao processar evento.
- Status como fonte da verdade; gateway_status informativo; normalizeGatewayStatus e canTransition (anti-regressão) implementados.
- Lookup por (gateway, gateway_reference_id); nenhum SQL com asaas_payment_id/asaas_status no backend.
- URL de webhook dinâmica por config.gateway_key.
- Compatibilidade com Asaas mantida (criação, webhook, polling, reconciliação).

### B. O que foi implantado parcialmente

- **CHECK de status (estado intermediário):** Plano exige aceitar pending, waiting_payment, processing, paid, overdue, cancelled, failed, refunded. customer_invoices aceita todos exceto waiting_payment e processing; tenant_billing aceita apenas pending, paid, overdue, cancelled. Código TypeScript e normalização cobrem o modelo completo; aplicação só persiste subconjunto aceito pelo banco. Parcial: lógica correta; schema não expandido.
- **Replay de eventos:** Plano prevê comando/endpoint para reprocessar evento por id. Não implementado; apenas documentado. Impacto: suporte/debug limitado para reprocessar um evento manualmente.

### C. O que não foi implantado

- CHECK de status expandido para incluir `waiting_payment` e `processing` em customer_invoices e tenant_billing, e `failed`/`refunded` em tenant_billing (conforme seção 4.1 do plano).
- Replay seguro de eventos (reprocessamento por id) documentado no plano.

### D. Riscos encontrados

| Risco | Severidade | Descrição |
|-------|------------|-----------|
| CHECK de status restrito | Média | Se um novo gateway normalizar para waiting_payment ou processing (ou em tenant_billing para failed/refunded), UPDATE em status pode falhar por violação de CHECK. Mitigação atual: Asaas só mapeia para pending/paid/overdue/cancelled/refunded; refunded já aceito em customer_invoices. |
| Replay não implementado | Baixa | Dificulta reprocessamento manual de um evento; não afeta idempotência nem fluxo normal. |

### E. Compatibilidade com Asaas

**Preservada.** Todo o fluxo Asaas (cobrança manual, cobrança tenant, webhook, polling, reconciliação) usa gateway_reference_id e gateway_status. Não há dependência de asaas_payment_id ou asaas_status no código. Risco de quebra escondida: baixo, desde que a migration 74 tenha sido executada e o backfill da 73 esteja aplicado.

### F. Prontidão para múltiplos gateways

**PARCIALMENTE PRONTO.**

- **Pronto:** Persistência genérica, webhook em 3 camadas, idempotência, anti-regressão, URL dinâmica, registro de gateway e parser. Novo gateway pode ser integrado registrando factory, parser e rota.
- **Parcial:** CHECK de status não inclui waiting_payment e processing (e em tenant_billing também failed/refunded). Para gateways que só usem pending/paid/overdue/cancelled (e em customer_invoices failed/refunded), não há bloqueio. Para gateways que queiram persistir estados intermediários ou failed/refunded em tenant_billing, será necessária uma migration que altere o CHECK.

### G. Recomendação final

- **Pode seguir para a próxima etapa** do produto (ex.: integração de um segundo gateway que use apenas os status já permitidos pelo CHECK).
- **Recomendável correção antes de depender de estados intermediários:** Incluir na migration (ou em nova migration) a expansão do CHECK em customer_invoices e tenant_billing para: `pending`, `waiting_payment`, `processing`, `paid`, `overdue`, `cancelled`, `failed`, `refunded`, alinhando o banco ao plano e evitando falhas ao integrar gateways com PIX/boleto/cartão que usem waiting_payment ou processing.
- **Opcional:** Implementar endpoint/admin de replay de evento por id para suporte e debug, conforme previsto no plano.

Não é necessária uma nova rodada de refatoração geral; a base está correta. Ajustes pontuais (CHECK de status e, se desejado, replay) fecham a conformidade com o plano.
