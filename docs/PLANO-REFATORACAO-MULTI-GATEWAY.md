# Plano de refatoração controlada — Suporte a múltiplos gateways

**Objetivo:** Transformar o sistema atual (Asaas como único gateway) em multi-gateway **sem quebrar** o que já funciona.  
**Referência:** `docs/AUDITORIA-ARQUITETURA-FATURAMENTO-E-GATEWAY.md`  
**Escopo:** Apenas planejamento técnico; **não implementar** até aprovação.

---

## Contexto e premissas

- **Já existe:** Interface `PaymentGateway`, `gatewayResolver`, `gatewayRegistry`, `customer_invoices` funcional com Asaas, webhook Asaas.
- **Problema:** Persistência acoplada (`asaas_payment_id`, `asaas_status`); webhook e atualização de status específicos do Asaas.
- **Meta:** Estrutura genérica para identificação do pagamento e status; webhook e status desacoplados do nome do gateway; compatibilidade total durante e após a migração.

**Resumo dos três ajustes incorporados ao plano:**

| Ajuste | Problema | Solução no plano |
|--------|----------|-------------------|
| **1 — ID do gateway** | Nem todo gateway usa um único ID (Mercado Pago: payment_id + preference_id; Stripe: payment_intent + charge_id; Cora: charge_id + transaction_id). | **gateway_reference_id** (principal para lookup) + **gateway_metadata** (JSONB opcional) para IDs/dados extras. Evita refatoração futura. |
| **2 — Webhook** | Risco de lógica duplicada entre handlers (asaasService, mercadoPagoService, coraService cada um diferente). | Rotas por gateway mantidas; **padrão obrigatório:** `handleWebhook(gatewayKey, payload)`; cada gateway só implementa **parsePayload()**; **webhookCore único** faz find + normalize + apply. |
| **3 — Status** | Pagamentos têm estados intermediários (cartão: authorized/captured; PIX: generated/waiting; boleto: issued/waiting/expired). | Modelo interno ampliado: **pending**, **waiting_payment**, **processing**, **paid**, **overdue**, **cancelled**, **failed**, **refunded**. Normalização por gateway mapeia estados externos para esses valores. |

**Revisão estrutural (obrigatória antes da implementação):** Este plano incorpora ainda: **(4) Idempotência e controle de eventos** — tabela `payment_events` para evitar reprocessamento de webhooks duplicados/atrasados; **(5) Garantia de unicidade** — índice UNIQUE em (gateway, gateway_reference_id); **(6) Webhook em 3 camadas** — gatewayParser, webhookCore, paymentDomainService; **(7) Evolução futura** — tabela `invoice_payments` documentada (não implementar nesta fase); **(8) Validação geral** — compatibilidade com estrutura atual, Asaas e multi-tenant.

**Revisão de robustez (ajustes críticos pré-implementação):** **(9) Fonte da verdade do status** — campo `status` (interno) é a única fonte da verdade; webhook é o principal atualizador; polling/reconciliação é corretivo; `gateway_status` apenas informativo (debug). **(10) Regra de progressão de status (anti-regressão)** — ordem definida (pending → waiting_payment → processing → paid + finais); **não** permitir regressão (ex.: paid não volta para pending); paymentDomainService valida antes de aplicar. **(11) Log de decisão em payment_events** — campo `processed_result` (JSONB) com previous_status, new_status, action, motivo; auditoria e rastreabilidade completa.

---

## 1. Modelagem de dados

### 1.1 Opções avaliadas

| Opção | Descrição | Prós | Contras |
|-------|-----------|------|---------|
| **A) Substituição direta** | Renomear colunas: `asaas_payment_id` → `gateway_reference_id` (e adicionar `gateway_metadata`), `asaas_status` → `gateway_status`. | Schema único e limpo. | Exige migração de dados + alteração de todo o código de uma vez; risco de quebra se algo ficar para trás. |
| **B) Novas colunas + dual write + cutover** | Criar `gateway_reference_id`, `gateway_metadata`, `gateway_status`; durante transição escrever nas duas; depois ler só das novas; por fim remover antigas. | Migração incremental; rollback simples (voltar a ler colunas antigas). | Mais etapas e mais tempo; duplicação temporária de dados. |
| **C) Manter legado + views/aliases** | Manter `asaas_payment_id`/`asaas_status`; criar views ou colunas calculadas que “unificam” para a aplicação. | Menos alteração no banco. | Views/complexidade no SQL; dois nomes para a mesma coisa; confusão em novos gateways. |

**Recomendação:** **Opção B (novas colunas + dual write + cutover)** para migração sem downtime e rollback seguro.

### 1.2 Proposta de schema (estado alvo) — AJUSTE 1: ID e metadata

Nem todo gateway usa um único ID (ex.: Mercado Pago: payment_id + preference_id; Stripe: payment_intent + charge_id; Cora: charge_id + transaction_id). Para evitar refatoração futura, usar **referência principal + metadata opcional**:

**customer_invoices:**

- Manter: `gateway` (TEXT), `payment_method` (TEXT).
- **Adicionar:**  
  - `gateway_reference_id` TEXT NULL — ID principal usado para lookup no webhook e chamadas à API do gateway (ex.: payment_id no Asaas, payment_id no Mercado Pago).  
  - `gateway_metadata` JSONB NULL — IDs e dados extras por gateway (ex.: `{ "preference_id": "pref_456", "external_reference": "abc" }` para Mercado Pago; `{ "charge_id": "ch_xyz" }` para Stripe).  
  - `gateway_status` TEXT NULL — status bruto do gateway (para debug/suporte).  
- **Manter temporariamente:** `asaas_payment_id`, `asaas_status` (depreciados; preenchidos em dual write; compatibilidade com Asaas).  
- **Índice:** UNIQUE para garantir unicidade e evitar duplicidade (ver seção 1.5).  
  `CREATE UNIQUE INDEX idx_unique_gateway_reference ON customer_invoices (gateway, gateway_reference_id) WHERE gateway_reference_id IS NOT NULL;`  
  O índice antigo `(gateway, asaas_payment_id)` pode coexistir até a fase de remoção.
- **idempotency_key:** já existente na tabela (usado na criação da cobrança no gateway); manter para evitar cobrança duplicada na origem. Complementar à tabela `payment_events` para idempotência no webhook (ver seção 1.6).

**tenant_billing:**

- Mesma lógica: adicionar `gateway_reference_id`, `gateway_metadata`, `gateway_status`; manter `asaas_payment_id`, `asaas_status` durante a transição; **índice UNIQUE** em `(gateway, gateway_reference_id)` WHERE gateway_reference_id IS NOT NULL. `idempotency_key` já existe em tenant_billing; manter.

**Exemplo de valor persistido (Mercado Pago):**

```json
{
  "gateway": "mercado_pago",
  "gateway_reference_id": "pay_123",
  "gateway_metadata": {
    "preference_id": "pref_456",
    "external_reference": "abc"
  },
  "gateway_status": "approved"
}
```

### 1.3 Estratégia de migração de dados

1. **Migration 1 (preparação):**  
   - ADD COLUMN `gateway_reference_id` TEXT NULL, `gateway_metadata` JSONB NULL, `gateway_status` TEXT NULL em `customer_invoices` e `tenant_billing`.  
   - Backfill: `UPDATE customer_invoices SET gateway_reference_id = asaas_payment_id, gateway_status = asaas_status WHERE gateway = 'asaas' AND asaas_payment_id IS NOT NULL`. Mesmo para `tenant_billing`. (gateway_metadata para Asaas pode ficar NULL ou `{}`.)  
   - Criar **índices UNIQUE** em `(gateway, gateway_reference_id)` (parcial, WHERE NOT NULL) em customer_invoices e tenant_billing (ver seção 1.5).  
   - Opcional na mesma migration ou em migration dedicada: criar tabela `payment_events` (seção 1.6) para idempotência de webhook.  
   - Não remover colunas antigas.

2. **Dual write (Fase 2):**  
   - Todo código que hoje escreve `asaas_payment_id`/`asaas_status` passa a escrever **também** `gateway_reference_id`/`gateway_status` (e `gateway_metadata` quando houver dados extras).  
   - Leitura: primeiro usar `gateway_reference_id`/`gateway_status` onde já houver lógica genérica; onde ainda existir leitura explícita de `asaas_payment_id`/`asaas_status`, manter até a Fase 4.

3. **Cutover de leitura:**  
   - Trocar todas as leituras (webhook, status, reconciliação, listagens) para usar apenas `gateway_reference_id` e `gateway_status`.  
   - Garantir que nenhum SELECT/WHERE use mais `asaas_payment_id`/`asaas_status`.

4. **Remoção do legado (Fase 4):**  
   - Parar de escrever nas colunas antigas.  
   - Nova migration: DROP COLUMN `asaas_payment_id`, `asaas_status`; remover índice antigo; renomear índice novo se desejado (ex.: `idx_customer_invoices_gateway_reference_id`).

### 1.4 Impacto por tabela

| Tabela | Colunas hoje | Ação | Observação |
|--------|--------------|------|------------|
| **customer_invoices** | gateway, payment_method, asaas_payment_id, asaas_status | + gateway_reference_id, gateway_metadata, gateway_status; backfill; depois drop antigas | SELECT/UPDATE em customerInvoiceService, webhook core, listagens. |
| **tenant_billing** | gateway, payment_method, asaas_payment_id, asaas_status | Idem | SELECT/UPDATE em invoiceService, webhook core, billingStatusController, reconciliation, recurringBillingJobService, subscriptionService, tenantsController. |

### 1.5 Garantia de unicidade (CRÍTICO)

**Problema:** Risco de duplicidade de pagamentos e inconsistência via webhook (ex.: dois registros com o mesmo gateway + reference_id).

**Ajuste obrigatório:** Índice **UNIQUE** em `(gateway, gateway_reference_id)` para garantir que uma mesma cobrança do gateway não seja vinculada a mais de uma fatura/cobrança interna.

**customer_invoices:**
```sql
CREATE UNIQUE INDEX idx_unique_customer_invoices_gateway_reference
  ON customer_invoices (gateway, gateway_reference_id)
  WHERE gateway_reference_id IS NOT NULL;
```

**tenant_billing:**
```sql
CREATE UNIQUE INDEX idx_unique_tenant_billing_gateway_reference
  ON tenant_billing (gateway, gateway_reference_id)
  WHERE gateway_reference_id IS NOT NULL;
```

**Impacto e validação:**
- **Migrações:** Incluir criação do índice UNIQUE na mesma migration que adiciona as colunas (após backfill). Se houver duplicatas históricas (mesmo asaas_payment_id em mais de um registro), a migration falhará; tratar com script de deduplicação prévio (ex.: manter um registro por (gateway, asaas_payment_id) e anular ou consolidar os demais).
- **Dados existentes:** Backfill preenche gateway_reference_id a partir de asaas_payment_id. Garantir que não existam duas linhas com mesmo (gateway, asaas_payment_id) antes de criar o UNIQUE; se existir, resolver antes (caso raro em modelo atual).
- **Integrações atuais:** Criação de cobrança (createCharge) já gera um payment_id por fatura; não há fluxo que associe o mesmo payment_id a duas invoices. O UNIQUE reforça a invariante e bloqueia bugs futuros.
- **Multi-tenant:** O par (gateway, gateway_reference_id) é globalmente único no gateway; não é necessário incluir tenant_id no índice (cada reference_id já identifica uma cobrança única no provedor).

### 1.6 Idempotência e controle de eventos (CRÍTICO)

**Problema:** Webhooks podem chegar duplicados, fora de ordem ou atrasados. Sem controle, o mesmo evento pode atualizar a fatura duas vezes ou em ordem errada.

**1.6.1 Tabela `payment_events` (obrigatória na Fase 1 ou 3)**

Criar tabela para registrar todo evento recebido e impedir reprocessamento:

| Coluna       | Tipo      | Descrição |
|--------------|-----------|-----------|
| id           | UUID      | PK. |
| gateway      | TEXT      | asaas, mercadopago, cora, etc. |
| event_id     | TEXT      | ID do evento no gateway (ex.: id do webhook Asaas). |
| reference_id | TEXT      | ID do pagamento no gateway (gateway_reference_id). Usado para buscar a entidade. |
| payload      | JSONB     | Payload completo (para replay/debug). |
| processed    | BOOLEAN   | true quando o evento já foi aplicado (status atualizado). |
| processed_at | TIMESTAMPTZ NULL | Quando foi processado. |
| **processed_result** | **JSONB NULL** | **Log de decisão (AJUSTE 3):** resultado do processamento para debug, auditoria e rastreabilidade. Preenchido ao marcar processed = true. |
| created_at   | TIMESTAMPTZ | Recebimento. |

**Estrutura sugerida de `processed_result`:**
- `previous_status` — status interno da entidade antes do processamento.
- `new_status` — status interno que seria aplicado (normalizado do gateway).
- `action` — ação executada (ex.: "status_updated", "skipped_no_change", "skipped_regression").
- `reason` — motivo da decisão (ex.: "webhook PAYMENT_RECEIVED", "regressão bloqueada: paid não pode voltar para pending").

Índice UNIQUE em `(gateway, event_id)` para impedir inserir o mesmo evento duas vezes. Índice em `(gateway, reference_id, created_at)` opcional para consultas por pagamento.

**Estratégia:**
- **Impedir reprocessamento:** Antes de processar, INSERT na tabela (ou verificar se já existe por gateway + event_id). Se UNIQUE violar, evento duplicado → retornar 200 sem reprocessar. Se inserir, processar e depois UPDATE processed = true, processed_at = now().
- **Replay seguro (debug/reprocessamento):** Ter comando ou endpoint interno (ex.: admin) que permita reprocessar um evento por id: ler payload de payment_events, chamar o mesmo fluxo do webhook (parser → webhookCore → paymentDomainService) sem reinserir na tabela, ou com flag “replay” que não bloqueie por processed. Documentar que replay deve ser usado com cuidado (ex.: apenas para eventos que falharam e já foram corrigidos no gateway).

- **Log de decisão (AJUSTE 3):** Ao marcar evento como processado, preencher `processed_result` (JSONB) com previous_status, new_status, action e reason. Facilita debug, auditoria e rastreabilidade.

**1.6.2 Campo `idempotency_key` nas tabelas de cobrança**

- **customer_invoices:** Garantir coluna `idempotency_key` (já prevista no plano e no GatewayPaymentData); usada na **criação** da cobrança no gateway (evita criar duas cobranças iguais). Não substitui payment_events: idempotency_key cobre “não criar duas vezes”; payment_events cobre “não processar o mesmo webhook duas vezes”.
- **tenant_billing:** `idempotency_key` já existe; mesmo papel.

Ambos (payment_events + idempotency_key) são complementares: um na borda de entrada (webhook), outro na borda de saída (createCharge).

---

## 2. Persistência (camada de serviços)

### 2.1 Estrutura genérica proposta

```ts
// Tipo único para “dados do gateway” na persistência
interface GatewayPaymentData {
  gateway: string;
  payment_method: string | null;
  gateway_reference_id: string | null;
  gateway_metadata?: Record<string, unknown> | null;
  gateway_status: string | null;
  idempotency_key?: string | null;
}
```

### 2.2 Adaptação de `updateCustomerInvoiceGatewayData`

**Arquivo:** `packages/backend/src/services/customerInvoiceService.ts`

- **Hoje:** parâmetro `{ gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key? }`; UPDATE com colunas `asaas_payment_id`, `asaas_status`.
- **Plano (Fase 2 – dual write):**  
  - Assinatura passa a aceitar `GatewayPaymentData` (com `gateway_reference_id`, `gateway_metadata?`, `gateway_status`).  
  - UPDATE escreve em `gateway_reference_id`/`gateway_metadata`/`gateway_status` e (para compatibilidade) em `asaas_payment_id`/`asaas_status` quando `gateway === 'asaas'` (reference_id → asaas_payment_id).  
  - Assim o webhook e qualquer leitura antiga continuam funcionando.
- **Plano (Fase 4):** UPDATE só em `gateway_reference_id`/`gateway_metadata`/`gateway_status`; remover parâmetros e colunas Asaas.

**Chamadores a alterar (passar objeto genérico):**

- `customerBillingService.createManualInvoice` — hoje passa `chargeResult.paymentId`/`chargeResult.status`; passar como `gateway_reference_id`/`gateway_status` (e `gateway_metadata` se o gateway retornar dados extras).
- `recurringBillingJobService` (customer_invoices) — idem.

### 2.3 Adaptação de `updateInvoiceGatewayData` (tenant_billing)

**Arquivo:** `packages/backend/src/services/invoiceService.ts`

- **Hoje:** parâmetro com `asaas_payment_id`, `asaas_status`; UPDATE em tenant_billing com essas colunas.
- **Plano (Fase 2):** aceitar `GatewayPaymentData`; dual write (gateway_reference_id/gateway_metadata/gateway_status + asaas_* quando gateway === 'asaas').
- **Plano (Fase 4):** só gateway_reference_id/gateway_metadata/gateway_status.

**Chamadores:**

- `subscriptionService` (createTenantCharge / fluxo de compra).
- `recurringBillingJobService` (tenant_billing / saas).
- `billingReconciliationService`.
- `tenantsController` (se houver criação de cobrança).

### 2.4 Função de lookup por gateway + payment_id

**invoiceService.findByGatewayAndReferenceId(gateway, referenceId):**

- **Hoje:** `WHERE gateway = $1 AND asaas_payment_id = $2`.
- **Fase 2 (compatível):** fazer SELECT onde `(gateway = $1 AND gateway_reference_id = $2) OR (gateway = $1 AND asaas_payment_id = $2)` para não quebrar se ainda houver dado só nas colunas antigas. Ou, após backfill, usar só `gateway_reference_id`.
- **Fase 4:** apenas `gateway_reference_id`.

**Novo serviço (opcional) centralizado:**  
Criar `paymentGatewayPersistence` (ou similar) com funções como `findCustomerInvoiceByGatewayReference(gateway, referenceId)` e `findTenantBillingByGatewayReference(gateway, referenceId)` que façam o lookup nas colunas genéricas e chamem os updates genéricos. Isso reduz duplicação entre tenant_billing e customer_invoices e centraliza a regra “onde buscar” e “como atualizar”.

---

## 3. Webhook — arquitetura em 3 camadas obrigatórias

Objetivo: evitar acoplamento, preparar para crescimento e garantir que **lógica de negócio não fique no controller** nem **espalhada entre gateways**.

### 3.0 As três camadas (obrigatório)

| Camada | Responsabilidade | Não deve |
|--------|-------------------|----------|
| **gatewayParser** | Traduzir payload do gateway para formato interno (referenceId, externalStatus, eventId, metadata?). Um parser por gateway (asaas, mercadopago, cora). | Conhecer tenant_billing/customer_invoices; aplicar regras de negócio; atualizar banco. |
| **webhookCore** | Receber evento já parseado; validar idempotência (payment_events); localizar entidade (tenant_billing ou customer_invoices por gateway + reference_id); normalizar status externo → interno; chamar paymentDomainService. | Conter regras de negócio (ex.: “o que fazer quando pago”); falar diretamente com API do gateway. |
| **paymentDomainService** | Aplicar regras de negócio: **validar progressão de status (anti-regressão)** antes de atualizar; atualizar status, paid_at, gateway_status; para tenant_billing e status=paid chamar activatePlanFromBilling; preencher **processed_result** em payment_events (previous_status, new_status, action, reason). | Parsear payload; decidir qual entidade buscar; validar idempotência. |

Garantias: **Controller** apenas recebe HTTP e chama handleWebhook(gatewayKey, payload). **Lógica de negócio** fica apenas em paymentDomainService. **Lógica de “qual entidade” e “qual status”** fica em webhookCore + paymentDomainService, nunca duplicada por gateway.

### 3.1 Opções de rota

| Opção | Descrição | Prós | Contras |
|-------|-----------|------|---------|
| **A) Rota por gateway** | `/webhooks/asaas`, `/webhooks/mercadopago`, `/webhooks/cora`. Cada rota registra um handler específico. | Simples; isolamento por gateway; já temos isso para Asaas. | Uma rota nova por gateway; no controller da config pode precisar devolver URL por gateway. |
| **B) Rota única + dispatcher** | `/webhooks/:gateway` (ex.: `/webhooks/asaas`). Um router que, pelo param `gateway`, escolhe o handler (asaas, mercadopago, etc.). | Uma única entrada; fácil adicionar gateway (registrar no dispatcher). | Validação do param (whitelist de gateways); risco de alguém chamar com gateway inexistente. |

**Recomendação:** **Opção A (rota por gateway)**. Mantém o que já existe (`/webhooks/asaas`) e adiciona `/webhooks/mercadopago`, etc. Cada gateway tem contrato e payload diferentes; handlers separados evitam um “mega-switch” e deixam o código do Asaas como está, evoluindo só a parte de persistência.

**AJUSTE 2 — Padrão obrigatório de handler:** Toda rota deve chamar `handleWebhook(gatewayKey, payload)`. Cada gateway implementa apenas `parsePayload(payload)` retornando `{ referenceId, externalStatus, metadata? }`. A lógica de buscar fatura/cobrança, normalizar status e aplicar update fica em um **webhookCore único**. Assim evita-se asaasService.handleEvent, mercadoPagoService.handleEvent, coraService.handleEvent cada um com lógica diferente — apenas **gatewayParser (por gateway) + webhookCore (único)**.

### 3.2 Fluxo completo do webhook (com as 3 camadas)

1. **Controller (rota por gateway):** POST /webhooks/asaas (ou /mercadopago, etc.) → chama `handleWebhook(gatewayKey, payload)`.
2. **gatewayParser:** `parser = getGatewayParser(gatewayKey)`; `parsed = parser.parsePayload(payload)` → `{ eventId, referenceId, externalStatus, metadata? }`. Se parse falhar, retornar 400.
3. **webhookCore:**  
   - Validar idempotência: inserir em `payment_events` (gateway, event_id, reference_id, payload, processed=false) ou verificar se (gateway, event_id) já existe. Se já existir e processed=true, retornar 200 sem reprocessar. Se já existir e processed=false (reprocessamento em andamento?), política definida (ex.: retornar 200 ou 409).  
   - Localizar entidade: `findBillingOrCustomerInvoice(gateway, referenceId)` → tenant_billing ou customer_invoices.  
   - Normalizar: `internalStatus = normalizeGatewayStatus(gatewayKey, parsed.externalStatus)`.  
   - Delegar: `paymentDomainService.applyPaymentEvent({ entityType, entityId, internalStatus, gatewayStatus: parsed.externalStatus, paidAt?, metadata })`.
4. **paymentDomainService:**  
   - **Validar progressão (AJUSTE 2):** Verificar se a transição de currentStatus → internalStatus é permitida (função canTransition). Se regressão (ex.: paid → pending), não atualizar `status`; atualizar apenas `gateway_status` e registrar em processed_result (action: "skipped_regression", reason).  
   - Se entityType === 'tenant_billing': aplicar update (status, paid_at, gateway_status) somente se transição permitida; se internalStatus === 'paid', chamar `activatePlanFromBilling(billingId)`.  
   - Se entityType === 'customer_invoice': idem.  
   - **Log de decisão (AJUSTE 3):** Montar processed_result (previous_status, new_status, action, reason) e gravar em payment_events junto com processed = true, processed_at = now().

### 3.3 Como identificar a fatura/cobrança

- **Regra única:** em todas as tabelas (tenant_billing e customer_invoices) o par `(gateway, gateway_reference_id)` identifica de forma única o registro (após migração para colunas genéricas).
- **Fluxo do handler (genérico):**  
  1. Receber payload do gateway.  
  2. Extrair reference_id (ID principal) e status bruto do payload (via parser do gateway).  
  3. Saber o `gateway_key` (pela rota: asaas, mercadopago, etc.).  
  4. Buscar em tenant_billing: `WHERE gateway = $1 AND gateway_reference_id = $2`.  
  5. Se não achar, buscar em customer_invoices: `WHERE gateway = $1 AND gateway_reference_id = $2`.  
  6. Se achar, normalizar status externo → status interno e chamar funções de update (status, paid_at, gateway_status).

Assim não se duplica “onde buscar”: um módulo compartilhado (ex.: `paymentWebhookService` ou `gatewayWebhookCommon`) pode expor `findBillingOrCustomerInvoice(gateway, referenceId)` e `applyPaymentStatus(...)`.

### 3.4 Como atualizar status (evitar duplicação)

- **Camada comum:**  
  - `normalizeGatewayStatus(gatewayKey, externalStatus): InternalPaymentStatus` — mapeia RECEIVED/CONFIRMED → paid, OVERDUE → overdue, etc., por gateway.  
  - `applyPaymentStatusToTenantBilling(billingId, internalStatus, paidAt?, gatewayStatus?)` — atualiza tenant_billing (status, paid_at, gateway_status).  
  - `applyPaymentStatusToCustomerInvoice(invoiceId, internalStatus, paidAt?, gatewayStatus?)` — atualiza customer_invoices (status, paid_at, gateway_status).

- **Handler por gateway (ex.: Asaas):**  
  - Parse do payload Asaas.  
  - Extrai payment_id e status bruto.  
  - Chama `normalizeGatewayStatus('asaas', rawStatus)`.  
  - Busca registro com `findBillingOrCustomerInvoice('asaas', payment_id)`.  
  - Se for tenant_billing: `applyPaymentStatusToTenantBilling(...)` e, se paid, `activatePlanFromBilling`.  
  - Se for customer_invoice: `applyPaymentStatusToCustomerInvoice(...)`.

Assim a lógica “como atualizar” e “como normalizar” fica única; cada handler só faz parse e delega.

### 3.5 Resumo da arquitetura de webhook

- Rotas: `/webhooks/asaas`, `/webhooks/mercadopago` (futuro), etc.
- Cada rota chama handleWebhook(gatewayKey, payload); parser do gateway extrai referenceId + status; webhookCore (único) busca por (gateway, gateway_reference_id), normaliza e aplica status.
- Camada comum: lookup em tenant_billing e customer_invoices; normalização de status; funções de update que usam apenas colunas genéricas (gateway_status) e status interno.

---

## 4. Camada de status (unificação)

### 4.0 Fonte da verdade do status (AJUSTE 1 — CRÍTICO)

Definir **explicitamente** no sistema:

| Princípio | Regra |
|-----------|--------|
| **Única fonte da verdade** | O campo **`status`** (interno) em `customer_invoices` e `tenant_billing` é a **única fonte da verdade** do estado do pagamento no sistema. Todas as decisões de negócio (ex.: “está pago?”, “pode cancelar?”) devem basear-se **apenas** nesse campo. |
| **Quem atualiza** | O **webhook** é o **principal responsável** por atualizar o status. Eventos do gateway (PAYMENT_RECEIVED, PAYMENT_OVERDUE, etc.) são a origem canônica; o webhook normaliza e persiste em `status`. |
| **Polling / reconciliação** | **Apenas corretivo.** Consultas ao gateway (polling de status, job de reconciliação) servem para corrigir casos em que o webhook não chegou ou falhou. Não substituem o webhook como fluxo principal. |
| **gateway_status** | **Apenas informativo (debug).** O campo `gateway_status` armazena o valor bruto enviado pelo gateway (ex.: RECEIVED, PENDING). Usado para suporte e auditoria. **Não** deve ser usado como fonte da verdade para regras de negócio. |

Documentar isso na arquitetura e nos comentários do código (paymentDomainService, webhookCore) para evitar que futuras alterações quebrem a consistência.

### 4.1 Status internos (domínio) — estados intermediários

Nem todo pagamento segue pending → paid. Gateways expõem estados intermediários (ex.: cartão: authorized, captured; PIX: generated, waiting; boleto: issued, waiting, expired). Para não quebrar ao integrar novos gateways, o modelo interno deve incluir **estados intermediários**:

**Modelo final de status interno** (usado em `customer_invoices.status` e `tenant_billing.status`):

- **pending** — aguardando início do pagamento (ex.: cobrança criada).  
- **waiting_payment** — aguardando o cliente pagar (ex.: PIX gerado, boleto emitido).  
- **processing** — em processamento (ex.: autorizado no cartão, aguardando captura).  
- **paid** — pago/confirmado.  
- **overdue** — vencido.  
- **cancelled** — cancelado.  
- **failed** — falhou.  
- **refunded** — estornado.

CHECK constraint (em `customer_invoices` e `tenant_billing`) e normalização devem aceitar: `pending`, `waiting_payment`, `processing`, `paid`, `overdue`, `cancelled`, `failed`, `refunded`. A alteração do CHECK pode vir na mesma migration das colunas genéricas do gateway ou em uma migration dedicada (estado intermediário).

### 4.2 Status externos (por gateway)

Cada gateway devolve seus próprios valores (ex.: Asaas: PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED, etc.). Armazenar o valor bruto em `gateway_status` (para debug e suporte).

### 4.3 Normalização

- **Função:** `normalizeGatewayStatus(gatewayKey: string, externalStatus: string | null): InternalPaymentStatus`, com `InternalPaymentStatus = 'pending' | 'waiting_payment' | 'processing' | 'paid' | 'overdue' | 'cancelled' | 'failed' | 'refunded'`.
- **Por gateway (ex.: Asaas):**  
  - RECEIVED, CONFIRMED → `paid`.  
  - OVERDUE → `overdue`.  
  - REFUNDED → `refunded`.  
  - CANCELED, DELETED → `cancelled`.  
  - PENDING, AWAITING_* → `pending`.  
  - Outros (ex.: análise) → `pending` ou mapeamento explícito.
- **Exemplos para outros gateways (quando integrar):**  
  - PIX: generated, waiting → `waiting_payment`; authorized/confirmed → `paid`.  
  - Boleto: issued, waiting → `waiting_payment`; expired → `overdue`.  
  - Cartão: authorized → `processing`; captured/paid → `paid`.
- **Mercado Pago / Cora:** definir mapeamento quando houver integração (usar os mesmos status internos acima).
- **Persistência:** sempre gravar em `status` o valor normalizado (interno) e em `gateway_status` o valor bruto do gateway.

Isso unifica decisões de negócio (ex.: “está pago?”) em um único lugar e mantém rastreabilidade do que o gateway enviou.

### 4.4 Regra de progressão de status — anti-regressão (AJUSTE 2 — CRÍTICO)

**Problema:** Eventos podem chegar fora de ordem (ex.: PAYMENT_RECEIVED antes de PENDING; ou evento antigo após um mais novo). Sem regra clara, o status pode “voltar” (ex.: de paid para pending), gerando inconsistência.

**Solução:** Definir **ordem de progressão** e **não permitir regressão**.

**Ordem de progressão (fluxo “normal”):**
- **Transientes:** `pending` → `waiting_payment` → `processing` → `paid`
- **Estados finais (podem ser atingidos a partir de transientes):** `overdue`, `cancelled`, `failed`, `refunded`

**Regra:** **NÃO permitir regressão de status.** Exemplos:
- `paid` **não** pode voltar para `pending`, `waiting_payment`, `processing`.
- `cancelled`, `failed`, `refunded` são finais: não mudar para outro status por evento de pagamento (ex.: só por ação manual ou fluxo excepcional, se documentado).
- `overdue` pode evoluir para `paid` (pagamento após vencimento); não voltar para `pending`.

**Implementação:** O **paymentDomainService** deve **validar** antes de aplicar o update:
- Comparar `currentStatus` (da entidade) com `newStatus` (normalizado do evento).
- Se `newStatus` for “anterior” ou “incompatível” com `currentStatus` segundo a ordem de progressão, **não** atualizar `status`; apenas atualizar `gateway_status` (informativo) e registrar em `processed_result` action = "skipped_regression", reason = "regressão bloqueada: ...".
- Se for progressão permitida ou mesmo status (idempotente), aplicar update e registrar em `processed_result` action = "status_updated" (ou "no_change").

Definir matriz ou função `canTransition(currentStatus, newStatus): boolean` usada pelo paymentDomainService. Ex.: canTransition('pending', 'paid') = true; canTransition('paid', 'pending') = false.

---

## 5. Compatibilidade e não quebra

### 5.1 Garantias durante a migração

- **Backfill antes de dual write:** para que qualquer leitura que migrar primeiro para `gateway_reference_id`/`gateway_status` já encontre dados.
- **Dual write:** escrita nas duas duplas de colunas enquanto existirem; webhook e código legado podem continuar usando asaas_* até o cutover.
- **Ordem de deploy:** (1) migration + backfill; (2) deploy que passa a escrever também nas colunas novas; (3) deploy que passa a ler das colunas novas (webhook e demais); (4) deploy que deixa de escrever nas colunas antigas; (5) migration que remove colunas antigas. Não remover colunas antes de nenhum código depender delas.
- **Asaas continua funcionando:** até o cutover, o handler Asaas pode continuar usando `asaas_payment_id`/`asaas_status` nas queries; após o cutover, passa a usar `gateway_reference_id`/`gateway_status` (com os mesmos valores já preenchidos pelo dual write).

### 5.2 Código legado

- **Fase 2:** manter tipos/parâmetros que aceitem tanto os nomes antigos quanto os novos (ou apenas os novos, com dual write interno no service). Chamadores passam a enviar objeto genérico; o service grava nas duas duplas.
- **Fase 4:** remover parâmetros e colunas Asaas; não deve restar referência a `asaas_payment_id`/`asaas_status` em tipos ou SQL.

### 5.3 API e frontend

- Se a API expõe `asaas_payment_id` ou `asaas_status` (ex.: GET customer-invoices/:id), durante a transição pode retornar ambos (legado + novo); depois remover os campos legados da resposta e do contrato.

---

## 6. Evolução futura — múltiplas tentativas (apenas documentar, NÃO implementar nesta fase)

**Limitação atual:** 1 invoice / 1 billing → 1 gateway_reference_id (uma cobrança ativa por fatura no gateway).

**Evolução futura (fora do escopo das fases 1–4):** Permitir múltiplas tentativas de pagamento por fatura (ex.: primeira tentativa falhou, cliente gera novo PIX; ou troca de método cartão → PIX).

**Tabela proposta para fase futura:** `invoice_payments` (ou equivalente para tenant_billing, ex.: `billing_payments`):

| Coluna      | Tipo       | Descrição |
|-------------|------------|-----------|
| id          | UUID       | PK. |
| invoice_id  | UUID       | FK para customer_invoices (ou billing_id para tenant_billing). |
| gateway     | TEXT       | asaas, mercadopago, cora. |
| reference_id| TEXT       | ID do pagamento no gateway. |
| status      | TEXT       | pending, paid, failed, refunded, etc. (interno ou gateway). |
| metadata    | JSONB NULL | Dados extras. |
| created_at  | TIMESTAMPTZ| |

Objetivos da evolução: (1) permitir múltiplas tentativas de pagamento por fatura; (2) suportar troca de método (ex.: cartão → PIX); (3) manter histórico completo. A fatura (customer_invoices / tenant_billing) passaria a ter o “pagamento ativo” ou “último pagamento” derivado de invoice_payments, em vez de guardar um único gateway_reference_id na própria linha.

**Não implementar nesta fase.** Apenas documentar para não bloquear o desenho atual (1:1) e permitir evolução posterior sem quebrar a unicidade (gateway, gateway_reference_id) que será garantida nas tabelas atuais.

---

## 7. Validação geral do plano

Verificar que todos os ajustes (idempotência, unicidade, 3 camadas de webhook, status, evolução futura) são:

| Critério | Verificação |
|----------|-------------|
| **Compatíveis com a estrutura atual** | Novas colunas e tabelas (payment_events, gateway_reference_id, etc.) convivem com asaas_payment_id/asaas_status durante dual write. Índice UNIQUE só é criado após backfill; dados atuais já são 1:1 por (gateway, asaas_payment_id). |
| **Não quebram fluxo existente** | Criação de fatura (createManualInvoice) e de cobrança (createCharge) seguem iguais; apenas a persistência dos dados do gateway passa a usar colunas genéricas com dual write. Webhook Asaas continua identificando por gateway + reference_id após cutover (mesmo valor que hoje asaas_payment_id). |
| **Integração Asaas funcionando** | Dual write mantém asaas_payment_id/asaas_status preenchidos até Fase 4; webhook pode ler por qualquer uma das duplas durante transição. Parser Asaas e payment_events (por event_id) garantem idempotência sem alterar contrato do Asaas. |
| **Arquitetura multi-tenant** | RLS e filtros por tenant_id permanecem. payment_events pode ser global (sem tenant_id) pois event_id/reference_id já identificam a entidade; lookup em tenant_billing/customer_invoices continua por tenant implícito na linha. Nenhuma decisão de tenant no webhook depende de payload não validado. |

Conclusão: o plano permanece compatível com o que já foi construído e com integração Asaas; unicidade e idempotência reforçam consistência sem mudar contratos de API.

**Validação dos 3 ajustes de robustez (fonte da verdade, progressão de status, processed_result):**

| Ajuste | Impacto em compatibilidade | Impacto em Asaas |
|--------|----------------------------|------------------|
| **Fonte da verdade** | Nenhum. Apenas documentação e reforço do que já é prática (status como decisão; gateway_status informativo). Código atual já persiste status e asaas_status; após migração, status continua fonte da verdade, gateway_status continua informativo. | Nenhum. Webhook Asaas já é o fluxo que atualiza status; polling já é auxiliar. |
| **Anti-regressão** | Nenhum. Regra nova aplicada apenas no paymentDomainService ao processar evento. Fluxos de criação (createManualInvoice, createCharge) não alteram status para trás; só o webhook aplica updates. Se no legado já não houver eventos que “regridam” status, comportamento permanece igual. | Nenhum. Asaas envia eventos que tipicamente progridem (PENDING → RECEIVED). Se por bug chegasse RECEIVED depois de RECEIVED, idempotência e “no_change” mantêm paid. Regressão (paid → pending) não é enviada pelo Asaas em fluxo normal. |
| **processed_result** | Nenhum. Novo campo opcional (JSONB NULL) em payment_events; preenchido apenas ao processar. Não altera contratos de API nem colunas de customer_invoices/tenant_billing. | Nenhum. Apenas mais um campo de auditoria no evento; Asaas não consome payment_events. |

Conclusão: os 3 ajustes de robustez **não quebram** integração atual nem compatibilidade; reforçam consistência e rastreabilidade.

---

## 8. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Webhook Asaas deixa de achar registro | Backfill garantir que todos os asaas_payment_id existentes estejam em gateway_reference_id; dual write garantir que novos também. No cutover, passar a buscar por gateway_reference_id. |
| Rollback após cutover | Manter colunas antigas até Fase 4; em emergência, reverter deploy para versão que ainda lê asaas_* (e ainda escreve nas duas). |
| Dois gateways escrevendo no mesmo registro | Não se aplica: cada cobrança/fatura pertence a um único gateway (coluna gateway). |
| Status novo de um gateway não mapeado | normalizeGatewayStatus retornar default (ex.: pending) e registrar em log; depois estender mapeamento. |
| Evento duplicado (mesmo event_id) | payment_events com UNIQUE (gateway, event_id); INSERT falha em duplicata → retornar 200 sem reprocessar. |
| Duplicidade (gateway, reference_id) em dados legados | Antes de criar UNIQUE, rodar consulta para detectar duplicatas; se houver, script de deduplicação ou tratamento manual (caso raro). |

---

## 9. Estrutura final das tabelas e responsabilidades (resumo)

**Tabelas alteradas/criadas (estado alvo após Fase 4):**

- **customer_invoices:** gateway, payment_method, gateway_reference_id, gateway_metadata, gateway_status, idempotency_key (+ colunas existentes). UNIQUE (gateway, gateway_reference_id) WHERE gateway_reference_id IS NOT NULL.
- **tenant_billing:** idem. UNIQUE (gateway, gateway_reference_id) WHERE gateway_reference_id IS NOT NULL.
- **payment_events:** id, gateway, event_id, reference_id, payload, processed, processed_at, **processed_result** (JSONB: previous_status, new_status, action, reason), created_at. UNIQUE (gateway, event_id).

**Responsabilidades por camada (webhook):**

- **Controller:** Receber POST; chamar handleWebhook(gatewayKey, body). Não contém lógica de negócio.
- **gatewayParser:** parsePayload(payload) → { eventId, referenceId, externalStatus, metadata? }. Por gateway.
- **webhookCore:** Idempotência (payment_events); findBillingOrCustomerInvoice(gateway, referenceId); normalizeGatewayStatus(gatewayKey, externalStatus); chamar paymentDomainService.applyPaymentEvent(...).
- **paymentDomainService:** Validar progressão (canTransition); atualizar status/paid_at/gateway_status somente se transição permitida; se tenant_billing e status=paid, activatePlanFromBilling; marcar payment_events.processed = true e preencher processed_result (previous_status, new_status, action, reason).

---

## 10. Plano por fases (resumo executivo)

| Fase | Nome | Objetivo | Entregas | Rollback |
|------|------|----------|----------|----------|
| **1** | Preparar banco | Schema genérico + dados existentes migrados | Migration: ADD gateway_reference_id, gateway_metadata, gateway_status; backfill; índices novos. Nenhuma alteração de código que leia/escreva. | Reverter migration (drop colunas novas). |
| **2** | Adaptar serviços | Persistência genérica com dual write | GatewayPaymentData; updateCustomerInvoiceGatewayData e updateInvoiceGatewayData aceitam e escrevem nas colunas novas + antigas (para asaas). Chamadores passam paymentId/status genéricos. | Remover dual write (voltar a escrever só nas antigas). |
| **3** | Adaptar webhook e leituras | Tudo usa gateway_reference_id/gateway_status | handlePaymentEvent (e demais) buscam e atualizam por gateway_reference_id/gateway_status; camada comum de normalização e apply status. billingStatusController e reconciliação usam colunas novas. | Reverter para versão que ainda lê asaas_*. |
| **4** | Remover dependência Asaas no schema | Código e banco 100% genéricos | Parar de escrever asaas_payment_id/asaas_status; migration DROP colunas e índice antigo; remover parâmetros e tipos “asaas_*”; URL de webhook por gateway_key na API. | Reaplicar migration que adiciona colunas antigas e novo backfill; reverter código. (Mais custoso; evitar com testes nas fases 2 e 3.) |

---

## 11. Detalhamento por fase

### Fase 1 — Preparar banco

**Objetivo:** Colunas e índices genéricos preenchidos; zero mudança de comportamento da aplicação.

**Tarefas:**

1. Criar migration (ex.: `72_gateway_payment_generic_columns.sql`):
   - `customer_invoices`: ADD COLUMN gateway_reference_id TEXT NULL, ADD COLUMN gateway_metadata JSONB NULL, ADD COLUMN gateway_status TEXT NULL.
   - `tenant_billing`: ADD COLUMN gateway_reference_id TEXT NULL, ADD COLUMN gateway_metadata JSONB NULL, ADD COLUMN gateway_status TEXT NULL.
   - Backfill: UPDATE customer_invoices SET gateway_reference_id = asaas_payment_id, gateway_status = asaas_status WHERE gateway IS NOT NULL AND asaas_payment_id IS NOT NULL. (gateway_metadata NULL ou {}.)
   - Backfill: UPDATE tenant_billing SET gateway_reference_id = asaas_payment_id, gateway_status = asaas_status WHERE gateway IS NOT NULL AND asaas_payment_id IS NOT NULL.
   - **Garantia de unicidade:** CREATE UNIQUE INDEX idx_unique_customer_invoices_gateway_reference ON customer_invoices (gateway, gateway_reference_id) WHERE gateway_reference_id IS NOT NULL. Idem para tenant_billing (idx_unique_tenant_billing_gateway_reference).
   - **Idempotência de webhook:** Criar tabela `payment_events` (id, gateway, event_id, reference_id, payload, processed, processed_at, **processed_result** JSONB NULL, created_at); UNIQUE (gateway, event_id).
2. Registrar migration em `migrate.ts`.
3. Executar migration em todos os ambientes.
4. Validar: SELECT para conferir que todos os registros com asaas_payment_id preenchido tenham gateway_reference_id igual.

**Arquivos:** novo arquivo em `database/init/`, `packages/backend/src/migrate.ts`.

**Impacto:** Nenhum código de aplicação alterado; apenas schema e dados.

---

### Fase 2 — Adaptar services (persistência genérica + dual write)

**Objetivo:** Serviços aceitam estrutura genérica e gravam em ambas as duplas de colunas (para gateway asaas), sem mudar ainda onde se lê.

**Tarefas:**

1. **Tipos:** Criar interface `GatewayPaymentData` (gateway, payment_method, gateway_reference_id, gateway_metadata?, gateway_status, idempotency_key?) em módulo compartilhado (ex.: `paymentGatewayTypes.ts` ou `gatewayPersistenceTypes.ts`).
2. **customerInvoiceService:**  
   - Alterar `updateCustomerInvoiceGatewayData(invoiceId, data: GatewayPaymentData)`.  
   - UPDATE SET gateway_reference_id, gateway_metadata, gateway_status e, quando data.gateway === 'asaas', também asaas_payment_id = gateway_reference_id, asaas_status = gateway_status (dual write).  
   - Manter `CustomerInvoiceRow` com ambos os conjuntos de colunas (asaas_* e gateway_*) até Fase 4; ou já retornar apenas gateway_* nos SELECTs e manter asaas_* só na escrita por compatibilidade.
3. **invoiceService:**  
   - Alterar `updateInvoiceGatewayData(billingId, data: GatewayPaymentData)` com a mesma lógica de dual write.  
   - Opcional: adicionar `findByGatewayAndPaymentId` usando gateway_reference_id (e, se necessário, fallback para asaas_payment_id durante transição).
4. **Chamadores** passam a usar o objeto genérico (chargeResult.paymentId → gateway_reference_id, chargeResult.status → gateway_status (e metadata se houver)):
   - customerBillingService.createManualInvoice
   - recurringBillingJobService (tenant_billing e customer_invoices)
   - subscriptionService (tenant_billing)
   - billingReconciliationService
   - tenantsController (se aplicável)
5. Testes: criar fatura/cobrança via Asaas; conferir que ambas as duplas de colunas são preenchidas; webhook ainda deve funcionar (lendo asaas_*).

**Arquivos:**  
- customerInvoiceService.ts  
- invoiceService.ts  
- customerBillingService.ts  
- recurringBillingJobService.ts  
- subscriptionService.ts  
- billingReconciliationService.ts  
- tenantsController.ts (se houver)  
- paymentGatewayTypes.ts (ou novo arquivo de tipos)

**Impacto:** Código de escrita e contratos de função; leitura no webhook e em outros pontos pode continuar usando asaas_*.

---

### Fase 3 — Adaptar webhook e leituras

**Objetivo:** Lookup e atualização de status usam apenas colunas genéricas; camada comum de normalização e apply; Asaas continua funcionando.

**Tarefas:**

1. **Implementar as 3 camadas (gatewayParser, webhookCore, paymentDomainService):**
   - **gatewayParser (por gateway):** parsePayload(payload) → { eventId, referenceId, externalStatus, metadata? }. Asaas usa event_id e payment.id do payload.
   - **webhookCore:** (a) Validar idempotência: INSERT em payment_events (gateway, event_id, reference_id, payload, processed=false); em caso de UNIQUE violation (gateway, event_id), retornar 200 sem reprocessar. (b) findBillingOrCustomerInvoice(gateway, referenceId). (c) normalizeGatewayStatus(gatewayKey, externalStatus). (d) Chamar paymentDomainService.applyPaymentEvent(...).
   - **paymentDomainService:** Aplicar regras de negócio: atualizar status, paid_at, gateway_status na entidade; se tenant_billing e status=paid, activatePlanFromBilling; marcar payment_events.processed = true.
   - **Funções de apoio:** normalizeGatewayStatus (mapeamento Asaas: RECEIVED/CONFIRMED → paid, etc.); findBillingOrCustomerInvoice; applyPaymentStatusToTenantBilling; applyPaymentStatusToCustomerInvoice (ou unificar em applyPaymentEvent por entityType).

2. **customerInvoiceService.updateCustomerInvoiceStatus:**  
   - Assinatura: aceitar `gatewayStatus?: string | null` em vez de `asaasStatus`; UPDATE em gateway_status (e dual write em asaas_status se necessário).  
   - Ou já usar apenas gateway_status e remover asaas_status do UPDATE nesta fase.

3. **asaasService.handlePaymentEvent:**  
   - Trocar queries para `WHERE gateway = $1 AND gateway_reference_id = $2` (tenant_billing e customer_invoices).  
   - Obter internalStatus via `normalizeGatewayStatus('asaas', asaasStatus)`.  
   - Chamar applyPaymentStatusToTenantBilling / applyPaymentStatusToCustomerInvoice em vez de UPDATE direto e updateInvoiceStatus/updateCustomerInvoiceStatus atuais (ou manter essas funções mas fazendo elas gravarem em gateway_status + asaas_status no dual write).  
   - Objetivo: handler Asaas só parseia payload e delega para a camada comum.

4. **billingStatusController:**  
   - SELECT incluir gateway_reference_id (ou só ele); remover condição `row.gateway === 'asaas'` e usar `row.gateway` para resolver gateway e chamar `gateway.getPayment(row.gateway_reference_id) — lookup pelo ID principal`.

5. **invoiceService.findByGatewayAndPaymentId:**  
   - Usar apenas gateway_reference_id na WHERE.

6. **Reconciliação e demais leituras:**  
   - Qualquer SELECT que use asaas_payment_id passa a usar gateway_reference_id (e condição “sem payment_id” vira “gateway_reference_id IS NULL”).

7. **Testes:** Webhook Asaas (payload simulado); polling de status; criação de fatura/cobrança; conferir que apenas colunas genéricas são lidas e que dual write ainda escreve nas antigas se definido.

**Arquivos:**  
- Novo: módulo de camada comum (normalize + find + apply).  
- asaasService.ts (handlePaymentEvent).  
- customerInvoiceService.ts (updateCustomerInvoiceStatus).  
- invoiceService.ts (findByGatewayAndPaymentId; updateInvoiceStatus se existir com asaas_status).  
- billingStatusController.ts  
- billingReconciliationService.ts (queries)

**Impacto:** Todo o caminho de webhook e de consulta de status passa a depender das colunas genéricas; Asaas segue funcionando com os mesmos dados já preenchidos.

---

### Fase 4 — Remover dependência Asaas do schema

**Objetivo:** Nenhuma coluna nem parâmetro com nome “asaas” na persistência; URL de webhook dinâmica.

**Tarefas:**

1. Parar dual write: em `updateCustomerInvoiceGatewayData` e `updateInvoiceGatewayData` remover escrita em asaas_payment_id/asaas_status.
2. Remover parâmetros e tipos: interfaces e funções não devem mais aceitar asaas_payment_id/asaas_status; apenas gateway_reference_id/gateway_metadata/gateway_status.
3. Tipos e SELECTs: CustomerInvoiceRow e tipos de tenant_billing deixam de expor asaas_*; SELECTs não incluem essas colunas.
4. Migration: DROP COLUMN asaas_payment_id, asaas_status de customer_invoices e tenant_billing; DROP índice antigo (gateway, asaas_payment_id); opcionalmente renomear índice novo.
5. myTenantPaymentGatewayController (e equivalente): webhookUrl = `${baseUrl}/webhooks/${config.gateway_key}` (ex.: asaas, mercadopago).
6. Remover qualquer condição `gateway === 'asaas'` que reste (ex.: billingStatusController já deve usar gateway genérico).
7. Limpeza: comentários, logs e scripts que citem asaas_payment_id/asaas_status.

**Arquivos:**  
- customerInvoiceService.ts  
- invoiceService.ts  
- customerBillingService.ts  
- recurringBillingJobService.ts  
- subscriptionService.ts  
- billingReconciliationService.ts  
- tenantsController.ts  
- billingStatusController.ts  
- asaasService.ts (se ainda gravar asaas_status em algum lugar)  
- myTenantPaymentGatewayController.ts  
- Frontend/API: se expuserem asaas_* na resposta, remover do contrato.

**Impacto:** Schema e código 100% genéricos; preparado para registrar Mercado Pago, Cora, etc., e adicionar rotas `/webhooks/mercadopago`, etc., com handlers que usam a mesma camada comum.

---

## 12. Checklist de conclusão do plano

- [ ] Modelagem: opção B (novas colunas + dual write + cutover) aprovada; uso de **gateway_reference_id** + **gateway_metadata** (AJUSTE 1).
- [ ] Unicidade: índices UNIQUE em (gateway, gateway_reference_id) em customer_invoices e tenant_billing; impacto em migrações e dados existentes validado (seção 1.5).
- [ ] Idempotência: tabela **payment_events** e estratégia (impedir reprocessamento; replay seguro documentado); idempotency_key mantido nas tabelas de cobrança (seção 1.6).
- [ ] Persistência: interface GatewayPaymentData (gateway_reference_id, gateway_metadata?, gateway_status) e assinaturas de update* definidas.
- [ ] Webhook: **3 camadas obrigatórias** — gatewayParser, webhookCore, paymentDomainService; rota por gateway; lógica de negócio apenas em paymentDomainService (seções 3.0–3.5).
- [ ] Status: modelo interno com **waiting_payment** e **processing** (AJUSTE 3); normalizeGatewayStatus por gateway documentados.
- [ ] Evolução futura: **invoice_payments** (múltiplas tentativas) apenas documentada; não implementar nesta fase (seção 6).
- [ ] Validação geral: compatibilidade com estrutura atual, fluxo existente, Asaas e multi-tenant conferida (seção 7).
- [ ] **Robustez (pré-implementação):** **(9) Fonte da verdade** — status é única fonte da verdade; webhook principal; polling corretivo; gateway_status informativo (seção 4.0). **(10) Anti-regressão** — ordem de progressão definida; paymentDomainService valida canTransition antes de aplicar (seção 4.4). **(11) processed_result** — log de decisão em payment_events (previous_status, new_status, action, reason) para auditoria (seção 1.6.1). Validação: os 3 pontos não impactam compatibilidade nem Asaas (seção 7).
- [ ] Fases 1–4 com ordem de deploy e critérios de aceite alinhados; Fase 1 inclui payment_events (com processed_result) e UNIQUE indexes.
- [ ] Risco de rollback por fase revisado.
- [ ] **Plano FINAL aprovado. NÃO implementar até aprovação explícita.**

---

---

**PLANO FINAL — Refatoração multi-gateway + robustez**

Este documento consolida: modelagem (gateway_reference_id, gateway_metadata, unicidade), idempotência (payment_events, idempotency_key), webhook em 3 camadas (gatewayParser, webhookCore, paymentDomainService), status (fonte da verdade, progressão, anti-regressão), log de decisão (processed_result) e evolução futura (invoice_payments documentada). Compatibilidade com estrutura atual e integração Asaas validada.

**Documento apenas de planejamento. Não implementar até aprovação explícita do plano final.**
