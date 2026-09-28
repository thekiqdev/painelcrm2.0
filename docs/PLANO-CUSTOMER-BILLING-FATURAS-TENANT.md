# Plano de implantação: Customer Billing — Faturas do tenant para seus clientes

**Objetivo:** Permitir que cada tenant do SaaS cadastre clientes, crie faturas para cobrá-los, gere cobranças via gateway e acompanhe o status de pagamento, reutilizando ao máximo o Billing Engine existente.

**Escopo deste documento:** Análise da estrutura atual, arquitetura recomendada, tabelas, fluxos e plano por etapas. **Nenhum código deve ser implementado a partir deste documento sem aprovação explícita.**

---

## ETAPA 1 — Análise da estrutura atual

### 1.1 Tabelas relacionadas a billing

| Tabela | Uso atual | Observação |
|--------|-----------|------------|
| **subscriptions** | Assinaturas universais: `type = 'saas'` (plano do tenant) ou `type = 'customer'` (recorrência para cliente do CRM). Campos: tenant_id, customer_id (client_id), plan_id, amount_cents, next_billing_date, billing_anchor_day, status, etc. | Reutilizável para recorrência de cliente; não obrigatória para cobrança avulsa. |
| **tenant_billing** | Faturas do **SaaS**: cobrança do tenant pelo plano (nosso sistema). Campos: tenant_id, plan_id, amount_cents, due_date, status, invoice_number, gateway, asaas_payment_id, idempotency_key, period_start/end, subscription_id (quando recorrência). | Não reutilizável para “tenant cobra cliente”; é cobrança *do* tenant. |
| **billing_recurring_jobs** | Jobs de recorrência: scheduler enfileira, worker processa. result_invoice_type = 'tenant_billing' ou 'customer_invoice'. | Worker já gera customer_invoices quando subscription.type = 'customer'. |
| **customer_invoices** | Faturas **recorrentes** dos clientes do CRM. Sempre ligadas a **subscription_id** (NOT NULL). Criadas pelo worker (Billing Engine). Campos: tenant_id, client_id, subscription_id, period_start/end, amount_cents, due_date, status, invoice_number, gateway, asaas_payment_id, idempotency_key. | Estrutura próxima do desejado; hoje **apenas** recorrência (subscription_id obrigatório). |
| **payment_customers** | Vínculo tenant/client ↔ gateway: (tenant_id, gateway_key, client_id opcional). client_id NULL = SaaS; client_id preenchido = cliente do CRM no gateway. | Reutilizável: ensureCustomerForClient(tenantId, clientId, clientData). |
| **payment_gateway_configs** | Configuração por escopo: scope = 'global' (SaaS) ou 'tenant' (CRM). Para CRM, tenant_id obrigatório; cada tenant pode ter sua própria config Asaas. | Já suporta gateway por tenant para cobrança CRM. |
| **asaas_webhook_events** | Idempotência e retry de eventos do webhook Asaas. | Reutilizável. |
| **payment_webhook_events** | Eventos de webhook para debug (payment_webhook_events). | Reutilizável. |

**Outras relacionadas:** plans, plan_interval_prices (planos do SaaS); clients (cadastro de clientes do CRM; user_id → isolamento por tenant via RLS).

---

### 1.2 Serviços existentes

| Serviço | Responsabilidade | Reutilizável para tenant cobra cliente? |
|---------|------------------|------------------------------------------|
| **invoiceService** | createInvoice (tenant_billing), generateInvoiceNumber, updateInvoiceGatewayData, findInvoiceBySubscriptionAndPeriod, getInvoiceByGatewayPaymentId, updateInvoiceStatus. | Não para criar fatura do cliente; sim **padrões**: número de invoice, persistir antes do gateway, atualizar payment_id. |
| **customerInvoiceService** | createCustomerInvoice (customer_invoices com subscription_id), findCustomerInvoiceBySubscriptionAndPeriod, updateCustomerInvoiceGatewayData. Geração de invoice_number: **deve ser globalmente única** (ver seção 2.3.1). | Parcialmente: criação de registro e log; hoje exige subscription_id. |
| **paymentGatewayConfigService** | getActiveConfig(billingType, tenantId). Para 'crm' retorna config do tenant. | Sim. |
| **gatewayProvider / gatewayResolver** | getActiveGateway({ billingType: 'crm', tenantId }). Retorna gateway com ensureCustomerForClient e createCharge. | Sim. |
| **paymentCustomersService** | getPaymentCustomer (SaaS), createPaymentCustomer, getPaymentCustomerForClient, createPaymentCustomerForClient. | Sim: garantir cliente do CRM no gateway antes de createCharge. |
| **recurringBillingJobService** | Scheduler (enfileira jobs), worker (processa renewal; type=customer → processOneCustomerRenewalJob). | Worker não precisa criar “fatura manual”; apenas recorrência. |
| **billingLogger** | billingLog, notifyBillingJobFailed. | Sim. |
| **billingReconciliationService** | Reconcilia tenant_billing pending sem asaas_payment_id. | Pode ser estendido para customer_invoices (ou nova tabela de faturas manuais) depois. |

**Integração com gateway (Asaas):**  
- ensureCustomerForClient(tenantId, clientId, clientData) já existe: cria cliente no Asaas a partir de dados do client (name, email, phone); persiste em payment_customers(tenant_id, gateway_key, client_id).  
- createCharge(customerId, amountCents, dueDate, paymentMethod, description, idempotencyKey, externalReference) já usado no worker para customer_invoices. **Recomendação:** externalReference no formato **tenant_{tenantId}_invoice_{invoiceId}** (não só invoice_id), pois alguns gateways permitem IDs repetidos entre contas; assim o webhook identifica a fatura de forma inequívoca.

---

### 1.3 Lógica reutilizável

| Recurso | Onde está | Uso no Customer Billing (tenant cobra cliente) |
|---------|-----------|------------------------------------------------|
| Geração de invoice_number | invoiceService (INV-), customerInvoiceService (CINV-) | **Globalmente única:** usar padrão que não repita entre tenants (ex.: CINV-{ano}-{sequencial} ou INV-{hash}); constraint UNIQUE(invoice_number) no banco. |
| Criação de cobrança no gateway | getActiveGateway('crm', tenantId) → createCharge | Mesmo fluxo: ensureCustomerForClient (ou get existente) → createCharge com idempotency_key. |
| Webhook de confirmação | asaasWebhookHandler → handlePaymentEvent | **Gap atual:** handlePaymentEvent só busca em **tenant_billing** por asaas_payment_id; não atualiza customer_invoices. É necessário estender para: se não achar em tenant_billing, buscar em customer_invoices (e eventualmente em nova tabela de faturas manuais) e atualizar status/paid_at. |
| idempotency_key | createCharge, tenant_billing.idempotency_key, customer_invoices.idempotency_key | Mesmo padrão: ex. customer_manual_{invoice_id}_{created_at} ou tenant_client_{tenant_id}_{client_id}_{due_date}_{uuid}. |
| Sistema de logs | billingLog('invoice', 'invoice_created', ...) | Reutilizar em toda criação de fatura e chamada ao gateway. |

**Resumo:** Podem ser reutilizados para “tenant cobra cliente”: gateway (crm + tenantId), ensureCustomerForClient, createCharge, payment_customers, geração de número de fatura, idempotency, logs. É necessário estender o webhook para atualizar a tabela de faturas do cliente (customer_invoices e/ou tabela de manuais).

---

## ETAPA 2 — Definição do novo domínio (Customer Billing)

### 2.1 Entidades sugeridas

- **customers:** No sistema atual já existe a entidade **clients** (cadastro de clientes do tenant no CRM), com user_id (isolamento por tenant via users.tenant_id). Para billing, o “customer” é o mesmo que o **client** (client_id). Não é obrigatório criar tabela `customers` separada: usar **clients** como cadastro de “clientes a cobrar”. Se no futuro for necessário armazenar dados exclusivos de cobrança (ex.: CPF só para gateway), pode-se adicionar colunas em clients ou tabela `client_billing_profiles`.
- **customer_invoices:** Já existe; hoje só para recorrência (subscription_id NOT NULL). Recomendação: **estender** para faturas manuais tornando subscription_id **opcional** e adicionando origem (**origin**: 'manual' | 'subscription' | 'api' | 'import'; ver seção 2.3).
- **customer_invoice_items:** Opcional para Fase 1. Permite itens por linha (descrição, quantidade, valor). Para MVP, apenas amount_cents na invoice é suficiente; itens podem ser fase posterior.

### 2.2 Opção recomendada: estender customer_invoices

Em vez de criar uma segunda tabela de faturas (ex.: tenant_customer_invoices), recomenda-se **uma única tabela** customer_invoices com dois fluxos:

| Origem | subscription_id | period_start / period_end | Uso |
|--------|------------------|---------------------------|-----|
| Recorrência (Billing Engine) | NOT NULL | NOT NULL | Worker cria; UNIQUE(subscription_id, period_start) já existe. |
| Manual (tenant cria no painel) | NULL | NULL ou opcional | Tenant cria; gera cobrança avulsa no gateway. |

Alterações necessárias na tabela existente:

- **subscription_id:** passar a `NULL` permitido (para faturas manuais).
- **period_start, period_end:** permitir NULL (para manuais sem período definido).
- **origin:** novo campo TEXT NOT NULL DEFAULT 'subscription' CHECK (origin IN ('manual', 'subscription', 'api', 'import')) para distinguir origem e preparar evolução (API pública, importação CSV, automações). Recorrência = 'subscription'; criação pelo painel = 'manual'; futuros: 'api', 'import'.
- **invoice_type:** novo campo TEXT NOT NULL CHECK (invoice_type IN ('recurring', 'manual')) para agrupamento semântico em analytics, relatórios, BI e métricas SaaS (recurring = assinatura; manual = avulso), independente de origin.
- **Constraint UNIQUE(subscription_id, period_start):** manter apenas onde subscription_id IS NOT NULL (já é índice parcial em 70; verificar se a constraint atual permite subscription_id NULL em outras linhas).
- **invoice_number:** deve ser **globalmente único** (UNIQUE no banco); ver 2.3.1.
- **Índices:** manter e adicionar índice por (tenant_id, status) e (tenant_id, due_date) para listagens do painel.

Campos já existentes que servem para ambos os fluxos: tenant_id, client_id, amount_cents, due_date, status, invoice_number, gateway, asaas_payment_id, asaas_status, idempotency_key, paid_at, created_at, updated_at.

### 2.3 Tabela customer_invoices (esquema alvo)

| Campo | Tipo | Obrigatório | Observação |
|-------|------|-------------|------------|
| id | UUID PK | sim | |
| tenant_id | UUID FK → tenants | sim | Isolamento. |
| client_id | UUID FK → clients | sim | Cliente cobrado. |
| subscription_id | UUID FK → subscriptions | **não** (NULL para manual) | Preenchido só em recorrência. |
| period_start | DATE | não (NULL para manual) | |
| period_end | DATE | não (NULL para manual) | |
| amount_cents | INT CHECK (>= 0) | sim | |
| due_date | DATE | sim | |
| status | TEXT | sim | pending, paid, overdue, cancelled, **failed**, **refunded** (ver 2.3.2) |
| origin | TEXT | sim | 'manual' \| 'subscription' \| 'api' \| 'import' (ver 2.3.3) |
| invoice_type | TEXT | sim | 'recurring' \| 'manual' (ver 2.3.4 — analytics/BI) |
| paid_at | TIMESTAMPTZ | não | |
| invoice_number | TEXT | não (gerado) | **Globalmente único** (ver 2.3.1) |
| gateway | TEXT | não | |
| payment_method | TEXT | não | PIX, BOLETO, CREDIT_CARD |
| asaas_payment_id | TEXT | não | |
| asaas_status | TEXT | não | |
| idempotency_key | TEXT | não | |
| description | TEXT | não | (novo) Descrição livre para manuais. |
| created_at, updated_at | TIMESTAMPTZ | sim | |

**Constraints e índices:**

- UNIQUE(subscription_id, period_start) WHERE subscription_id IS NOT NULL (já existe).
- **UNIQUE(invoice_number)** — global no banco; evita duplicidade entre tenants em exportações, contabilidade, PDFs, ERP.
- CHECK (origin IN ('manual', 'subscription', 'api', 'import')).
- CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled', 'failed', 'refunded')).
- CHECK ( (origin = 'subscription' AND subscription_id IS NOT NULL) OR (origin IN ('manual', 'api', 'import') AND subscription_id IS NULL) ) para garantir consistência.
- CHECK (invoice_type IN ('recurring', 'manual')).
- Índices: tenant_id, client_id, status, due_date, (tenant_id, status), (tenant_id, due_date); **INDEX (gateway, asaas_payment_id)** para webhook lookup (ver 2.3.5).

#### 2.3.1 invoice_number — globalmente único

O padrão **CINV-{tenant}-{suffix}** pode gerar duplicidade entre tenants (ex.: CINV-tenantA-0001 e CINV-tenantB-0001). Em exportação de relatórios, integração contábil, geração de PDFs ou sincronização com ERP isso vira problema.

**Recomendação técnica:**

- **Padrão:** número globalmente único, por exemplo:
  - `CINV-{ano}-{sequencial}` → CINV-2026-000000234 (sequencial por ano, tabela de sequência ou sequence).
  - ou `INV-{hash}` → INV-8F2A91C (hash curto de id + timestamp, colisão improvável).
- **Constraint:** `invoice_number` UNIQUE global no banco (customer_invoices e, se aplicável, tenant_billing para consistência futura).

#### 2.3.2 status — valores expandidos

Além de pending, paid, overdue, cancelled, incluir desde o desenho:

| status   | Quando ocorre           |
|----------|--------------------------|
| failed   | Pagamento recusado       |
| refunded | Reembolso efetuado       |

Mesmo que não sejam usados na primeira entrega, evita migração de schema depois.

#### 2.3.3 origin — origem da fatura

Campo **origin** (em vez de *source*) com valores que permitem evoluir sem mudar o schema:

| origin      | Uso atual / futuro                          |
|-------------|---------------------------------------------|
| manual      | Tenant cria pelo painel                     |
| subscription| Billing Engine (recorrência)                |
| api         | API pública de cobrança (futuro)            |
| import      | Importação CSV, automações, integrações     |

#### 2.3.4 invoice_type — tipo semântico (analytics / BI)

Manter **origin** para detalhamento (manual, subscription, api, import) e adicionar **invoice_type** para agrupamento semântico:

| invoice_type | Uso |
|--------------|-----|
| recurring | Fatura gerada por assinatura/recorrência (Billing Engine). |
| manual | Fatura avulsa criada pelo tenant (painel, API, import). |

Isso facilita **analytics, relatórios, BI e métricas SaaS** (ex.: "faturas manuais vs recorrentes", dashboards por tipo) sem depender de regras sobre origin.

**Constraint:** CHECK (invoice_type IN ('recurring', 'manual')). Derivação: origin = 'subscription' → invoice_type = 'recurring'; origin IN ('manual', 'api', 'import') → invoice_type = 'manual'.

#### 2.3.5 Índice (gateway, asaas_payment_id)

Adicionar **INDEX (gateway, asaas_payment_id)** na tabela customer_invoices. O webhook recebe eventos com identificador do gateway e payment_id; esse índice melhora muito o lookup ao atualizar status (evita full scan).

### 2.4 customer_invoice_items (fase posterior)

Para não alterar a arquitetura atual, itens podem ficar para uma fase 2 do Customer Billing:

| Campo | Tipo | Observação |
|-------|------|------------|
| id | UUID PK | |
| customer_invoice_id | UUID FK → customer_invoices | |
| description | TEXT | |
| quantity | NUMERIC | default 1 |
| unit_amount_cents | INT | |
| total_cents | INT (gerado) | quantity * unit_amount_cents |

---

## ETAPA 3 — Fluxo de criação de fatura (manual)

Fluxo técnico quando o usuário cria uma fatura pelo painel:

1. **Usuário cria invoice no painel**  
   - Seleciona cliente (client_id), informa valor (amount_cents), vencimento (due_date), opcionalmente descrição e método de pagamento preferido.

2. **API recebe POST** (ex.: POST /api/customer-invoices)  
   - Valida tenant (auth), client_id (pertence ao tenant), amount_cents > 0, due_date >= hoje (ou política definida).

3. **Sistema cria registro no banco**  
   - INSERT em customer_invoices com tenant_id, client_id, amount_cents, due_date, origin = 'manual', **invoice_type = 'manual'**, subscription_id NULL, period_start/end NULL, status = 'pending'.  
   - Gera **invoice_number globalmente único** (ex.: CINV-2026-000000234 ou INV-8F2A91C; ver 2.3.1).  
   - Persiste **antes** de chamar o gateway (garante fatura mesmo se gateway falhar).

4. **Sistema chama o gateway**  
   - getActiveGateway({ billingType: 'crm', tenantId }).  
   - ensureCustomerForClient(tenantId, clientId, clientData) com dados do client (name, email, phone); cria ou reutiliza customer no gateway e em payment_customers.  
   - createCharge({ customerId, amountCents, dueDate, paymentMethod, description, idempotencyKey, **externalReference** }).
   - **externalReference** no formato **`tenant_{tenantId}_invoice_{invoiceId}`** (ex.: `tenant_8f2a91c0-..._invoice_a1b2c3d4-...`). Alguns gateways permitem IDs repetidos entre contas; incluir tenant_id evita colisão e permite ao webhook resolver a fatura correta.
   - idempotencyKey: ex. `customer_manual_{tenant_id}_{invoice_id}` ou `customer_manual_{tenant_id}_{client_id}_{due_date}_{short_uuid}`.

5. **Gateway retorna payment_id (e URLs)**  
   - updateCustomerInvoiceGatewayData(invoice_id, { gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key }).

6. **Resposta à API**  
   - Retorna invoice + paymentUrls (invoiceUrl, bankSlipUrl, pixQrCode, pixCopyPaste) quando o gateway devolver.

7. **Webhook de pagamento**  
   - Asaas envia evento PAYMENT_RECEIVED / PAYMENT_CONFIRMED.  
   - Handler atual busca apenas em tenant_billing; deve ser estendido para buscar também em customer_invoices por gateway + asaas_payment_id (índice (gateway, asaas_payment_id) acelera o lookup).  
   - Ao encontrar customer_invoice: atualizar status = 'paid', paid_at = now(); **não** chamar activatePlanFromBilling (essa lógica é só para tenant_billing).

---

## ETAPA 4 — Integração com o Billing Engine

### Opção A) Reutilizar diretamente o Billing Engine atual

- **Ideia:** Usar a mesma tabela (customer_invoices), mesmo gateway (crm + tenantId), mesmo ensureCustomerForClient e createCharge; apenas adicionar fluxo “manual” (sem subscription_id, sem worker).
- **Vantagens:** Uma única tabela de faturas do cliente; um único ponto de webhook; menos duplicação de lógica (gateway, idempotency, logs).  
- **Desvantagens:** Tabela tem dois significados (recorrência vs manual); regras de negócio (ex.: UNIQUE) devem tratar subscription_id NULL com cuidado.

### Opção B) Criar serviço separado para customer invoices (manuais)

- **Ideia:** Nova tabela ex. tenant_customer_invoices só para faturas manuais; customer_invoices continua só para recorrência.
- **Vantagens:** Separação clara recorrência vs manual; nenhuma alteração em customer_invoices existente.  
- **Desvantagens:** Duplicação de estrutura (campos muito similares), dois lugares para o webhook atualizar, dois conjuntos de serviços/endpoints.

### Recomendação

**Opção A (estender customer_invoices)** com **origin** = 'manual' | 'subscription' | 'api' | 'import' e subscription_id opcional. Reduz duplicação, mantém um único fluxo de webhook e um único modelo mental “fatura do tenant para seu cliente”. O Billing Engine (scheduler/worker) continua responsável apenas por subscription_id NOT NULL (origin = 'subscription'); o restante é “customer billing” (criação manual, API, import e consultas).

---

## ETAPA 5 — API e serviços

### 5.1 Endpoints sugeridos

Todos sob autenticação do tenant (tenantAuth / app.current_tenant_id).

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /api/customers | **Opcional** se “customers” = clients; caso contrário, cadastro de cliente para cobrança. Se reutilizar clients, usar endpoints existentes de clients (GET/POST /api/clients). |
| POST | /api/customer-invoices | Cria fatura manual (body: client_id, amount_cents, due_date, description?, payment_method?). Retorna invoice + paymentUrls. |
| GET | /api/customer-invoices | Lista faturas do tenant (query: client_id?, status?, limit, offset). |
| GET | /api/customer-invoices/:id | Detalhe de uma fatura (e status de pagamento). |
| PATCH | /api/customer-invoices/:id | Atualizar descrição ou cancelar (status = cancelled) se ainda pending. |
| POST | /api/customer-invoices/:id/send | (Opcional) Reenviar link/ e-mail da cobrança; depende de integração e-mail. |

Uso de **clients** como “customers”: os endpoints de clientes já existem (clientsRoutes). Para billing, basta que o tenant escolha um client_id ao criar a fatura; não é obrigatório criar um novo recurso “customers” separado.

### 5.2 Serviços a criar ou estender

| Serviço | Ação |
|---------|------|
| **customerInvoiceService** | Estender createCustomerInvoice para aceitar origin e subscription_id opcional (manual); função createManualCustomerInvoice(tenantId, clientId, amountCents, dueDate, description?, paymentMethod?). Geração de invoice_number globalmente única (ver 2.3.1). Manter createCustomerInvoice atual para o worker (origin = 'subscription'). |
| **customerBillingService** (ou orquestrador) | Novo: createManualInvoice(tenantId, body) → valida client, cria customer_invoice (manual), chama gateway, persiste payment_id, retorna invoice + paymentUrls. listInvoices(tenantId, filters), getInvoiceById(tenantId, id). |
| **Webhook (handlePaymentEvent)** | Estender: se não encontrar em tenant_billing, buscar em customer_invoices por (gateway, asaas_payment_id) — índice dedicado; opcionalmente resolver por externalReference = tenant_{tenantId}_invoice_{invoiceId}; atualizar status/paid_at (e asaas_status); não chamar activatePlanFromBilling. |
| **invoiceService** | Sem alteração; continua só para tenant_billing. |
| **Gateway / payment_customers** | Já suportam CRM; sem alteração de contrato. |

---

## ETAPA 6 — Segurança e escala

- **Isolamento por tenant:** Todas as queries de customer_invoices devem filtrar por tenant_id (e opcionalmente validar que client_id pertence ao tenant via clients → user_id → users.tenant_id). RLS pode ser aplicado em customer_invoices com política por tenant_id.
- **Proteção contra duplicidade:** idempotency_key em toda createCharge; UNIQUE(idempotency_key) ou índice único em customer_invoices quando idempotency_key não nulo; evita duas cobranças iguais em retry.
- **Idempotência no gateway:** Sempre passar idempotencyKey no createCharge; o gateway (Asaas) retorna o pagamento existente se a chave for repetida.
- **Compatibilidade com o worker atual:** Worker só processa jobs com subscription_id; não toca em linhas com subscription_id NULL (manuais). Não é necessário alterar scheduler nem worker para faturas manuais.

---

## ETAPA 7 — Plano de implementação por etapas

### Fase 1 — Estrutura de clientes

- **Objetivo:** Garantir que “clientes a cobrar” existam e estejam acessíveis por tenant.
- **Migrations:** Nenhuma obrigatória se reutilizar **clients**; opcional: adicionar coluna clients.cpf_cnpj ou client_billing_profiles se for necessário CPF para o gateway.
- **Serviços:** Nenhum novo; usar clientsController e validação de que client pertence ao tenant.
- **Testes:** Garantir que apenas clientes do tenant sejam listados e que o tenant só possa criar fatura para client_id do seu tenant.

### Fase 2 — Estrutura de faturas (customer_invoices manuais)

- **Migrations:**  
  - ALTER customer_invoices: subscription_id NULL permitido; period_start, period_end NULL permitidos; ADD **origin** TEXT NOT NULL DEFAULT 'subscription' CHECK (origin IN ('manual', 'subscription', 'api', 'import')); ADD **invoice_type** TEXT NOT NULL DEFAULT 'recurring' CHECK (invoice_type IN ('recurring', 'manual')); ADD description TEXT NULL.  
  - **invoice_number:** garantir UNIQUE global (e padrão de geração globalmente único: ex. CINV-{ano}-{sequencial} ou INV-{hash}); ver 2.3.1.  
  - **status:** incluir failed, refunded no CHECK; ver 2.3.2.  
  - Ajustar constraint: UNIQUE(subscription_id, period_start) WHERE subscription_id IS NOT NULL (se ainda não for parcial).  
  - CHECK ( (origin = 'subscription' AND subscription_id IS NOT NULL) OR (origin IN ('manual', 'api', 'import') AND subscription_id IS NULL) ).  
  - **INDEX (gateway, asaas_payment_id)** para webhook lookup; ver 2.3.5.
- **Serviços:** customerInvoiceService: createManualCustomerInvoice(...) com geração de invoice_number única. customerBillingService (ou equivalente): createManualInvoice, listInvoices, getInvoiceById com filtro tenant_id.
- **Testes:** Criar fatura manual (subscription_id NULL, origin = 'manual', invoice_type = 'manual'); listar por tenant e por invoice_type; garantir que worker não processa essas linhas; garantir unicidade de invoice_number entre tenants.

### Fase 3 — Integração com gateway

- **Migrations:** Nenhuma.
- **Serviços:** No createManualInvoice: getActiveGateway('crm', tenantId), ensureCustomerForClient(tenantId, clientId, clientData do client), createCharge com idempotency_key e **externalReference = `tenant_{tenantId}_invoice_{invoiceId}`**, updateCustomerInvoiceGatewayData. Retornar paymentUrls quando o gateway fornecer.
- **Testes:** Tenant com config CRM ativa; criar fatura manual e verificar criação de cobrança no gateway e persistência de asaas_payment_id; idempotency (segunda chamada com mesma chave não duplica cobrança); webhook consegue resolver fatura por externalReference.

### Fase 4 — Webhook de pagamento

- **Migrations:** Nenhuma.
- **Serviços:** handlePaymentEvent (asaasService): após buscar em tenant_billing, se não encontrar, buscar em customer_invoices por **(gateway, asaas_payment_id)** — usar índice (gateway, asaas_payment_id); opcionalmente resolver por externalReference no formato tenant_{tenantId}_invoice_{invoiceId}; atualizar status conforme evento ('paid', 'failed', 'refunded' etc.), paid_at quando pago, asaas_status; não chamar activatePlanFromBilling.
- **Testes:** Simular webhook PAYMENT_CONFIRMED para um asaas_payment_id que pertence a customer_invoices; conferir atualização de status e que activatePlanFromBilling não é chamado; (futuro) eventos de falha/reembolso atualizam status para failed/refunded.

### Fase 5 — Endpoints e serviços expostos

- **Migrations:** Nenhuma.
- **Rotas:** POST/GET/GET:id (e opcionalmente PATCH, POST :id/send) em rotas protegidas por tenantAuth; controller que delega a customerBillingService.
- **Serviços:** Expor createManualInvoice, listInvoices, getInvoiceById no controller; validação de tenant e client_id.
- **Testes:** E2E ou manuais: criar fatura via API, listar, obter detalhe; verificar isolamento entre tenants.

---

## Resumo do resultado esperado

1. **Análise da estrutura atual:** Tabelas (subscriptions, tenant_billing, billing_recurring_jobs, customer_invoices, payment_customers, payment_gateway_configs), serviços (invoice, customerInvoice, gateway, paymentCustomers, worker) e lógica reutilizável (invoice_number globalmente única, gateway createCharge com externalReference = invoice, idempotency, logs) identificados; webhook hoje só atualiza tenant_billing.
2. **Arquitetura recomendada:** Estender customer_invoices para faturas manuais (subscription_id NULL, origin, **invoice_type** para analytics/BI); usar clients como “customers”; invoice_number globalmente única; externalReference = **tenant_{tenantId}_invoice_{invoiceId}**; status expandido (incl. failed, refunded); índice (gateway, asaas_payment_id) para webhook; um único fluxo de webhook atualizando customer_invoices.
3. **Tabelas:** customer_invoices com subscription_id e period_start/end opcionais, **origin**, **invoice_type**, description, status com failed/refunded; **UNIQUE(invoice_number)** global; **INDEX (gateway, asaas_payment_id)**; CHECK de origin e invoice_type; customer_invoice_items deixado para fase posterior.
4. **Fluxo de cobrança:** Criar fatura no banco (invoice_number única) → chamar gateway (ensureCustomerForClient + createCharge com externalReference = tenant_{tenantId}_invoice_{invoiceId}) → persistir payment_id → webhook atualiza status por (gateway, asaas_payment_id) ou externalReference (e trata failed/refunded quando aplicável).
5. **Plano por etapas:** Fase 1 (clientes), Fase 2 (estrutura de faturas manuais, origin, invoice_type, invoice_number única, status expandido, índice gateway+asaas_payment_id), Fase 3 (gateway com externalReference = tenant_{tenantId}_invoice_{invoiceId}), Fase 4 (webhook), Fase 5 (endpoints e API), com migrations, serviços e testes indicados em cada fase.

Este documento deve ser usado como referência para a implementação segura da funcionalidade “tenant cria faturas para seus clientes”, sem alterar a arquitetura do Billing Engine de recorrência já em produção.
