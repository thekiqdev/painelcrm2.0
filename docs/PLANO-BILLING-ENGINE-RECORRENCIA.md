# Plano técnico: Billing Engine – motor de recorrência universal

**Objetivo:** definir arquitetura e plano de implementação para um **motor de recorrência universal**, reutilizável para (1) cobrança do SaaS (plano do sistema) e (2) cobrança de clientes pelos próprios usuários do CRM no futuro. Recorrência controlada internamente (sem depender de assinaturas do gateway), escalável e com proteção contra drift de data via `billing_anchor_day`.

---

## 1. Diagnóstico da arquitetura atual

### 1.1 Modelo de dados hoje

| Entidade | Uso atual |
|----------|-----------|
| **tenants** | Conta da empresa. Campos: `plan_id`, `plan_period_start`, `plan_period_end`, `activated_billing_id`, `status` (active, trial, suspended, payment_pending). |
| **tenant_billing** | Uma linha por **cobrança avulsa** (fatura). Campos: `tenant_id`, `plan_id`, `billing_interval`, `amount_cents`, `due_date`, `status` (pending, paid, overdue, cancelled), `invoice_number`, `gateway`, `payment_method`, `asaas_payment_id`, `asaas_status`, `idempotency_key`, `users_count`, `source`, `billing_reason` (plan_purchase, plan_upgrade, plan_renewal, manual_charge). **Não existe** vínculo com uma “assinatura” nem `next_billing_date`. |
| **tenant_plan** | Histórico de plano por tenant (auditoria): `tenant_id`, `plan_id`, `starts_at`, `ends_at`. Não é usado para recorrência. |
| **plans** / **plan_interval_prices** | Definição de planos e preços (standard e custom). |

Não existe hoje uma tabela de **assinatura** (subscription). O “estado” da assinatura está implícito em:

- `tenants.plan_id` + `plan_period_start` / `plan_period_end` + `activated_billing_id`
- Sequência de linhas em `tenant_billing` por `tenant_id` (ordenadas por `due_date`/`created_at`).

### 1.2 Fluxo atual (checkout → ativação)

1. **Checkout (plan-purchase)**  
   - Resolve ou cria tenant → chama `subscribePlan(tenantId, planId, billingInterval, …)`.  
   - `subscribePlan`: valida plano, calcula valor, **cria uma única fatura** em `tenant_billing` (sem `subscription_id`), chama gateway (Asaas) `createCharge` (cobrança avulsa), persiste `asaas_payment_id` e retorna URLs/QR PIX.  
   - Não há registro de “próxima data de cobrança”.

2. **Pagamento**  
   - Webhook (ou polling) atualiza `tenant_billing.status` para `paid` e chama `activatePlanFromBilling(billingId)`.  
   - `activatePlanFromBilling`: atualiza `tenants` com `plan_period_start`, `plan_period_end`, `activated_billing_id`, `status = 'active'`, etc.  
   - Período é calculado no backend (`addInterval(now(), billingInterval)`).

3. **Expiração de pendentes**  
   - Script `cancelExpiredBillings.ts` (cron manual): cancela `tenant_billing` com `status = 'pending'` e `created_at` &gt; 48h e reverte tenant para `trial` se estava `payment_pending`.  
   - Não existe job de **geração** de novas faturas.

### 1.3 Gateway (Asaas)

- Cobranças são **avulsas** (payments), não assinaturas do Asaas.  
- Interface `PaymentGateway` já abstrai: `createCharge`, `getPayment`, `ensureCustomer`.  
- Config por contexto: `billingType: 'saas' | 'crm'`, `tenantId` opcional.  
- `payment_customers` guarda `tenant_id` → `gateway_customer_id` (Asaas).  
- Não há uso de “subscription” do Asaas; a recorrência será 100% controlada pelo nosso sistema.

### 1.4 Resumo do diagnóstico

- **Pontos positivos:** gateway abstraído, `tenant_billing` com `billing_reason` (já existe `plan_renewal`), idempotency no createCharge, ativação idempotente.  
- **Problemas para recorrência:**  
  - Não existe entidade “assinatura” (subscription) com `next_billing_date`.  
  - Nenhum processo cria faturas automaticamente após o primeiro pagamento.  
  - Próximo período é derivável apenas de `tenants.plan_period_end`, mas não há job que use isso para gerar nova fatura.  
  - Risco de duplicidade se um cron “ingênuo” rodar sobre todos os tenants sem idempotência por período.  
- **Escalabilidade:** hoje só existe um script de cancelamento (cron); não há fila, workers nem processamento em batch com lock.

---

## 2. Problemas da abordagem atual (resumidos)

1. **Sem modelo de assinatura**  
   Não há tabela que represente “esta conta tem um plano recorrente com próxima data de cobrança X”.

2. **Sem automação de renovação**  
   Nada gera a próxima fatura quando `plan_period_end` se aproxima ou quando “deveria” cobrar de novo.

3. **Sem proteção contra duplicidade**  
   Qualquer job que crie faturas recorrentes precisa de regra explícita: “no máximo uma fatura por assinatura por período”.

4. **Cron único e bloqueante**  
   Um cron que percorra todos os tenants/assinaturas pode travar e não escala (milhares de tenants).

5. **Cancelamento e mudança de plano**  
   Não há fluxo explícito de “cancelar assinatura” ou “trocar plano” com impacto em próximas cobranças.

6. **Fase futura (faturas do CRM)**  
   O mesmo conceito (recorrência controlada por nós) precisará servir tanto **SaaS (cobrança do tenant)** quanto **cliente do tenant cobrando seus clientes**; a modelagem deve separar contexto (billing_type / subscription_type) desde já.

---

## 3. Arquitetura ideal do Billing Engine (modelo universal)

### 3.1 Princípios

- **Recorrência controlada pelo nosso sistema:** não usar “subscription” do Asaas; nosso backend decide quando criar a próxima fatura e chama `createCharge` (cobrança avulsa) no gateway.  
- **Motor universal:** uma única estrutura de assinaturas (`subscriptions`) com campo `type` ('saas' | 'customer') define o contexto; o mesmo fluxo (Subscription → Job → Invoice → Gateway) serve aos dois casos.  
- **Worker agnóstico:** o worker não precisa saber “quem” está sendo cobrado; ele carrega a assinatura e decide o comportamento com base em `subscription.type` (criar em `tenant_billing` vs `customer_invoices`).  
- **Idempotência:** uma fatura por assinatura por período; chave de idempotência no gateway por subscription + período.  
- **Anchor day (drift):** campo `billing_anchor_day` (1–31) para manter a cobrança sempre no mesmo dia do mês (ex.: assinou dia 17 → cobrança sempre no dia 17).  
- **Escalável:** jobs em batch com **FOR UPDATE SKIP LOCKED**; múltiplos workers em paralelo; sem cron que percorra todo o conjunto de assinaturas de forma bloqueante.

### 3.2 Fluxo conceitual do motor

```
Subscription (type: saas | customer)
        ↓
Recurring Job (billing_recurring_jobs)
        ↓
Worker (load subscription → create invoice by type → call gateway)
        ↓
Invoice (tenant_billing ou customer_invoices)
        ↓
Payment Gateway (Asaas / futuro outro)
```

O worker recebe apenas o **job** (subscription_id); ao carregar a assinatura obtém:

- `billing_context` = subscription.type (saas | customer)  
- `amount` (e/ou plan_id para recalcular no caso SaaS)  
- `customer_reference` = tenant_id (SaaS) ou customer_id/lead_id (customer) para resolver o “cliente” no gateway  

Não precisa de lógica duplicada por tipo no scheduler: o scheduler só insere jobs para assinaturas com `next_billing_date <= hoje`; o worker trata o resto por `type`.

### 3.3 Comportamento do worker por tipo (switch no processamento)

No momento da execução do job, o worker faz:

1. Carregar assinatura por `subscription_id`.  
2. **switch (subscription.type):**

   - **Se `saas`:**
     - Criar registro em **tenant_billing** (subscription_id, tenant_id, plan_id, amount, billing_reason = plan_renewal, etc.).  
     - Após pagamento (webhook): ativar ou manter plano do tenant; associar ao tenant (já existente em activatePlanFromBilling).  
   - **Se `customer` (fase futura):**
     - Criar registro em **customer_invoices** (subscription_id, tenant_id, customer_id, amount, etc.).  
     - Associar ao cliente do CRM (lead/client do tenant); gateway usa config do tenant para cobrança CRM.

3. Chamar gateway com `customer_reference` e `idempotency_key` derivados da assinatura e do período.  
4. Atualizar assinatura: `next_billing_date` (respeitando `billing_anchor_day`), `current_period_start/end` quando aplicável.

Assim o Billing Engine é totalmente genérico e reutilizável; apenas o destino da fatura e a resolução do “cliente” no gateway mudam por tipo.

---

## 4. Estrutura de tabelas necessárias

### 4.1 Tabela única: assinaturas (universal)

Nome: **`subscriptions`**. Uma tabela para todos os contextos de recorrência; o campo **`type`** define o uso ('saas' | 'customer').

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| **type** | TEXT NOT NULL | **'saas'** \| **'customer'** — contexto da cobrança |
| tenant_id | UUID NOT NULL FK → tenants(id) | Sempre presente: no saas é o assinante; no customer é o dono do CRM |
| customer_id | UUID NULL | NULL para saas. Para customer: lead/client do CRM sendo cobrado |
| plan_id | UUID NULL FK → plans(id) | Preenchido para saas. NULL para customer |
| amount_cents | INT NOT NULL CHECK (amount_cents >= 0) | Valor da cobrança recorrente (persistido para consistência); CHECK evita bugs de valor negativo. |
| **currency** | TEXT NOT NULL DEFAULT 'BRL' | Moeda da cobrança; prepara o sistema para múltiplas moedas no futuro (ex.: tenant BRL, USD, EUR para relatórios). |
| billing_interval | TEXT NOT NULL | monthly, quarterly, semi_annual, yearly |
| **billing_anchor_day** | SMALLINT NULL CHECK (billing_anchor_day BETWEEN 1 AND 31) | Dia do mês (1–31) para cobrança fixa; evita drift (ex.: assinou dia 17 → sempre dia 17). NULL = usar next_billing_date literal. CHECK evita dados inválidos. Regra para meses com menos dias: ver cálculo abaixo. |
| **billing_cycle_count** | INT DEFAULT 0 | Incrementado a cada renovação; permite analytics de churn, métricas de revenue e histórico de ciclos de cobrança. |
| status | TEXT NOT NULL | **active**, **cancelled**, **past_due**, **trialing**, **paused**. paused = suspender temporariamente e reativar depois sem cancelar. |
| next_billing_date | DATE NOT NULL | Próxima data em que deve ser gerada uma fatura |
| current_period_start | DATE | Início do período atual |
| current_period_end | DATE | Fim do período atual |
| **grace_period_days** | INT DEFAULT 3 | Dias após o vencimento em que a conta permanece ativa antes da suspensão (ex.: vencimento dia 10, grace 3 → suspensão dia 13). Usado por job futuro de inadimplência. Configurável no painel (Configurações → Pagamentos). |
| default_payment_method | TEXT | PIX, BOLETO, CREDIT_CARD |
| users_count | INT NULL | Para plano custom (saas); NULL para customer |
| gateway | TEXT | asaas, etc. |
| cancel_at_period_end | BOOLEAN DEFAULT false | |
| cancelled_at | TIMESTAMPTZ | |
| **metadata** | JSONB | Metadados flexíveis (origem da venda, UTM, migração, integrações). Padrão Stripe/Paddle/Chargebee. |
| **created_by** | TEXT NULL | Origem da criação: **checkout**, **admin**, **api**, **migration**. Ajuda em suporte e auditoria (além de metadata). |
| **last_job_at** | TIMESTAMPTZ NULL | Atualizado pelo worker quando processa um job dessa assinatura. Observabilidade: detectar assinaturas travadas, métricas, debugging (ex.: next_billing_date = 2026-04-10, last_job_at = 2026-04-10 00:02). |
| created_at, updated_at | TIMESTAMPTZ | |

**Resumo dos campos de controle e extensibilidade:** currency (moeda), billing_cycle_count (ciclos já faturados), grace_period_days (tolerância pós-vencimento), metadata (dados adicionais sem alterar schema).

**Exemplos:** SaaS: type=saas, tenant_id=t1, customer_id=null, plan_id=plan_pro, amount_cents=9900. Cliente CRM (futuro): type=customer, tenant_id=t1, customer_id=lead_45, plan_id=null, amount_cents=5000. Exemplo metadata: `{"created_by": "checkout", "utm_source": "google", "sales_rep": "john"}`.

Índices sugeridos:

- **(status, next_billing_date) WHERE status = 'active'** — índice **parcial** para o scheduler (`WHERE status = 'active' AND next_billing_date <= CURRENT_DATE`); muito mais rápido que índice completo.
- **(tenant_id, currency)** — relatórios por tenant e moeda (ex.: tenant com BRL, USD, EUR no futuro).
- (type, tenant_id) — listagens por contexto.
- UNIQUE (tenant_id) WHERE type = 'saas' AND status = 'active'. **billing_anchor_day** evita drift (cobrança sempre no mesmo dia do mês).

**Cálculo de next_billing_date com billing_anchor_day (meses com menos dias):**  
Regra alinhada a Stripe, Chargebee e Recurly: `next_day = MIN(anchor_day, last_day_of_month)`. Exemplo com anchor = 31: jan → 31, fev → 28, mar → 31, abr → 30. Assim evita-se datas inválidas em fevereiro ou meses de 30 dias.

### 4.2 Evolução de `tenant_billing` (invoices)

- Adicionar **`subscription_id`** (UUID NULL, FK → **subscriptions(id)** ON DELETE SET NULL).  
- **Registro explícito do ciclo de faturamento:** garantir **`period_start`** (DATE) e **`period_end`** (DATE) em toda fatura gerada pelo Billing Engine (ex.: sub_1 → 2026-01-17 a 2026-02-17; próxima 2026-02-17 a 2026-03-17). Permite auditoria financeira, MRR, prorations e histórico claro de ciclos.  
- **Snapshot do plano na fatura:** além de `plan_id` e `amount_cents`, salvar **`plan_name_snapshot`** (TEXT) e **`plan_price_snapshot`** (INT, centavos no momento da emissão). Planos mudam; sem snapshot o histórico se perde. Stripe faz isso.  
- **Idempotência por ciclo:** constraint **UNIQUE(subscription_id, period_start)** WHERE subscription_id IS NOT NULL — uma assinatura nunca gera duas faturas para o mesmo ciclo (modelo Stripe, Chargebee, Recurly).  
- Faturas antigas (plan_purchase sem recorrência) continuam com `subscription_id = NULL` (fora da constraint).  
- Faturas geradas pelo Billing Engine: subscription_id, period_start, period_end, plan_name_snapshot, plan_price_snapshot, billing_reason = 'plan_renewal' (ou plan_upgrade).

Não é obrigatório criar tabela `invoices` genérica agora; `tenant_billing` atua como “invoices do SaaS”.

### 4.3 Tabela de jobs de recorrência

Nome sugerido: **`billing_recurring_jobs`** (ou `billing_jobs`).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| subscription_id | UUID NOT NULL FK → **subscriptions(id)** | Assinatura a processar (genérica; worker descobre type ao carregar) |
| **tenant_id** | UUID NOT NULL FK → tenants(id) | Redundante com subscription, mas permite observabilidade, métricas, debugging e rate limiting por tenant **sem JOIN**. Deve ser preenchido ao criar o job (copiar da subscription). |
| **job_type** | TEXT NOT NULL | Valores documentados: **renewal** (padrão), **retry_payment**, **cancel_subscription**, **sync_gateway**, **send_invoice_email**. Evita bagunça futura; usar apenas estes valores. |
| **cycle_key** | TEXT NOT NULL | Identificador único do ciclo (ex.: next_billing_date em formato fixo, ex. '2026-01-17'). Usado para UNIQUE(subscription_id, cycle_key) e evitar duplicar job do mesmo ciclo. Substitui a dependência de UNIQUE(subscription_id, scheduled_at). |
| scheduled_at | TIMESTAMPTZ NOT NULL | Quando o job foi agendado (ex.: next_billing_date 00:00) |
| **retry_at** | TIMESTAMPTZ NULL | Quando o job poderá ser reprocessado após falha; NULL = processar na data agendada. Controla retry sem criar novos jobs. |
| status | TEXT NOT NULL | pending, processing, completed, failed, cancelled |
| locked_at | TIMESTAMPTZ | Quando um worker pegou o job (lock) |
| locked_by | TEXT | Identificador do worker (hostname, worker_id) |
| result_invoice_id | UUID NULL | Fatura criada: para saas = tenant_billing.id; para customer = customer_invoices.id (futuro). Não é FK única pois aponta para tabelas diferentes conforme type. |
| result_invoice_type | TEXT NULL | 'tenant_billing' \| 'customer_invoice' — qual tabela contém result_invoice_id (opcional; relatórios). |
| error_message | TEXT | Em caso de falha |
| attempts | INT DEFAULT 0 | Tentativas |
| max_attempts | INT DEFAULT 3 | Retry |
| created_at, updated_at | TIMESTAMPTZ | |

**Controle de retry:** o worker processa jobs com `WHERE status = 'pending' AND scheduled_at <= now() AND (retry_at IS NULL OR retry_at <= now())`. Em falha, em vez de criar novo job: incrementar attempts, definir **retry_at** (ex.: +1h, +24h, +72h) e manter status pending; na próxima execução o job será reprocessado quando retry_at <= now(). Estratégia sugerida: T0 tentativa inicial; retry +1h; +24h; +72h.

Índices:

- **(status, scheduled_at, retry_at)** — cobre a query do worker (`status = 'pending'`, `scheduled_at <= now()`, `retry_at IS NULL OR retry_at <= now()`); incluir **retry_at** evita full scan.
- (subscription_id, cycle_key) — índice para UNIQUE(subscription_id, cycle_key); um job por ciclo por assinatura.
- (tenant_id) — métricas e rate limiting por tenant sem JOIN.

Constraint / regra de negócio: não criar segundo job `pending` para a mesma `subscription_id` com o mesmo “ciclo” (ex.: mesmo `next_billing_date` ou mesma janela de período). Isso pode ser garantido por UNIQUE(subscription_id, cycle_key) com status pending, ou por checagem no código antes do INSERT.

### 4.4 Tabelas futuras (customer)

- **customer_invoices:** faturas recorrentes dos tenants para seus clientes (CRM). Não criar na Fase 1; subscriptions com type=customer já preparam o motor.

Não criar agora; apenas garantir que o desenho do Billing Engine (serviço que “gera próxima fatura para uma assinatura”) seja reutilizável.

### 4.5 Ajustes recomendados (integrados)

Estas práticas aumentam confiabilidade, escalabilidade e auditabilidade sem alterar a arquitetura principal:

- **Ciclo explícito em faturas:** `period_start` e `period_end` em `tenant_billing` + **UNIQUE(subscription_id, period_start)** — evita duplicidade, permite MRR, prorations e auditoria (Stripe, Chargebee, Recurly).
- **Retry sem novos jobs:** campo **retry_at** em `billing_recurring_jobs`; worker filtra `(retry_at IS NULL OR retry_at <= now())`; em falha, definir retry_at (+1h, +24h, +72h) no mesmo job em vez de criar outro.
- **Extensibilidade:** **metadata** JSONB em `subscriptions` para origem da venda, UTM, migração, integrações (Stripe, Paddle, Chargebee).

### 4.6 Tabela opcional: `billing_events` (nível Stripe)

Melhoria opcional para auditoria, debugging e analytics. Não obrigatória na Fase 1.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| subscription_id | UUID NULL FK → subscriptions(id) | Assinatura relacionada; NULL se evento global |
| event_type | TEXT NOT NULL | **subscription_created**, **invoice_generated**, **payment_succeeded**, **payment_failed**, **subscription_cancelled** |
| payload | JSONB | Dados do evento (ids, valores, motivo de falha, etc.) |
| created_at | TIMESTAMPTZ | |

**Benefícios:** auditoria financeira completa, debugging de cobranças, analytics, webhook interno, histórico completo. Stripe usa exatamente esse padrão. Pode ser implementada em fase posterior (ex.: Fase 3 ou 4).

### 4.7 Tabela opcional: `subscription_periods` (nível Stripe)

Melhoria arquitetural opcional: histórico perfeito de ciclos por assinatura. Não obrigatória na Fase 1.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| subscription_id | UUID NOT NULL FK → subscriptions(id) | |
| period_start | DATE NOT NULL | |
| period_end | DATE NOT NULL | |
| invoice_id | UUID NULL | tenant_billing.id ou customer_invoices.id conforme type |
| status | TEXT | active, paid, cancelled, etc. |

**Benefício:** um registro por ciclo; Stripe faz isso internamente. Facilita relatórios e auditoria de períodos. Pode ser implementada em fase posterior.

---

## 5. Fluxo de recorrência

### Resultado da arquitetura (visão geral)

Fluxo equivalente ao desenho aprovado:

```
Subscriptions
    ↓
Scheduler (WHERE status = 'active' AND next_billing_date <= CURRENT_DATE, LIMIT 500)
    ↓
billing_recurring_jobs
    ↓
Workers (validar status + next_billing_date <= today → create invoice → invoice_number → save → gateway → save payment_id → last_job_at)
    ↓
Invoices (tenant_billing / customer_invoices)
    ↓
Payment Gateway
```

### 5.1 Criação da assinatura (no primeiro pagamento)

- No fluxo atual, após `activatePlanFromBilling(billingId)`:
  - Inserir em **subscriptions**: type=saas, tenant_id, plan_id, amount_cents, **currency** (ex. 'BRL'), billing_interval, status=active, next_billing_date (ex.: plan_period_end ou primeiro dia do próximo período), **billing_anchor_day** = dia do mês da primeira cobrança (ex.: 17 se assinou dia 17), billing_cycle_count=0, current_period_start/end, **grace_period_days** (ex. 3 ou valor das configurações do sistema), default_payment_method, users_count, gateway, **created_by** = 'checkout' (ou 'admin'/'api'/'migration' conforme origem).
  - Opcional: atualizar a fatura que ativou com `subscription_id` (para rastreio).
- Manter criação de fatura avulsa no checkout como está; após ativação, criamos o registro em **subscriptions** e a recorrência passa a ser responsabilidade do Billing Engine.

### 5.2 Scheduler (cron leve, ex.: a cada 5–15 minutos)

- **Consulta limitada:**  
  `SELECT * FROM subscriptions WHERE status = 'active' AND next_billing_date <= CURRENT_DATE ORDER BY next_billing_date LIMIT 500`.  
  Usar **CURRENT_DATE** (truncation por dia), não `NOW()`, para evitar: mudança de timezone do servidor, interferência da hora do dia, execução duplicada no mesmo dia. Roda sempre por dia; comportamento alinhado ao Stripe. Processar no máximo **500** assinaturas por execução; na próxima rodada as demais serão incluídas.
- Para cada linha retornada (e, se usar cancel_at_period_end, considerar current_period_end). **Não filtra por type:** saas e customer usam a mesma tabela.
- Para cada uma:
  - Definir **cycle_key** (ex.: `next_billing_date::text` ou formato fixo tipo 'YYYY-MM-DD' para o ciclo).
  - Verificar se já existe job em **billing_recurring_jobs** com essa `subscription_id` e **cycle_key** e status `pending` ou `processing`. Se existir, não criar outro (a constraint UNIQUE(subscription_id, cycle_key) também impede duplicata).
  - Inserir em **billing_recurring_jobs**: subscription_id, **tenant_id** (copiar da subscription), **job_type = 'renewal'**, **cycle_key**, scheduled_at = next_billing_date (ou now()), status = pending.
- **Não** processar cobrança aqui; apenas enfileirar jobs. Assim o cron termina rápido e não trava.

### 5.3 Worker(s)

- Rodar em um ou mais processos (ou mesmo no mesmo app, em thread/worker separado).
- Loop (ou pull periódico):
  - `SELECT id, subscription_id, ... FROM billing_recurring_jobs WHERE status = 'pending' AND scheduled_at <= now() AND (retry_at IS NULL OR retry_at <= now()) ORDER BY scheduled_at ASC LIMIT 100 FOR UPDATE SKIP LOCKED`. O **LIMIT fixo por batch** (ex.: 100) evita que um único tenant com milhares de jobs monopolize o worker. O filtro **retry_at** garante que jobs em retry só sejam processados na hora agendada (ex.: +1h, +24h, +72h após falha), sem criar novos jobs.
  - Para cada linha: marcar como `processing`, `locked_at = now()`, `locked_by = worker_id`.
  - Para cada job:
    1. Carregar **subscription** por subscription_id.
    2. **Validação anti–cobrança indevida (obrigatória):** antes de gerar invoice, o worker **sempre** deve validar:
       - Se **subscription.status != 'active'** → marcar job como **cancelled** (não gerar fatura). Ex.: cliente cancelou após o scheduler ter criado o job; o job já existe e seria executado — sem essa checagem haveria cobrança indevida.
       - Se **cancel_at_period_end = true** e **now() > current_period_end** → marcar job como **cancelled** (assinatura já terminou).
       - **Proteção extra (recomendada, Stripe faz isso):** se **subscription.next_billing_date > CURRENT_DATE** → pular/cancelar job (evita race condition, scheduler duplicado, retry indevido; cobrança só no dia correto).
       - Só prosseguir para gerar invoice se status = active, next_billing_date <= CURRENT_DATE, e (não cancel_at_period_end OU now() <= current_period_end). Fluxo seguro: load subscription → if status != active → cancelar job; if next_billing_date > today → cancelar job; if cancel_at_period_end AND now > current_period_end → cancelar job; senão → gerar invoice.
    3. **switch (subscription.type):** se **saas:** criar fatura em **tenant_billing** com **period_start**, **period_end**, **plan_name_snapshot**, **plan_price_snapshot** (nome e preço do plano no momento da emissão), subscription_id, tenant_id, plan_id, amount, billing_reason = plan_renewal. Se **customer (futuro):** criar fatura em **customer_invoices** com período e subscription_id.
    4. **Idempotência:** a constraint **UNIQUE(subscription_id, period_start)** em tenant_billing (onde subscription_id IS NOT NULL) impede duplicidade; antes de criar, checar se já existe fatura para essa subscription_id e period_start. Se existir, marcar job completed/skipped, atualizar next_billing_date e seguir.
    5. Calcular valor: saas pode usar billingService.calculateInvoiceAmount(plan_id, billing_interval, users_count); customer usa subscription.amount_cents.
    6. **Gerar invoice_number** (ex.: invoiceService.generateInvoiceNumber), atribuir à fatura e **persistir a fatura** (save) **antes** de chamar o gateway. Assim a fatura existe e tem número mesmo se a chamada ao gateway falhar; evita fatura sem número ou inconsistência.
    7. Chamar gateway com customer_reference (tenant_id para saas; customer/lead no CRM para customer) e idempotency_key = f(subscription_id, period_start).
    8. Atualizar fatura com **gateway payment_id** (e demais dados retornados); persistir.
    9. Atualizar **subscriptions**: next_billing_date = próximo período (regra **MIN(anchor_day, last_day_of_month)** quando billing_anchor_day definido; ex. anchor 31 → fev=28, abr=30), current_period_start/end = novo período, **billing_cycle_count = billing_cycle_count + 1**, **last_job_at = now()** (observabilidade: detectar travamentos, métricas, debugging).
    10. Marcar job como completed, result_invoice_id e result_invoice_type.
  - Em falha: incrementar attempts; definir **retry_at** (ex.: now() + 1h, +24h, +72h conforme política) e manter status = pending, para o mesmo job ser reprocessado na próxima execução do worker; não criar novo job. Se attempts >= max_attempts, marcar failed e registrar error_message; opcional: notificar ou marcar assinatura como past_due.

### 5.4 Webhook / confirmação de pagamento

- Fluxo atual permanece: webhook (ou polling) atualiza `tenant_billing.status = paid` e chama `activatePlanFromBilling(billingId)`.
- Para faturas com `subscription_id` preenchido, `activatePlanFromBilling` pode apenas atualizar período do tenant (e, se necessário, sincronizar current_period da assinatura); não precisa criar nova assinatura, pois ela já existe.

### 5.5 Cancelamento e pausa de assinatura

- **Pausa (status = paused):** suspender temporariamente sem cancelar; o scheduler **não** gera jobs para status = 'paused'. Reativar depois alterando para status = 'active'.
- **Cancelamento:** endpoint ou ação: “cancelar assinatura”.
  - Se cancel_at_period_end = true: marcar assinatura como “a cancelar no fim do período”; o scheduler não gera novo job após current_period_end; ao fim, status = cancelled.
  - Se cancelamento imediato: status = cancelled, cancelled_at = now(); scheduler ignora; opcionalmente reverter tenant para trial/suspended e plan_period_end para now().

### 5.6 Mudança de plano

- Novo endpoint ou fluxo: “upgrade/downgrade”.
  - Pode gerar fatura de diferença (proportional) ou apenas alterar plan_id e billing_interval na assinatura e recalcular next_billing_date e valor da próxima fatura. A definição exata (cobrar agora vs. na próxima data) é regra de negócio; o Billing Engine só precisa de “atualizar **subscriptions** e, se houver cobrança imediata, criar uma fatura com billing_reason = plan_upgrade”.

---

## 6. Estratégia de workers / filas

### 6.1 Opções consideradas

| Abordagem | Prós | Contras |
|-----------|-----|--------|
| **Cron único que processa tudo** | Simples | Trava com muitos tenants; não escala; risco de duplicidade se rodar em paralelo. |
| **Cron + tabela de jobs (DB)** | Sem infra extra; transacional; FOR UPDATE SKIP LOCKED evita dois workers pegarem o mesmo job. | Workers precisam de processo separado ou script agendado; throughput limitado pelo DB. |
| **Fila em Redis (Bull/BullMQ)** | Alta vazão; retry e backoff maduros. | Nova dependência (Redis); operação e deploy. |
| **PG-based queue (pg-boss, graphile-worker)** | Tudo no Postgres; boa para volume médio. | Mais uma lib e schema. |

### 6.2 Recomendação para Fase 1

- **Scheduler:** cron (ou node-cron dentro do app) a cada 5–15 min que apenas **insere** linhas em **billing_recurring_jobs** para assinaturas com next_billing_date &lt;= hoje, respeitando a regra de “não duplicar job do mesmo ciclo”.
- **Worker:** busca jobs com `WHERE status = 'pending' AND scheduled_at <= now() ORDER BY scheduled_at ASC **LIMIT 100** FOR UPDATE SKIP LOCKED`. O **LIMIT por batch** evita que um tenant com milhares de jobs monopolize o worker; vários workers processam o restante em paralelo.
- **Escalabilidade:** batches de 50–200 jobs; 1 worker ≈ 200 jobs/min, 5 workers ≈ 1000/min, 20 workers ≈ 4000/min **50k–100k subscriptions sem Redis**. Mais que suficiente para a maioria dos SaaS. **LIMIT 100** por batch recomendado. Migração futura para Redis/Bull sem mudar a lógica de negócio (apenas trocar “inserir em billing_recurring_jobs” por “enfileirar no Bull” e “worker lê da fila” em vez de SELECT na tabela).

### 6.3 Retry

- Campo `attempts` e `max_attempts` em billing_recurring_jobs.
- Em falha (gateway, timeout, etc.): attempts++; se attempts &lt; max_attempts, voltar status para pending (e opcionalmente scheduled_at = now() + backoff). Se attempts >= max_attempts, status = failed e notificar ou marcar assinatura como past_due.

---

## 7. Plano de implementação em etapas

### Fase 1 – Fundação (esta tarefa)

1. **Migration: tabela subscriptions** (universal: type, tenant_id, customer_id, plan_id, amount_cents, billing_anchor_day, next_billing_date, etc.) com índices (status, next_billing_date), (type, tenant_id), UNIQUE para saas ativo.  
2. **Migration: tenant_billing.subscription_id** (nullable FK → subscriptions(id)).  
3. **Migration: tabela billing_recurring_jobs** (subscription_id → subscriptions, result_invoice_id, result_invoice_type) com índice (status, scheduled_at) e FOR UPDATE SKIP LOCKED.  
4. **Serviço billingSubscriptionService (ou em subscriptionService):** criar assinatura ao ativar plano: após `activatePlanFromBilling`, inserir em **subscriptions** (type=saas, billing_anchor_day, etc.) e setar subscription_id na fatura.  
5. **Serviço recurringBillingJobService:** inserir jobs (scheduler); processar job (load subscription → switch(type) → create invoice → gateway → update subscription; next_billing_date respeitando billing_anchor_day). Idempotência por subscription + período.  
6. **Script/cron scheduler:** a cada 10–15 min (inserir jobs).  
7. **Script/worker:** loop ou cron 1–2 min; SELECT ... FOR UPDATE SKIP LOCKED; processar em batch (50–200 jobs).  
8. **activatePlanFromBilling:** criar registro em **subscriptions** e setar subscription_id na fatura ativada.

### Fase 2 – Cancelamento e mudança de plano

9. Endpoint PATCH/DELETE para cancelar assinatura (cancel_at_period_end ou imediato).  
10. Endpoint ou fluxo para mudança de plano (upgrade/downgrade) e atualização de **subscriptions**.

### Fase 3 – Operacional e observabilidade

11. Logs estruturados e métricas (jobs processados, falhas, atrasos).  
12. Tela ou relatório no Super Admin: assinaturas ativas, próximas cobranças, jobs failed.  
13. (Opcional) Notificações (e-mail) para falha de cobrança ou assinatura past_due.  
14. **Configurações de cobrança no painel:** em **Configurações → Pagamentos → Configurações avançadas de cobrança**, permitir configurar: **dias de tolerância para suspensão de plano** (grace_period_days, usado pela assinatura e por job futuro de inadimplência), habilitar/desabilitar suspensão automática, métodos de pagamento aceitos, regras de retry de cobrança. O valor de grace_period_days poderá ser lido pelo sistema (default por assinatura ou global) para o job que aplica suspensão após o grace period.

### Fase 4 – Faturas recorrentes dos clientes do SaaS (futuro)

15. Tabela customer_invoices (tenant_id, customer_id, subscription_id, etc.); não criar na Fase 1.  
16. Worker já faz switch(type); ao implementar customer_invoices, criará faturas nessa tabela quando type=customer.

---

## 8. Migrations necessárias

1. **67_subscriptions.sql**  
   - CREATE TABLE **subscriptions** (id, **type** ('saas'|'customer'), tenant_id, customer_id NULL, plan_id NULL, **amount_cents** INT NOT NULL CHECK (amount_cents >= 0), **currency** TEXT NOT NULL DEFAULT 'BRL', **billing_anchor_day** SMALLINT NULL CHECK (billing_anchor_day BETWEEN 1 AND 31), **billing_cycle_count** INT DEFAULT 0, billing_interval, status ('active'|'cancelled'|'past_due'|'trialing'|'paused'), next_billing_date, current_period_start, current_period_end, **grace_period_days** INT DEFAULT 3, default_payment_method, users_count, gateway, cancel_at_period_end, cancelled_at, **metadata** JSONB, **created_by** TEXT NULL, **last_job_at** TIMESTAMPTZ NULL, created_at, updated_at). **last_job_at**: atualizado pelo worker; observabilidade e debugging.  
   - Índices: **(status, next_billing_date) WHERE status = 'active'** (parcial, para scheduler); **(tenant_id, currency)** (relatórios multi-moeda); (type, tenant_id); UNIQUE(tenant_id) WHERE type='saas' AND status='active'.

2. **68_tenant_billing_subscription_id.sql**  
   - ALTER TABLE tenant_billing ADD COLUMN subscription_id UUID NULL REFERENCES **subscriptions(id)** ON DELETE SET NULL;  
   - Garantir colunas **period_start** DATE e **period_end** DATE (adicionar se não existirem).  
   - Adicionar **plan_name_snapshot** TEXT e **plan_price_snapshot** INT NULL (snapshot do plano na emissão; planos mudam, histórico preservado — Stripe).  
   - Constraint **UNIQUE(subscription_id, period_start)** WHERE subscription_id IS NOT NULL (idempotência por ciclo).  
   - CREATE INDEX idx_tenant_billing_subscription_id ON tenant_billing(subscription_id) WHERE subscription_id IS NOT NULL.

3. **69_billing_recurring_jobs.sql**  
   - CREATE TABLE billing_recurring_jobs (id, subscription_id FK → **subscriptions(id)**, **tenant_id** UUID NOT NULL FK → tenants(id), **job_type** TEXT NOT NULL DEFAULT 'renewal', **cycle_key** TEXT NOT NULL, scheduled_at, **retry_at** TIMESTAMPTZ NULL, status, locked_at, locked_by, result_invoice_id, **result_invoice_type** ('tenant_billing'|'customer_invoice'), error_message, attempts, max_attempts, created_at, updated_at). **cycle_key**: identificador do ciclo (ex.: 'YYYY-MM-DD'); **UNIQUE(subscription_id, cycle_key)**. **tenant_id** para observabilidade/métricas/rate limit sem JOIN. **job_type** valores: renewal, retry_payment, cancel_subscription, sync_gateway, send_invoice_email. retry_at: quando reprocessar após falha.  
   - Índice **(status, scheduled_at, retry_at)** para a query do worker (evita full scan em retry_at).  
   - Índice (tenant_id). UNIQUE(subscription_id, cycle_key).

4. **(Opcional, fase posterior) 70_billing_events.sql**  
   - CREATE TABLE billing_events (id UUID PK, subscription_id UUID NULL FK → subscriptions(id), event_type TEXT NOT NULL, payload JSONB, created_at TIMESTAMPTZ). Tipos: subscription_created, invoice_generated, payment_succeeded, payment_failed, subscription_cancelled. Para auditoria, debugging e analytics (padrão Stripe).

5. **(Opcional, fase posterior) 71_subscription_periods.sql**  
   - CREATE TABLE subscription_periods (id UUID PK, subscription_id UUID NOT NULL FK → subscriptions(id), period_start DATE NOT NULL, period_end DATE NOT NULL, invoice_id UUID NULL, status TEXT). Histórico perfeito de ciclos; Stripe faz isso internamente. Não obrigatório na Fase 1.

---

## 9. Serviços a criar ou estender

| Serviço | Responsabilidade |
|---------|------------------|
| **billingSubscriptionService** (ou em subscriptionService) | Criar/atualizar/cancelar **subscriptions** (genérico por type); ler next_billing_date e período; atualizar após renovação (respeitando billing_anchor_day). |
| **recurringBillingJobService** | Inserir jobs (scheduler); processar job: load subscription → **switch(type)** → create invoice (tenant_billing ou customer_invoices) → gateway → update subscription; idempotência por subscription + período. |
| **subscriptionService** (existente) | Manter subscribePlan, activatePlanFromBilling; após activatePlanFromBilling, chamar criação de **subscriptions** (type=saas) e setar subscription_id na fatura. |
| **invoiceService** (existente) | createInvoice deve aceitar subscription_id; generateInvoiceNumber e createInvoice continuam como estão. |
| **billingService** (existente) | calculateInvoiceAmount, validatePlanForPurchase; reutilizados pelo worker. |

Não é obrigatório criar “BillingEngine” como classe única; pode ser um conjunto de funções em recurringBillingJobService + billingSubscriptionService que orquestram “gerar próxima fatura para uma assinatura”.

---

## 10. Garantir que o sistema não gere cobranças duplicadas

1. **Um job por ciclo por assinatura**  
   Antes de inserir em billing_recurring_jobs, verificar se já existe job (pending/processing) para a mesma subscription_id e para o mesmo “ciclo” (ex.: scheduled_at = next_billing_date da assinatura). Usar **cycle_key** e constraint **UNIQUE(subscription_id, cycle_key)**; a constraint impede duplicata no INSERT.

2. **Registro explícito do ciclo e idempotência na fatura**  
   Toda fatura gerada pelo Billing Engine deve ter **period_start** e **period_end** preenchidos. Constraint **UNIQUE(subscription_id, period_start)** WHERE subscription_id IS NOT NULL em tenant_billing garante que uma assinatura nunca gere duas faturas para o mesmo ciclo (modelo Stripe, Chargebee, Recurly). Dentro do worker, antes de criar a fatura: checar se já existe linha com subscription_id e period_start do ciclo; se existir, marcar job completed/skipped e atualizar next_billing_date da assinatura.

3. **Idempotência no gateway**  
   Usar idempotency_key no createCharge: por exemplo `saas_renew_${subscriptionId}_${periodStart}` (ou next_billing_date), para que o Asaas não crie dois pagamentos para o mesmo ciclo.

4. **Lock no job**  
   SELECT FOR UPDATE SKIP LOCKED garante que apenas um worker processa um dado job; evitar reprocessamento paralelo do mesmo registro.

5. **Transação**  
   O processamento do job (criar fatura, atualizar assinatura, atualizar job) deve rodar em transação para que falha após createCharge não deixe assinatura e job inconsistentes; em caso de rollback, o job pode ser reprocessado (e a checagem de fatura existente + idempotency_key no gateway evitam cobrança duplicada).

6. **Evitar cobrança após cancelamento e proteção por data**  
   Antes de gerar invoice, o worker **sempre** deve validar: **subscription.status = 'active'**; **subscription.next_billing_date <= CURRENT_DATE** (evita race condition, scheduler duplicado, retry indevido; Stripe faz isso); e, se cancel_at_period_end, que **now() <= current_period_end**. Se a assinatura foi cancelada, a data de cobrança ainda não chegou ou o período já acabou, marcar o job como **cancelled** e não gerar fatura. Ver fluxo no item 5.3.

---

## Resumo executivo

- **Hoje:** só existe cobrança avulsa no checkout; não há assinatura nem job de recorrência.  
- **Objetivo:** Billing Engine **universal** com tabela única **subscriptions** (type=saas|customer), **billing_anchor_day** contra drift, workers agnósticos (switch por type), processamento em batch com **FOR UPDATE SKIP LOCKED** (escala: 1 worker ≈ 200 jobs/min; 5 workers ≈ 1000/min; suporte a 50k–100k subscriptions). Compatível com Asaas e preparado para faturas recorrentes dos clientes do CRM (customer_invoices no futuro).  
- **Próximo passo:** aprovar este plano e implementar Fase 1 (migrations 67–69 para **subscriptions** e billing_recurring_jobs, criação de assinatura na ativação, scheduler + worker + serviços descritos).

Este documento serve como **plano técnico completo** para aprovação antes de escrever código.

---

## Checklist de implantação por fases

Marque com OK ao concluir cada item. Cada fase inicia com **OK** e o número da fase.

### Fase 1 – Fundação

- OK 1. Migration 67_subscriptions.sql (tabela subscriptions com type, tenant_id, amount_cents, currency, billing_anchor_day, status, created_by, last_job_at, índices parciais e UNIQUE).
- OK 1. Migration 68_tenant_billing_subscription_id.sql (subscription_id, period_start, period_end, plan_name_snapshot, plan_price_snapshot, UNIQUE(subscription_id, period_start)).
- OK 1. Migration 69_billing_recurring_jobs.sql (subscription_id, tenant_id, job_type, cycle_key, scheduled_at, retry_at, UNIQUE(subscription_id, cycle_key), índices).
- OK 1. Serviço billingSubscriptionService (ou em subscriptionService): criar assinatura ao ativar plano; inserir em subscriptions com created_by; setar subscription_id na fatura.
- OK 1. Serviço recurringBillingJobService: inserir jobs (scheduler com LIMIT 500); processar job (load subscription → validar status/cancel_at_period_end → create invoice → generate invoice_number → save invoice → call gateway → save gateway payment_id → update subscription).
- OK 1. Script/cron scheduler: a cada 10–15 min; SELECT ... WHERE status='active' AND next_billing_date <= CURRENT_DATE ORDER BY next_billing_date LIMIT 500 (uso de CURRENT_DATE, não NOW(), para evitar timezone/hora/duplicação); para cada uma, cycle_key e INSERT em billing_recurring_jobs (sem duplicar por cycle_key).
- OK 1. Script/worker: SELECT jobs FOR UPDATE SKIP LOCKED LIMIT 100; para cada job: validar subscription ativa e next_billing_date <= CURRENT_DATE (proteção extra), criar fatura, gerar invoice_number, persistir fatura, chamar gateway, persistir payment_id, atualizar subscription (incl. last_job_at) e job.
- OK 1. activatePlanFromBilling: criar registro em subscriptions (created_by) e setar subscription_id na fatura ativada.

### Fase 2 – Cancelamento e mudança de plano

- OK 2. Endpoint PATCH/DELETE para cancelar assinatura (cancel_at_period_end ou imediato).
- OK 2. Endpoint ou fluxo para mudança de plano (upgrade/downgrade) e atualização de subscriptions.

### Fase 3 – Operacional e observabilidade

- OK 3. Logs estruturados e métricas (jobs processados, falhas, atrasos).
- OK 3. Tela ou relatório no Super Admin: assinaturas ativas, próximas cobranças, jobs failed.
- OK 3. (Opcional) Notificações (e-mail) para falha de cobrança ou assinatura past_due.
- OK 3. Configurações de cobrança no painel (Configurações → Pagamentos → Configurações avançadas): grace_period_days, suspensão automática, métodos de pagamento, regras de retry.

### Fase 4 – Faturas recorrentes dos clientes do SaaS (futuro)

- OK 4. Tabela customer_invoices (tenant_id, customer_id, subscription_id, etc.).
- OK 4. Worker switch(type=customer): criar faturas em customer_invoices.

### Opcionais (fase posterior)

- OK — Migration 70_billing_events.sql (auditoria/analytics).
- OK — Migration 71_subscription_periods.sql (histórico de ciclos).
