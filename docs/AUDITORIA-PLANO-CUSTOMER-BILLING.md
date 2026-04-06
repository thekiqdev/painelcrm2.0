# Auditoria técnica — Plano Customer Billing (faturas do tenant para seus clientes)

**Objetivo:** Verificar compatibilidade do plano com o código atual, migrations, webhook, riscos de duplicação, impacto no Billing Engine, performance e segurança multi-tenant antes da implementação.

**Escopo:** Apenas auditoria e estratégia segura. Nenhum código implementado.

---

## 1 — Verificação de compatibilidade com o sistema atual

### 1.1 Resumo por componente

| Componente | Compatível? | Observação |
|------------|-------------|------------|
| **Billing Engine (scheduler/worker)** | ✅ Sim | Worker só processa jobs com `subscription_id`; jobs vêm de `subscriptions`; não lê linhas de customer_invoices sem subscription. |
| **recurringBillingJobService** | ⚠️ Revisar | Usa `findCustomerInvoiceBySubscriptionAndPeriod(subscription_id, period_start)` e `createCustomerInvoice` sempre com subscription_id preenchido. Nunca passa subscription_id NULL. **Não quebra** com subscription_id NULL na tabela. |
| **customerInvoiceService** | ⚠️ Alterar | `CreateCustomerInvoiceInput` e INSERT exigem `subscription_id` hoje. É preciso **nova função** (ex.: `createManualCustomerInvoice`) e/ou assinatura que aceite `subscription_id` opcional + `origin`/`invoice_type`. `findCustomerInvoiceBySubscriptionAndPeriod` é só para recorrência; não é usada para manuais. |
| **invoiceService** | ✅ Sem alteração | Atua só em `tenant_billing`. Não referencia customer_invoices. |
| **paymentCustomersService** | ✅ Sem alteração | Já suporta `getPaymentCustomerForClient` / `createPaymentCustomerForClient`. |
| **paymentGatewayConfigService** | ✅ Sem alteração | `getActiveConfig('crm', tenantId)` já existe. |
| **gatewayResolver / getActiveGateway** | ✅ Sem alteração | Já aceita `{ billingType: 'crm', tenantId }`. |
| **Webhook (Asaas)** | ⚠️ Alterar | Hoje só lookup em `tenant_billing`. É preciso adicionar lookup em `customer_invoices` e **não** chamar `activatePlanFromBilling` para customer_invoices. |

### 1.2 subscription_id NULLABLE — pode quebrar alguma lógica?

- **recurringBillingJobService:**  
  - Scheduler enfileira apenas por `subscriptions` (sempre tem id).  
  - Worker chama `findCustomerInvoiceBySubscriptionAndPeriod(job.subscription_id, ...)` — sempre com subscription_id do job; não busca por subscription_id NULL.  
  - Worker chama `createCustomerInvoice` apenas em `processOneCustomerRenewalJob`, sempre com `subscription.id`.  
  **Conclusão:** Nenhuma função assume subscription_id NOT NULL em customer_invoices para o fluxo de recorrência.

- **customerInvoiceService:**  
  - `createCustomerInvoice`: hoje exige `subscription_id` no tipo e no INSERT. Tornar a coluna NULL no banco **não quebra** o INSERT existente (o worker continua passando valor).  
  - Para faturas manuais será necessário **não** passar subscription_id (ou passar null) e passar origin/invoice_type. Ou seja, **nova função ou parâmetros opcionais**.  
  **Conclusão:** A alteração para NULLABLE não quebra; exige extensão da API do serviço (nova função ou campos opcionais).

- **Queries que usam subscription_id em customer_invoices:**
  - `findCustomerInvoiceBySubscriptionAndPeriod`: `WHERE subscription_id = $1 AND period_start = $2`. Usada só pelo worker com subscription_id válido. Não afetada.
  - Nenhuma query atual faz `WHERE subscription_id IS NOT NULL` implícito em customer_invoices.

### 1.3 Lugares que precisam ser revisados (checklist de código)

| Arquivo | O que revisar |
|---------|----------------|
| `packages/backend/src/services/customerInvoiceService.ts` | Adicionar `createManualCustomerInvoice` (ou tornar `subscription_id`/`period_start`/`period_end` opcionais em `createCustomerInvoice`); garantir geração de `invoice_number` globalmente única; adicionar `origin`/`invoice_type`; considerar `updateCustomerInvoiceStatus(invoiceId, status, paidAt?)` para o webhook. |
| `packages/backend/src/services/recurringBillingJobService.ts` | Manter como está para recorrência; opcionalmente alterar `externalReference` em `processOneCustomerRenewalJob` de `clientId` para `tenant_{tenantId}_invoice_{invoiceId}` para alinhar ao plano e facilitar webhook. |
| `packages/backend/src/modules/gateways/asaas/services/asaasService.ts` | `handlePaymentEvent`: após não encontrar em tenant_billing, buscar em customer_invoices por (gateway, asaas_payment_id); ao encontrar, atualizar status/paid_at/asaas_status; **não** chamar `activatePlanFromBilling`. |
| Novo serviço/orquestrador (ex.: `customerBillingService.ts`) | createManualInvoice (valida client, cria invoice manual, chama gateway, persiste payment_id); listInvoices(tenantId, filters); getInvoiceById(tenantId, id). Todos com filtro tenant_id. |
| Rotas/controller de customer-invoices | Garantir tenantAuth e validação de que client_id pertence ao tenant. |

---

## 2 — Auditoria das migrations propostas

### 2.1 Estado atual (70_customer_invoices.sql)

- `subscription_id` UUID NOT NULL REFERENCES subscriptions  
- `period_start` DATE NOT NULL, `period_end` DATE NOT NULL  
- `status` CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled'))  
- Sem colunas `origin`, `invoice_type`, `description`  
- Índice único: `idx_customer_invoices_subscription_period` em **(subscription_id, period_start)** — índice **não parcial** (todas as linhas)

### 2.2 Alterações desejadas e possíveis impedimentos

| Alteração | Impedimento? | Ação |
|-----------|--------------|------|
| subscription_id → NULL | Nenhum. FK continua válida com NULL. | ALTER COLUMN subscription_id DROP NOT NULL. |
| period_start / period_end → NULL | Nenhum. | ALTER COLUMN period_start DROP NOT NULL; idem period_end. |
| Adicionar origin | Nenhum. | ADD COLUMN origin TEXT NOT NULL DEFAULT 'subscription' + CHECK. |
| Adicionar invoice_type | Nenhum. | ADD COLUMN invoice_type TEXT NOT NULL DEFAULT 'recurring' + CHECK. |
| Adicionar description | Nenhum. | ADD COLUMN description TEXT NULL. |
| Novos valores em status (failed, refunded) | Constraint atual CHECK (status IN ('pending','paid','overdue','cancelled')). | Dropar CHECK antigo e criar novo CHECK incluindo 'failed', 'refunded'. |
| UNIQUE(invoice_number) | Possível duplicidade atual: `generateInvoiceNumber` usa tenantId + Date.now() — entre tenants pode colidir; no mesmo tenant em mesmo ms também. | Antes de ADD CONSTRAINT: (1) conferir se já existe UNIQUE em invoice_number em outra tabela (ex.: tenant_billing); (2) script de migração que garante unicidade (ex.: atualizar duplicatas com sufixo) e depois ALTER TABLE ADD CONSTRAINT UNIQUE(invoice_number). Se tenant_billing também tiver invoice_number, decidir se UNIQUE é só em customer_invoices ou global (ex.: tabela auxiliar de números). |
| Índice (gateway, asaas_payment_id) | Não. | CREATE INDEX CONCURRENTLY se produção (ou CREATE INDEX). |

### 2.3 Índice UNIQUE(subscription_id, period_start)

- Hoje: índice único **completo** em (subscription_id, period_start). Em PostgreSQL, NULL ≠ NULL em unique, então várias linhas com (NULL, NULL) já são permitidas por esse índice.
- Plano: manter **apenas** UNIQUE onde subscription_id IS NOT NULL (índice **parcial**).
- **Ordem:** Primeiro permitir subscription_id NULL (ALTER COLUMN), depois **dropar** o índice único atual e **criar** índice único parcial:  
  `CREATE UNIQUE INDEX ... ON customer_invoices (subscription_id, period_start) WHERE subscription_id IS NOT NULL;`

### 2.4 Dependências entre migrations

- Nenhuma migration posterior (71+) listada no plano depende de outra nova além da que altera customer_invoices.
- A migration que altera customer_invoices deve rodar **após** a 70 (já aplicada). Será uma nova migration (ex.: 71_customer_invoices_manual_support.sql).

### 2.5 Ordem segura sugerida (dentro da migration 71)

1. ADD COLUMN para origin, invoice_type, description (com DEFAULTs onde NOT NULL).
2. ALTER COLUMN subscription_id, period_start, period_end DROP NOT NULL.
3. Alterar CHECK de status (dropar o antigo, criar novo com failed, refunded).
4. ADD CHECK de origin e de invoice_type.
5. ADD CHECK de consistência (origin = 'subscription' ⇔ subscription_id IS NOT NULL; etc.).
6. DROP INDEX idx_customer_invoices_subscription_period; CREATE UNIQUE INDEX ... WHERE subscription_id IS NOT NULL.
7. Garantir unicidade de invoice_number (limpar duplicatas se houver) e ADD CONSTRAINT UNIQUE(invoice_number).
8. CREATE INDEX idx_customer_invoices_gateway_asaas_payment_id ON customer_invoices (gateway, asaas_payment_id) WHERE gateway IS NOT NULL AND asaas_payment_id IS NOT NULL (opcional WHERE para reduzir tamanho).

---

## 3 — Auditoria do webhook

### 3.1 Arquivo e função a alterar

- **Arquivo:** `packages/backend/src/modules/gateways/asaas/services/asaasService.ts`
- **Função:** `handlePaymentEvent(params: { eventType, asaasPaymentId, payload, tenantIdFromPayload? })`

Hoje a função:
1. Busca em `tenant_billing` por `gateway = 'asaas' AND asaas_payment_id = $1`.
2. Se não achar, retorna sem fazer nada.
3. Se achar, atualiza status/paid_at/asaas_status e chama `activatePlanFromBilling` quando pago.

### 3.2 Modificação proposta (forma segura)

1. Manter o fluxo atual para **tenant_billing**: primeiro lookup em tenant_billing; se encontrar, processar como hoje (incluindo activatePlanFromBilling quando pago).
2. **Só se não encontrar** em tenant_billing: fazer segundo lookup em **customer_invoices** por `gateway = 'asaas' AND asaas_payment_id = $1` (usar índice (gateway, asaas_payment_id)).
3. Se encontrar em customer_invoices:  
   - Atualizar status (paid/failed/overdue/refunded conforme evento), paid_at quando pago, asaas_status.  
   - **Não** chamar `activatePlanFromBilling` (essa função é só para tenant_billing).
4. Opcional: se ainda não encontrou em nenhuma tabela, tentar resolver por externalReference no formato `tenant_{tenantId}_invoice_{invoiceId}` (parsing e busca por id em customer_invoices com tenant_id).

### 3.3 Risco de conflito de payment_id entre tabelas

- **tenant_billing** e **customer_invoices** são tabelas diferentes; o mesmo asaas_payment_id não deve aparecer nas duas (um pagamento no gateway pertence a uma única cobrança: ou do tenant ao SaaS, ou do cliente ao tenant).
- **Recomendação:** Lookup **em ordem**: primeiro tenant_billing, depois customer_invoices. Não há ambiguidade: cada payment_id no Asaas corresponde a uma única cobrança no nosso sistema.

### 3.4 Função de atualização de status para customer_invoices

- Hoje `customerInvoiceService` expõe apenas `updateCustomerInvoiceGatewayData` (gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key).
- Para o webhook é necessário atualizar também **status** e **paid_at**.
- **Recomendação:** Adicionar em `customerInvoiceService` algo como `updateCustomerInvoiceStatus(invoiceId, status, paidAt?, asaasStatus?)` e chamar do handlePaymentEvent quando o registro for de customer_invoices.

---

## 4 — Risco de duplicação de cobranças

### 4.1 Fluxo: criação da invoice → chamada ao gateway → webhook

- **Duplicação possível (criação):** Dois POSTs idênticos (ex.: duplo clique) gerando duas invoices e duas chamadas createCharge. Mitigação: idempotency_key por request (ex.: idempotency key do cliente em header) ou constraint de negócio (ex.: mesmo client_id + due_date + amount = rejeitar ou reutilizar).
- **Duplicação possível (gateway):** createCharge chamado duas vezes com chaves diferentes para o mesmo “conceito” de cobrança. Mitigação: idempotency_key estável (ex.: `customer_manual_{tenantId}_{invoiceId}`) — na primeira chamada persiste invoice_id; em retry usa o mesmo invoice_id, então mesma chave.
- **Duplicação possível (webhook):** Dois eventos (ex.: PAYMENT_RECEIVED e PAYMENT_CONFIRMED) ou replay. Mitigação: (1) webhook já usa asaas_webhook_events (idempotência por evento); (2) ao atualizar customer_invoices, checar se status já é 'paid' e não atualizar de novo (ou atualizar apenas asaas_status).

### 4.2 Onde a idempotency_key deve ser aplicada

- Em toda chamada a `createCharge` (já está no plano).
- Chave recomendada para manuais: `customer_manual_{tenantId}_{invoiceId}` (invoice criada antes da chamada ao gateway).
- Para recorrência o worker já usa `customer_renew_{subscriptionId}_{periodStart}`; opcional mudar para incluir invoice_id após criar a invoice (ou manter por período).

### 4.3 UNIQUE(idempotency_key)

- O plano menciona “UNIQUE(idempotency_key) ou índice único quando idempotency_key não nulo”.
- Em customer_invoices a idempotency_key pode ser NULL (ex.: invoices antigas ou criadas sem gateway). **Recomendação:** índice único **parcial** `UNIQUE(idempotency_key) WHERE idempotency_key IS NOT NULL` para evitar duas linhas com a mesma chave, sem obrigar preenchimento em todos os registros.

---

## 5 — Impacto no Billing Engine

### 5.1 Scheduler

- Continua selecionando apenas `subscriptions` com status = 'active' e next_billing_date <= CURRENT_DATE. Não lê customer_invoices.
- **Impacto:** Nenhum.

### 5.2 Worker

- Processa apenas jobs de `billing_recurring_jobs`, cada job com `subscription_id` preenchido.
- Para type = 'customer' usa `findCustomerInvoiceBySubscriptionAndPeriod(subscription_id, period_start)` e `createCustomerInvoice` sempre com subscription_id. As novas linhas com subscription_id NULL (manuais) **nunca** são consideradas pelo worker.
- **Impacto:** Nenhum, desde que o worker não seja alterado para buscar ou processar linhas com subscription_id NULL.

### 5.3 Reconciliation

- `billingReconciliationService` hoje consulta apenas **tenant_billing** (pending, asaas_payment_id NULL, idempotency_key NOT NULL).
- Não toca em customer_invoices. No futuro, se quiser reconciliar customer_invoices no mesmo estilo, será uma extensão (nova função ou mesmo serviço) consultando customer_invoices com os mesmos critérios.
- **Impacto:** Nenhum na primeira entrega.

### 5.4 Geração de recorrências

- Continua igual: worker cria customer_invoices apenas para subscription type = 'customer' com subscription_id e period_start/end preenchidos. UNIQUE(subscription_id, period_start) WHERE subscription_id IS NOT NULL preserva idempotência por ciclo.
- **Conclusão:** Worker continuará processando apenas invoices com subscription_id (recorrência). Faturas manuais (subscription_id NULL) ficam fora do Billing Engine.

---

## 6 — Performance (índices)

### 6.1 Índices já previstos no plano

- (tenant_id), (client_id), (status), (due_date), (tenant_id, status), (tenant_id, due_date)
- (gateway, asaas_payment_id) para webhook
- UNIQUE(invoice_number)

### 6.2 Uso por tipo de consulta

| Consulta | Índice recomendado | Observação |
|----------|---------------------|------------|
| Listagem por tenant | (tenant_id) ou (tenant_id, status) / (tenant_id, due_date) | Já existem tenant_id, status, due_date; compostos melhoram listagens filtradas. |
| Listagem por client | (client_id) | Já existe. |
| Webhook lookup | (gateway, asaas_payment_id) | Incluir na migration; opcional WHERE gateway IS NOT NULL AND asaas_payment_id IS NOT NULL. |
| getInvoiceById(tenantId, id) | PK (id); filtro tenant_id na aplicação | Sem índice adicional; garantir sempre WHERE tenant_id = $1 AND id = $2. |

### 6.3 Recomendação

- Adicionar **INDEX (gateway, asaas_payment_id)** conforme plano (e opcionalmente parcial).
- Manter índices (tenant_id, status) e (tenant_id, due_date) para listagens do painel.
- Não é estritamente necessário índice adicional só em (tenant_id) se já existirem os compostos.

---

## 7 — Segurança multi-tenant

### 7.1 Garantias desejadas

- Um tenant não pode acessar invoices de outro tenant.
- Um tenant não pode cobrar client de outro tenant (client_id deve pertencer ao tenant).

### 7.2 Onde validar no código

| Ponto | Validação |
|-------|-----------|
| POST /api/customer-invoices (criação) | (1) tenant_id do token/sessão; (2) client_id deve pertencer ao tenant (ex.: EXISTS (SELECT 1 FROM clients c JOIN users u ON c.user_id = u.id WHERE c.id = $client_id AND u.tenant_id = $tenant_id)). |
| GET /api/customer-invoices (listagem) | Filtrar sempre por tenant_id do contexto (app.current_tenant_id ou equivalente). Nunca expor tenant_id no body; usar apenas do auth. |
| GET /api/customer-invoices/:id | WHERE id = $id AND tenant_id = $tenant_id. |
| PATCH /api/customer-invoices/:id | Mesmo: WHERE id = $id AND tenant_id = $tenant_id. |
| createManualInvoice (serviço) | Receber tenantId do caller (controller autenticado); inserir customer_invoices com esse tenant_id; validar client_id contra esse tenant (via clients + users). |
| getInvoiceById / listInvoices | Sempre filtrar por tenant_id. |
| Webhook handlePaymentEvent | Ao atualizar customer_invoices, o registro já tem tenant_id; não expor dados de um tenant a outro (apenas atualizar status). Opcional: validar tenantIdFromPayload contra row.tenant_id quando externalReference for usado. |

### 7.3 RLS (Row Level Security)

- O plano cita RLS em customer_invoices com política por tenant_id. Se o projeto já usa RLS em outras tabelas, aplicar política em customer_invoices: `tenant_id = current_setting('app.current_tenant_id')::uuid` (ou equivalente) garante isolamento no banco mesmo que a aplicação falhe em filtrar.

---

## 8 — Checklist final antes da implementação

### 8.1 Migrations

- [ ] Nova migration (ex.: 71) para customer_invoices: subscription_id/period_start/period_end NULL; origin; invoice_type; description; status (failed, refunded); CHECKs de consistência.
- [ ] Trocar índice único (subscription_id, period_start) por índice parcial WHERE subscription_id IS NOT NULL.
- [ ] Garantir unicidade de invoice_number (limpeza + UNIQUE).
- [ ] Criar índice (gateway, asaas_payment_id).
- [ ] (Opcional) Índice único parcial em idempotency_key WHERE idempotency_key IS NOT NULL.

### 8.2 Serviços

- [ ] customerInvoiceService: createManualCustomerInvoice (ou createCustomerInvoice com subscription_id/period opcionais + origin/invoice_type); geração de invoice_number globalmente única; updateCustomerInvoiceStatus(invoiceId, status, paidAt?, asaasStatus?).
- [ ] customerBillingService (ou equivalente): createManualInvoice (valida client, cria invoice, gateway, persiste payment_id); listInvoices(tenantId, filters); getInvoiceById(tenantId, id). externalReference = tenant_{tenantId}_invoice_{invoiceId}.
- [ ] recurringBillingJobService (opcional): em processOneCustomerRenewalJob, usar externalReference = tenant_{tenantId}_invoice_{invoiceId} em vez de clientId.

### 8.3 Webhook

- [ ] asaasService.handlePaymentEvent: após tenant_billing, buscar em customer_invoices por (gateway, asaas_payment_id); ao encontrar, atualizar status/paid_at/asaas_status via updateCustomerInvoiceStatus (ou equivalente); não chamar activatePlanFromBilling.

### 8.4 Novos endpoints

- [ ] POST /api/customer-invoices (tenantAuth; body: client_id, amount_cents, due_date, description?, payment_method?).
- [ ] GET /api/customer-invoices (tenantAuth; query: client_id?, status?, limit, offset).
- [ ] GET /api/customer-invoices/:id (tenantAuth; validar tenant).
- [ ] PATCH /api/customer-invoices/:id (tenantAuth; ex.: cancelar ou atualizar description).
- [ ] (Opcional) POST /api/customer-invoices/:id/send.

### 8.5 Testes necessários

- [ ] Unit: createManualCustomerInvoice com subscription_id NULL, origin/invoice_type; invoice_number único.
- [ ] Unit: findCustomerInvoiceBySubscriptionAndPeriod não retorna manuais (subscription_id NULL).
- [ ] Integração: createManualInvoice → createCharge com externalReference correto; updateCustomerInvoiceGatewayData.
- [ ] Integração: handlePaymentEvent com asaas_payment_id de customer_invoices atualiza status/paid_at e não chama activatePlanFromBilling.
- [ ] Integração: listInvoices/getInvoiceById só retornam registros do tenant.
- [ ] Segurança: POST com client_id de outro tenant rejeitado; GET :id de invoice de outro tenant retorna 404.

---

## 9 — Resultado esperado

### 9.1 Resumo da auditoria técnica

- O plano é **compatível** com a arquitetura atual: subscription_id NULL em customer_invoices não quebra scheduler nem worker, desde que o worker continue usando apenas subscription_id vindo do job.
- É necessário **estender** customerInvoiceService (nova função ou parâmetros opcionais + updateCustomerInvoiceStatus) e **alterar** handlePaymentEvent para incluir customer_invoices com lookup por (gateway, asaas_payment_id) e sem activatePlanFromBilling.
- Migrations exigem **ordem cuidadosa**: novos campos, depois DROP NOT NULL, depois CHECKs, depois troca do índice único por parcial, depois UNIQUE(invoice_number) com tratamento de duplicatas existentes, e índice (gateway, asaas_payment_id).

### 9.2 Riscos encontrados

| Risco | Mitigação |
|-------|-----------|
| Duplicidade de invoice_number ao adicionar UNIQUE | Migração que garante unicidade (ex.: sufixo por id) antes de ADD CONSTRAINT. |
| Webhook atualiza tenant_billing e customer_invoices com mesma lógica | Manter ordem: primeiro tenant_billing; só se não achar, customer_invoices; para customer_invoices não chamar activatePlanFromBilling. |
| Retry/createCharge duplicado | idempotency_key estável (ex.: customer_manual_{tenantId}_{invoiceId}); gateway retorna cobrança existente. |
| Tenant acessa invoice de outro | Sempre filtrar por tenant_id em todos os endpoints e no serviço; validar client_id contra tenant. |
| customerInvoiceService sem updateCustomerInvoiceStatus | Adicionar updateCustomerInvoiceStatus e usar no webhook. |

### 9.3 Ajustes recomendados no plano

1. **Plano:** Deixar explícito que a migration deve **dropar** o índice único atual (subscription_id, period_start) e criar o **parcial** WHERE subscription_id IS NOT NULL.
2. **Plano:** Incluir no escopo de implementação a função **updateCustomerInvoiceStatus** (ou equivalente) em customerInvoiceService para uso no webhook.
3. **Plano:** Especificar tratamento de **invoice_number** na migration (verificação de duplicatas e estratégia de unicidade antes de UNIQUE).
4. **Plano:** (Opcional) Índice único parcial em **idempotency_key** WHERE idempotency_key IS NOT NULL em customer_invoices.
5. **Worker (recorrência):** Considerar alterar externalReference em processOneCustomerRenewalJob para `tenant_{tenantId}_invoice_{invoiceId}` para consistência e resolução no webhook.

### 9.4 Ordem segura de implementação

1. **Fase 1 — Migrations:** Aplicar migration 71 (customer_invoices: colunas, NULLs, CHECKs, índice parcial, UNIQUE(invoice_number), índice (gateway, asaas_payment_id)).
2. **Fase 2 — Serviços de domínio:** customerInvoiceService (createManualCustomerInvoice, invoice_number global única, updateCustomerInvoiceStatus); depois customerBillingService (createManualInvoice, listInvoices, getInvoiceById) com validação de client/tenant.
3. **Fase 3 — Gateway:** createManualInvoice chama getActiveGateway('crm'), ensureCustomerForClient, createCharge com idempotency_key e externalReference = tenant_{tenantId}_invoice_{invoiceId}, updateCustomerInvoiceGatewayData.
4. **Fase 4 — Webhook:** handlePaymentEvent estendido: lookup em customer_invoices; updateCustomerInvoiceStatus; sem activatePlanFromBilling.
5. **Fase 5 — API e segurança:** Rotas e controller com tenantAuth; validação client_id ∈ tenant; testes de isolamento.

### 9.5 Confirmação: plano pronto para implementação?

**Sim**, o plano está **pronto para implementação**, desde que:

- As **migrations** sigam a ordem segura e o tratamento de UNIQUE(invoice_number) e do índice parcial (subscription_id, period_start) descritos nesta auditoria.
- O **webhook** use lookup em duas etapas (tenant_billing depois customer_invoices) e não chame activatePlanFromBilling para customer_invoices.
- Os **serviços** incluam updateCustomerInvoiceStatus para customer_invoices e criação manual com invoice_number globalmente única e externalReference no formato tenant_{tenantId}_invoice_{invoiceId}.
- A **segurança multi-tenant** seja aplicada em todos os endpoints e na validação de client_id.

Com esses pontos incorporados (ou já previstos no plano), a implementação pode seguir as fases do documento sem conflito com o Billing Engine existente.
