# Validação final pré-implementação — Customer Billing

**Objetivo:** Confirmar, contra o código real do projeto, que o plano e a auditoria técnica estão corretos e identificar qualquer ponto faltante antes da codificação.

**Escopo:** Apenas verificação. Nenhum código, migration ou implementação.

---

## 1 — Validação do banco de dados

### 1.1 Estrutura atual da tabela `customer_invoices` (70_customer_invoices.sql)

**Colunas atuais:**

| Coluna           | Tipo         | Nullable | Default | Constraint / Observação |
|------------------|--------------|----------|---------|--------------------------|
| id               | UUID         | NOT NULL | gen_random_uuid() | PK |
| tenant_id        | UUID         | NOT NULL | —       | FK → tenants ON DELETE CASCADE |
| client_id        | UUID         | NOT NULL | —       | FK → clients ON DELETE CASCADE |
| subscription_id  | UUID         | NOT NULL | —       | FK → subscriptions ON DELETE CASCADE |
| period_start     | DATE         | NOT NULL | —       | |
| period_end       | DATE         | NOT NULL | —       | |
| amount_cents     | INT          | NOT NULL | —       | CHECK (amount_cents >= 0) |
| due_date         | DATE         | NOT NULL | —       | |
| status           | TEXT         | NOT NULL | 'pending' | CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')) |
| paid_at          | TIMESTAMPTZ  | NULL     | —       | |
| invoice_number   | TEXT         | NULL     | —       | **Sem UNIQUE** |
| gateway          | TEXT         | NULL     | —       | |
| payment_method   | TEXT         | NULL     | —       | CHECK (PIX, BOLETO, CREDIT_CARD ou NULL) |
| asaas_payment_id | TEXT         | NULL     | —       | |
| asaas_status     | TEXT         | NULL     | —       | |
| idempotency_key  | TEXT         | NULL     | —       | |
| created_at       | TIMESTAMPTZ  | NOT NULL | now()   | |
| updated_at       | TIMESTAMPTZ  | NOT NULL | now()   | |

**Constraints atuais:**  
- PK em `id`.  
- CHECK em `amount_cents >= 0`.  
- CHECK em `status IN ('pending', 'paid', 'overdue', 'cancelled')`.  
- CHECK em `payment_method` (PIX/BOLETO/CREDIT_CARD ou NULL).  
- FKs em tenant_id, client_id, subscription_id.

**Índices atuais:**

| Nome                                      | Tipo   | Colunas                          | Observação |
|-------------------------------------------|--------|-----------------------------------|------------|
| idx_customer_invoices_subscription_period | UNIQUE | (subscription_id, period_start)   | **Não é parcial** — cobre todas as linhas |
| idx_customer_invoices_tenant_id           | INDEX  | (tenant_id)                       | |
| idx_customer_invoices_client_id          | INDEX  | (client_id)                       | |
| idx_customer_invoices_subscription_id    | INDEX  | (subscription_id)                 | |
| idx_customer_invoices_status             | INDEX  | (status)                          | |
| idx_customer_invoices_due_date           | INDEX  | (due_date)                        | |

**invoice_number:**  
- **Não** possui UNIQUE.  
- Geração atual em `customerInvoiceService.ts`: `CINV-${short}-${suffix}` com `short = tenantId.slice(0,8)` e `suffix = Date.now().toString(36)`.  
- Risco de duplicidade: entre tenants (mesmo timestamp) e no mesmo tenant no mesmo ms.

**Migrations após 70:**  
- Lista em `migrate.ts`: 70 é seguida apenas por `create-admin-user.sql`.  
- Nenhuma migration 71+ altera `customer_invoices`.  
- **Conclusão:** A única definição da tabela é a da 70; a próxima alteração será uma nova migration (ex.: 71).

### 1.2 Índice `idx_customer_invoices_subscription_period`

- **Existe:** Sim (70_customer_invoices.sql, linhas 26–27).  
- **É UNIQUE:** Sim: `CREATE UNIQUE INDEX ... ON public.customer_invoices (subscription_id, period_start)`.  
- **É parcial?** Não — não há `WHERE subscription_id IS NOT NULL`.  
- **Precisa ser removido antes do parcial?** Sim. Para permitir `subscription_id` NULL e manter unicidade só para recorrência, é obrigatório:  
  1. `DROP INDEX idx_customer_invoices_subscription_period`  
  2. `CREATE UNIQUE INDEX ... ON customer_invoices (subscription_id, period_start) WHERE subscription_id IS NOT NULL`

### 1.3 Possíveis duplicidades em `invoice_number` e estratégia de migration

- **Risco:** Geração atual pode repetir entre tenants (mesmo `Date.now()`) ou no mesmo tenant no mesmo ms.  
- **Estratégia segura sugerida na migration 71:**  
  1. Antes de adicionar UNIQUE(invoice_number):  
     - Opção A: `UPDATE customer_invoices SET invoice_number = id::text WHERE invoice_number IS NULL OR invoice_number IN (SELECT invoice_number FROM ... GROUP BY invoice_number HAVING COUNT(*) > 1)` e depois garantir formato único (ex.: `CINV-` + id ou sequencial).  
     - Opção B: Para cada grupo duplicado (mesmo invoice_number), atualizar com sufixo único (ex.: `invoice_number || '-' || id::text` ou sequencial).  
  2. Garantir que não reste NULL: `UPDATE customer_invoices SET invoice_number = 'CINV-LEGACY-' || id WHERE invoice_number IS NULL`.  
  3. `ALTER TABLE customer_invoices ADD CONSTRAINT ... UNIQUE (invoice_number)` (ou CREATE UNIQUE INDEX).  
- **Conclusão:** A migration proposta pode ser aplicada com segurança desde que a etapa de desduplicação/garantia de unicidade de `invoice_number` seja executada antes do UNIQUE.

---

## 2 — Compatibilidade com o Billing Engine

### 2.1 recurringBillingJobService / scheduler / worker

**Scheduler (`enqueueRenewalJobs`):**  
- Fonte: `SELECT ... FROM subscriptions WHERE status = 'active' AND next_billing_date <= CURRENT_DATE`.  
- Insere em `billing_recurring_jobs` com `subscription_id` do subscription.  
- **Não** lê nem escreve em `customer_invoices`.  
- **Conclusão:** Scheduler não é afetado; continua enfileirando apenas por subscriptions.

**Worker (`processNextBatch`):**  
- Lê jobs de `billing_recurring_jobs` (cada linha tem `subscription_id` não nulo).  
- Para cada job: `getSubscriptionById(job.subscription_id)`; depois bifurca por `subscription.type === 'saas'` ou `'customer'`.  
- **type === 'customer':**  
  - `findCustomerInvoiceBySubscriptionAndPeriod(job.subscription_id, subscription.next_billing_date)` — sempre com `job.subscription_id` (nunca NULL).  
  - Se não existir invoice: `processOneCustomerRenewalJob(job, subscription)` → `createCustomerInvoice({ ..., subscription_id: subscription.id, period_start, period_end, ... })`.  
- **Conclusão:** O worker processa **apenas** jobs com `subscription_id`; esse ID vem sempre do job; nunca processa linhas de `customer_invoices` com `subscription_id` NULL.

**findCustomerInvoiceBySubscriptionAndPeriod:**  
- Assinatura: `(subscriptionId: string, periodStart: string)`.  
- Chamada única: em `processNextBatch`, com `job.subscription_id` e `subscription.next_billing_date`.  
- **Conclusão:** Sempre recebe `subscription_id` não nulo; faturas manuais (subscription_id NULL) nunca são retornadas por essa função (a query é `WHERE subscription_id = $1 AND period_start = $2`).

**Risco de processar faturas manuais por engano:**  
- Não há fluxo que: (1) leia `customer_invoices` com `subscription_id IS NULL`, ou (2) crie job para “fatura manual”.  
- Jobs vêm somente de `subscriptions`; faturas manuais não têm subscription.  
- **Conclusão:** Nenhum fluxo atual pode processar faturas manuais por engano.

---

## 3 — Revisão da camada de serviços (customerInvoiceService)

### 3.1 Tipo e uso atuais

**CreateCustomerInvoiceInput (atual):**  
- `tenant_id`, `client_id`, `subscription_id`, `period_start`, `period_end`, `amount_cents`, `due_date`, `gateway?` — todos obrigatórios exceto gateway.

**Geração de invoice_number:**  
- `generateInvoiceNumber(tenantId: string)`: `CINV-${tenantId.slice(0,8)}-${Date.now().toString(36)}`.  
- Não é globalmente única; não há uso de sequence nem de tabela de controle.

**Suporte a faturas manuais:**  
- INSERT inclui `subscription_id`, `period_start`, `period_end` como valores obrigatórios.  
- Não há parâmetros `origin`, `invoice_type` ou `description`.  
- **Conclusão:** A estrutura atual **não** suporta faturas manuais (subscription_id NULL, origin/invoice_type).

### 3.2 Abordagem recomendada: A ou B?

**Opção A — Criar `createManualCustomerInvoice()`:**  
- Nova função com assinatura específica (tenant_id, client_id, amount_cents, due_date, description?, payment_method?, etc.).  
- INSERT com subscription_id NULL, period_start/period_end NULL, origin = 'manual', invoice_type = 'manual'.  
- Geração de invoice_number globalmente única (sequence ou tabela) dentro dessa função (ou helper compartilhado).  
- **Vantagem:** Não altera assinatura nem comportamento de `createCustomerInvoice`; zero risco para o worker.  
- **Desvantagem:** Duplicação de lógica de INSERT e de geração de número se não houver helper.

**Opção B — Estender `createCustomerInvoice()`:**  
- Tornar `subscription_id`, `period_start`, `period_end` opcionais; adicionar `origin?`, `invoice_type?`, `description?`.  
- Regras: se subscription_id presente → recurring; se ausente → manual (e origin/invoice_type obrigatórios para manual).  
- **Vantagem:** Uma única função.  
- **Desvantagem:** Maior chance de erro (caller passar combinação inválida); worker e novo fluxo manual compartilham a mesma porta.

**Recomendação:** **Opção A — criar `createManualCustomerInvoice()`.**  
- Mantém o contrato atual do worker inalterado.  
- Separação clara: recorrência = `createCustomerInvoice`; manual = `createManualCustomerInvoice`.  
- Menor risco de regressão no Billing Engine.

### 3.3 updateCustomerInvoiceStatus

- **Existe hoje?** Não.  
- **updateCustomerInvoiceGatewayData** atualiza: gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key. Não atualiza `status` nem `paid_at`.  
- **Necessidade:** O webhook precisa atualizar status (paid/failed/overdue/refunded) e paid_at ao processar eventos de `customer_invoices`.  
- **Conclusão:** É necessário **criar** uma função do tipo `updateCustomerInvoiceStatus(invoiceId, status, paidAt?, asaasStatus?)` (ou equivalente) e usá-la no `handlePaymentEvent` quando o registro for de `customer_invoices`.

---

## 4 — Análise do webhook

### 4.1 Comportamento atual (asaasService.handlePaymentEvent)

- **Lookup:** Uma única query: `SELECT ... FROM tenant_billing WHERE gateway = 'asaas' AND asaas_payment_id = $1`.  
- Se não encontrar: `return` (nada mais é feito).  
- Se encontrar: atualiza status/paid_at/asaas_status; se evento é “pago”, chama **activatePlanFromBilling(row.id)**.  
- **activatePlanFromBilling** é específica de tenant_billing (ativação de plano do tenant no SaaS).

### 4.2 Adição segura de suporte a customer_invoices

**Regras obrigatórias (confirmadas):**  
1. Buscar **primeiro** em tenant_billing (comportamento atual mantido).  
2. **Se não encontrar** em tenant_billing → buscar em customer_invoices por (gateway, asaas_payment_id).  
3. Se encontrar em customer_invoices: atualizar status, paid_at, asaas_status; **nunca** chamar activatePlanFromBilling.

**Implementação sugerida (lógica, sem código):**  
- Manter o bloco atual que busca em tenant_billing e processa (incluindo activatePlanFromBilling quando pago).  
- Quando `billingRow.rows.length === 0`: executar segunda query em customer_invoices: `SELECT id, tenant_id, status FROM customer_invoices WHERE gateway = 'asaas' AND asaas_payment_id = $1`.  
- Se encontrar: aplicar mesma lógica de eventos (isPaid, isOverdue, etc.) mas chamando `updateCustomerInvoiceStatus` (a criar) em vez de updateInvoiceStatus + activatePlanFromBilling.  
- Se não encontrar em nenhuma tabela: manter o return sem efeito (ou log).

**Conflito com lógica atual:**  
- Não há conflito: um mesmo asaas_payment_id não pode estar ao mesmo tempo em tenant_billing e em customer_invoices (cada cobrança no gateway é de um tipo).  
- Ordem “tenant_billing primeiro, depois customer_invoices” evita qualquer ambiguidade.

---

## 5 — Revisão de segurança multi-tenant

### 5.1 Proteções necessárias

- **Todas as queries de customer_invoices** nos novos endpoints: filtradas por **tenant_id** (valor do tenant autenticado).  
- **Criação (POST):** validar que **client_id** pertence ao tenant (ex.: client existe e, via clients.user_id → users.tenant_id, é do mesmo tenant).  
- **GET por id / PATCH:** sempre `WHERE id = $1 AND tenant_id = $2` (ou equivalente).

### 5.2 RLS vs aplicação

- **RLS:** Em `57_rls_tenant_isolation.sql` várias tabelas têm RLS com `app_tenant_visible(tenant_id)` (ex.: tenant_billing, clients).  
- **customer_invoices:** Foi criada na migration 70, **depois** da 57; **não** consta em 57 e hoje **não tem RLS**.  
- **Recomendação:** Na migration 71 (ou em migration dedicada), **habilitar RLS em customer_invoices** com política por tenant_id (mesmo padrão de tenant_billing), para que qualquer acesso à tabela (incluindo webhook e workers com conexão que defina app.current_tenant_id quando aplicável) respeite o tenant.  
- **Aplicação:** O projeto usa `app.current_tenant_id` e helpers em `tenantScope.ts` / middleware de auth; os novos endpoints devem usar o tenant_id do contexto e filtrar todas as queries por esse tenant_id.  
- **Conclusão:** Usar **ambos**: RLS em customer_invoices (nova migration) e filtragem explícita por tenant_id na camada de aplicação nos novos endpoints. Validação de tenant nos endpoints: no controller/serviço que expuser listInvoices, getInvoiceById, createManualInvoice e PATCH, garantindo que tenantId venha do auth e que client_id seja validado contra o tenant.

### 5.3 Onde validar

- **POST /api/customer-invoices:** tenant_id do token/sessão; verificar que client_id pertence ao tenant (SELECT 1 FROM clients c JOIN users u ON c.user_id = u.id WHERE c.id = $client_id AND u.tenant_id = $tenant_id).  
- **GET /api/customer-invoices:** WHERE tenant_id = $tenant_id (e filtros opcionais).  
- **GET /api/customer-invoices/:id:** WHERE id = $id AND tenant_id = $tenant_id.  
- **PATCH /api/customer-invoices/:id:** Mesmo WHERE id + tenant_id.  
- **tenantSecurity.ts:** A lista `TENANT_SCOPED_TABLES` **não** inclui `customer_invoices`. Deve ser **adicionada** para que assertTenantScopedQuery alerte em SELECTs em customer_invoices sem filtro de tenant.

---

## 6 — Verificação de performance (índices)

### 6.1 Índices atuais (70)

- tenant_id, client_id, subscription_id, status, due_date — já existem.  
- **Não** existe (gateway, asaas_payment_id).

### 6.2 Uso esperado e índices propostos na auditoria

| Consulta                         | Índice atual / proposto | Suficiente? |
|----------------------------------|-------------------------|-------------|
| Listagem por tenant              | (tenant_id)             | Sim         |
| Listagem mais recentes por tenant (dashboard) | (tenant_id, created_at DESC) | Não existe; **recomendado** — ver 6.3 |
| Listagem por tenant + status     | (tenant_id, status)     | Não existe; recomendado composto ou uso de (tenant_id) + filtro status |
| Listagem por tenant + due_date   | (tenant_id, due_date)   | Não existe; recomendado composto |
| Listagem por client              | (client_id)             | Sim         |
| Lookup webhook                  | (gateway, asaas_payment_id) | **Não existe** — **obrigatório** adicionar |
| Busca por status / due_date      | (status), (due_date)    | Sim para filtros gerais |

### 6.3 Índice para listagem recente no dashboard

O dashboard tende a consultar as faturas mais recentes por tenant com:

```sql
SELECT * FROM customer_invoices
WHERE tenant_id = ?
ORDER BY created_at DESC
LIMIT 50
```

Para manter essa listagem rápida mesmo com muito volume de dados, recomenda-se o índice:

```sql
CREATE INDEX idx_customer_invoices_tenant_created_at
ON customer_invoices (tenant_id, created_at DESC);
```

**Conclusão (seção 6):**  
- Índice **(gateway, asaas_payment_id)** é **obrigatório** para o webhook (previsto na auditoria).  
- Índice **(tenant_id, created_at DESC)** é **recomendado** para a listagem “últimas faturas” do dashboard.  
- Índices compostos **(tenant_id, status)** e **(tenant_id, due_date)** são recomendados para listagens do painel; a auditoria já os cita.  
- A migration 71 deve incluir (gateway, asaas_payment_id) e **idx_customer_invoices_tenant_created_at**; opcionalmente os compostos (tenant_id, status) e (tenant_id, due_date).

---

## 7 — Validação final para implementação

### 7.1 Migrations a criar

- **71_customer_invoices_manual_support.sql** (ou nome equivalente), na ordem segura já descrita na auditoria:  
  - ADD COLUMN origin, invoice_type, description (com DEFAULTs onde NOT NULL).  
  - ALTER COLUMN subscription_id, period_start, period_end DROP NOT NULL.  
  - Ajustar CHECK de status (incluir failed, refunded).  
  - ADD CHECK de origin, invoice_type e consistência (origin = 'subscription' ⇔ subscription_id IS NOT NULL; etc.).  
  - DROP INDEX idx_customer_invoices_subscription_period; CREATE UNIQUE INDEX ... (subscription_id, period_start) WHERE subscription_id IS NOT NULL.  
  - Garantir unicidade de invoice_number (estratégia de desduplicação) e ADD UNIQUE(invoice_number).  
  - CREATE INDEX (gateway, asaas_payment_id) [opcionalmente WHERE gateway IS NOT NULL AND asaas_payment_id IS NOT NULL].  
  - CREATE INDEX **idx_customer_invoices_tenant_created_at** ON customer_invoices (tenant_id, created_at DESC) — para listagem “últimas faturas” do dashboard (WHERE tenant_id = ? ORDER BY created_at DESC LIMIT N).  
  - (Recomendado) Habilitar RLS em customer_invoices com política por tenant_id (padrão app_tenant_visible(tenant_id)).

### 7.2 Serviços a criar

- **customerBillingService** (ou equivalente): createManualInvoice(tenantId, body), listInvoices(tenantId, filters), getInvoiceById(tenantId, id).  
- **updateCustomerInvoiceStatus** em customerInvoiceService (ou módulo usado pelo webhook): assinatura (invoiceId, status, paidAt?, asaasStatus?) para uso no handlePaymentEvent.

### 7.3 Serviços a modificar

- **customerInvoiceService:**  
  - Adicionar **createManualCustomerInvoice** (e, se necessário, helper de geração de invoice_number globalmente única).  
  - Adicionar **updateCustomerInvoiceStatus**.  
  - Manter createCustomerInvoice e findCustomerInvoiceBySubscriptionAndPeriod sem mudança de contrato para o worker.  
- **asaasService:** **handlePaymentEvent** — após não encontrar em tenant_billing, buscar em customer_invoices por (gateway, asaas_payment_id); ao encontrar, atualizar via updateCustomerInvoiceStatus; não chamar activatePlanFromBilling.  
- **tenantSecurity.ts:** Incluir **customer_invoices** em TENANT_SCOPED_TABLES.

### 7.4 Alterações no webhook

- Em handlePaymentEvent: segundo bloco de lookup em customer_invoices (gateway + asaas_payment_id).  
- Tratamento de eventos (paid, overdue, etc.) para customer_invoices usando updateCustomerInvoiceStatus.  
- Nunca chamar activatePlanFromBilling para registros de customer_invoices.

### 7.5 Validações de segurança

- Todos os endpoints de customer-invoices atrás de tenantAuth.  
- POST: validar client_id ∈ tenant (via clients + users).  
- GET listagem e GET/PATCH por id: sempre filtrar por tenant_id do contexto.  
- RLS em customer_invoices na migration 71.

### 7.6 Possíveis riscos

- Duplicidade pré-existente em invoice_number: mitigar com script de desduplicação na migration antes de UNIQUE.  
- Webhook em alta carga: índice (gateway, asaas_payment_id) evita full scan.  
- Esquecimento de filtro tenant_id em novo endpoint: mitigar com RLS + inclusão de customer_invoices em TENANT_SCOPED_TABLES.

### 7.7 Ordem recomendada de implementação

1. Migration 71 (estrutura, índices, RLS, UNIQUE invoice_number com estratégia segura).  
2. customerInvoiceService: createManualCustomerInvoice + geração de invoice_number única + updateCustomerInvoiceStatus.  
3. customerBillingService: createManualInvoice, listInvoices, getInvoiceById (com validação client + tenant).  
4. Integração com gateway em createManualInvoice (getActiveGateway('crm'), ensureCustomerForClient, createCharge, externalReference = tenant_{tenantId}_invoice_{invoiceId}, updateCustomerInvoiceGatewayData).  
5. asaasService.handlePaymentEvent: lookup em customer_invoices e updateCustomerInvoiceStatus; sem activatePlanFromBilling.  
6. Rotas e controller (tenantAuth, validações); adicionar customer_invoices a TENANT_SCOPED_TABLES.

---

## Conclusão

- O plano e a auditoria estão **alinhados ao código real**: estrutura da 70 confirmada; worker e scheduler não tocam em faturas manuais; webhook hoje só tenant_billing; customer_invoices sem RLS e sem UNIQUE em invoice_number.  
- Pontos críticos cobertos: índice único parcial (subscription_id, period_start), estratégia para UNIQUE(invoice_number), nova função createManualCustomerInvoice, updateCustomerInvoiceStatus, extensão do webhook em duas etapas (tenant_billing → customer_invoices), RLS e tenant_id nos novos endpoints.  
- Nenhum fluxo atual processa faturas manuais por engano; a migration pode ser aplicada com segurança seguindo a ordem e a estratégia de desduplicação descritas.

---

**PRONTO PARA IMPLEMENTAÇÃO**
