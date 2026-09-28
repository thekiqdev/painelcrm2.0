# Plano de Integração Asaas

Documento de arquitetura para integração com o [Asaas](https://www.asaas.com/) (gateway de pagamento). **Não implementar ainda** — apenas planejamento.

---

## Escopo da primeira versão (v1)

Nesta primeira versão a implementação se restringe a **cobrança avulsa** e **confirmação de pagamento**. A arquitetura permanece preparada para evoluir depois.

### Dentro do escopo v1

1. **Criação de customer** — garantir cliente no Asaas para o tenant (createCustomer / getCustomer).
2. **Criação de cobrança** — uma cobrança por vez (boleto, PIX ou cartão), sem recorrência.
3. **Webhook de pagamento** — receber eventos do Asaas, idempotência e retry (payload_hash, status, attempts).
4. **Ativação do plano no tenant** — ao confirmar pagamento: atualizar `tenants.plan_id` e `tenants.status` (ex.: active).
5. **Registro em tenant_billing** — cada cobrança criada e cada atualização de status (pago, vencido, etc.) refletidos em `tenant_billing`.

### Fora do escopo v1 (futuro)

- **Subscription** — assinaturas recorrentes no Asaas; não implementar na v1.
- **Billing recorrente** — geração automática de cobranças mensais/anuais; não implementar na v1.
- **Histórico de planos (tenant_plan)** — não inserir em `tenant_plan` na v1; a tabela pode existir no banco para uso futuro. A ativação do plano limita-se a atualizar `tenants.plan_id` e `tenants.status`.

A arquitetura (PaymentGateway, gatewayProvider, módulo Asaas, tenant_billing com period_start/period_end, etc.) segue desenhada para que, no futuro, seja possível adicionar subscription, recorrência e histórico em `tenant_plan` sem quebrar o que já existir.

---

## Objetivos da integração

1. **Ativar planos automaticamente após pagamento** — quando o webhook indicar pagamento confirmado, atualizar plano/status do tenant (v1: apenas `tenants.plan_id` e `tenants.status`).
2. **Criar clientes no Asaas** — sincronizar tenant como Customer no Asaas para gerar cobranças.
3. **Gerar cobranças** — criar cobranças avulsas (boleto, PIX, cartão) vinculadas ao tenant/plano (v1: sem subscription/recorrência).
4. **Receber webhooks de pagamento** — processar eventos (PAYMENT_RECEIVED, PAYMENT_CONFIRMED, etc.) de forma segura e idempotente.
5. **Permitir cobrança dentro das tenants no futuro** — módulo desenhado para ser reutilizável; v1 foca em SaaS Billing (cobrança de tenants); futuramente CRM Billing (cobrar clientes do CRM), subscription e recorrência.

---

## Regras de arquitetura

- **Toda comunicação com o Asaas deve passar por um único módulo:** `src/modules/asaas` (caminho relativo ao backend, ex.: `packages/backend/src/modules/asaas`).
- **Nenhum controller ou service pode chamar a API do Asaas diretamente.** Controllers/services usam apenas o módulo Asaas (ex.: `asaasService`).
- O módulo deve ser **reutilizável** por todo o sistema (super admin, rotas do tenant, futuros fluxos por tenant).
- O módulo **não depende diretamente** de tabelas de domínio como `tenant_billing` ou de invoices do CRM; serviços como `tenantBillingService` e `invoiceService` usam o gateway via **gatewayProvider** e persistem em suas próprias tabelas. Ver seção *Configuração do Gateway e Uso no Sistema*.

---

## Interface PaymentGateway e gatewayProvider

Para permitir trocar Asaas por Stripe, PagarMe, etc. no futuro **sem alterar** os serviços que criam cobranças, o sistema usa uma abstração de gateway e um provedor que resolve o gateway ativo.

### Interface genérica PaymentGateway

Definida em `src/modules/payments` (ou em tipos compartilhados), a interface que todo gateway de pagamento deve implementar:

```ts
interface PaymentGateway {
  createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult>;
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;
  getPayment(paymentId: string): Promise<PaymentResult | null>;
}
```

- **CreateCustomerInput / CreateCustomerResult** — DTOs genéricos (nome, documento, email, etc.; ID do customer no gateway).
- **CreateChargeInput / CreateChargeResult** — DTOs genéricos (customerId, valor, vencimento, método de pagamento; IDs e links retornados).
- **PaymentResult** — status e dados do pagamento para consulta e reconciliação.

O **módulo Asaas** implementa essa interface (ex.: `AsaasGateway` ou adapter que delega para o asaasService interno). Assim, `tenantBillingService` e `invoiceService` dependem apenas de `PaymentGateway` e recebem a implementação via **gatewayProvider**.

### gatewayProvider

**Arquivo:** `src/modules/payments/gatewayProvider.ts`

Responsabilidade: **resolver o gateway de pagamento ativo** do sistema (ou do tenant, quando houver config por tenant).

- Função ex.: `getActiveGateway(context?: { tenantId?: string }): Promise<PaymentGateway | null>`.
- Lê a configuração global (tabela `payment_gateways` ou `system_settings`) para saber qual gateway está ativo (ex.: `asaas`, `stripe`). Se houver configuração por tenant (CRM Billing), pode receber `tenantId` e retornar o gateway configurado para aquele tenant.
- Retorna a instância que implementa `PaymentGateway` (ex.: adapter do Asaas). No futuro, pode retornar Stripe, PagarMe, etc., sem alterar quem chama.

Serviços como `tenantBillingService` e `invoiceService` usam:

```ts
const gateway = await gatewayProvider.getActiveGateway();
if (!gateway) throw new Error('Nenhum gateway de pagamento ativo');
await gateway.createCharge(input);
```

Assim, a troca de Asaas por outro gateway implica apenas registrar nova implementação no provider e configurá-la como ativa; os serviços permanecem inalterados.

---

## 1) Arquitetura do módulo Asaas

Estrutura proposta (subpastas para organizar client, mappers, services e webhooks):

```
packages/backend/src/modules/asaas/
  client/              # Cliente HTTP Asaas
    asaasClient.ts     # Chamadas à API (customers, payments), config base URL / API key — uso interno
  mappers/             # Mapeamento domínio <-> Asaas
    asaasMapper.ts     # tenant/cobrança -> payloads Asaas; response Asaas -> DTOs internos
  services/            # Orquestração
    asaasService.ts    # Implementa PaymentGateway; usa client + mapper; createCustomer, createCharge, getPayment, handlePaymentEvent
  webhooks/            # Recepção de webhooks
    asaasWebhook.ts    # Validação e roteamento do POST; chama asaasService
  asaasTypes.ts        # Tipos/interfaces (request/response Asaas, DTOs internos)
  asaasEvents.ts       # Enum tipado dos eventos do Asaas (PAYMENT_RECEIVED, etc.)
  index.ts             # API pública: exporta implementação de PaymentGateway (asaasService), webhook handler, tipos/eventos; NÃO exporta client nem mappers
```

### Responsabilidades por arquivo / pasta

| Arquivo / Pasta | Responsabilidade |
|-----------------|------------------|
| **asaasTypes.ts** | Tipos TypeScript: `AsaasCustomer`, `AsaasPayment`, DTOs de entrada/saída (ex.: `CreateChargeInput`, `ChargeResult`). Não contém lógica. |
| **asaasEvents.ts** | Enum (ou union type) tipado com todos os eventos de webhook do Asaas. Usado por webhooks e services para identificar eventos. |
| **client/asaasClient.ts** | Configuração (base URL, API key), `fetch`/axios para Asaas: `createCustomer()`, `getCustomer()`, `createPayment()`, `getPayment()`. Uso interno; **não exportado pelo index**. |
| **mappers/asaasMapper.ts** | Funções puras: mapeamento domínio ↔ payloads Asaas. Uso interno; **não exportado pelo index**. |
| **services/asaasService.ts** | **Implementa a interface `PaymentGateway`.** Orquestração: createCustomer, createCharge, getPayment; handlePaymentEvent para webhook. Usa client + mapper. Chamado por gatewayProvider (como implementação ativa) ou diretamente pelo webhook. |
| **webhooks/asaasWebhook.ts** | Recebe POST do Asaas, valida assinatura, parseia evento (asaasEvents), chama asaasService. Retry via status/attempts/last_error e payload_hash. |
| **index.ts** | **API pública.** Exporta: implementação de PaymentGateway (asaasService), webhook handler, tipos e asaasEvents. **Não exporta** client nem mappers. |

### Fluxo de dependências

```
tenantBillingService / invoiceService
       |
       v
  gatewayProvider.getActiveGateway()  ──> retorna PaymentGateway (ex.: Asaas)
       |
       v
  asaasService (implementa PaymentGateway)  <----  asaasWebhook (POST /webhooks/asaas)
       |
       +---> client/asaasClient (HTTP)
       +---> mappers/asaasMapper
       +---> DB (apenas tabelas do módulo ou delegado ao caller)
```

Nenhum controller ou service de negócio chama o client ou mappers do Asaas diretamente; usam o gateway via **gatewayProvider** (ou o asaasService como PaymentGateway).

### Variáveis de ambiente

- `ASAAS_API_KEY` — chave da API (sandbox ou produção).
- `ASAAS_ENV` ou `ASAAS_BASE_URL` — `sandbox` | `production` ou URL completa (ex.: `https://api-sandbox.asaas.com/v3`).
- Opcional: `ASAAS_WEBHOOK_SECRET` ou token para validar origem do webhook (se suportado pelo Asaas).

---

## 2) Fluxo de criação de cobrança

**v1:** cobrança avulsa (uma por vez); sem subscription nem recorrência.

1. **Entrada:** controller (ou job) decide criar cobrança para um `tenant_id` + `plan_id` + valor/vencimento (e opcionalmente idempotency key).
2. **Serviço:** `asaasService.createCharge({ tenantId, planId, amountCents, dueDate, paymentMethod?, idempotencyKey?, billingId? })`.
3. **Resolução do cliente Asaas:**
   - Buscar no banco se o tenant já tem `asaas_customer_id` (tabela `tenants` ou tabela de vínculo `tenant_asaas_customer`).
   - Se não tiver: chamar `asaasClient.createCustomer(mapper.tenantToAsaasCustomer(tenant))`, persistir `asaas_customer_id` no tenant (ou tabela de vínculo).
   - Se já tiver: opcionalmente garantir que dados do cliente no Asaas estão atualizados (sync ou skip).
4. **Idempotência:** verificar se já existe cobrança para o par (tenant_id, billing_id ou idempotencyKey). Se existir e estiver em estado “criada no Asaas”, retornar cobrança existente (sem chamar API de novo). Ver seção 6.
5. **Criar cobrança no Asaas:** `asaasClient.createPayment(mapper.planAndBillingToAsaasPayment(...))` com `customer` = asaas_customer_id, valor, vencimento, etc.
6. **Persistir localmente:** o caller (ex.: tenantBillingService) insere/atualiza em `tenant_billing` com `gateway = 'asaas'`, **`payment_method`** (PIX, BOLETO ou CREDIT_CARD), `asaas_payment_id`, `asaas_status` “pending”. Na v1, `period_start`/`period_end` podem ser NULL (cobrança avulsa).
7. **Retorno:** DTO com `billingId`, `asaasPaymentId`, `status`, `invoiceUrl` ou `bankSlipUrl`/`pixQrCode` conforme tipo, para o front exibir link ou QR.

---

## 3) Fluxo de webhook de pagamento

1. **Endpoint:** `POST /api/webhooks/asaas` (ou path configurável) — **não** protegido por JWT; protegido por validação de origem/assinatura (header ou body) se o Asaas fornecer.
2. **asaasWebhook (handler):**
   - Ler body JSON.
   - Validar assinatura/token se configurado.
   - Identificar tipo de evento (ex.: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`).
   - Obter `payment.id` (e demais dados) do payload.
3. **Idempotência e retry:** usar tabela `asaas_webhook_events` com `status`, `attempts`, `last_error`, **`payload_hash`**. Se evento já existir com status `processed`, ou se o `payload_hash` do body já existir (event replay), responder 200 e não reprocessar. Se status `failed` e `attempts` abaixo do limite, permitir reprocessamento (job de retry). Ver seção 5.3.
4. **Resolução interna:** por `payment.id` (Asaas), buscar em `tenant_billing` (filtro por `gateway = 'asaas'`) o registro com `asaas_payment_id` = id do pagamento; obter `tenant_id`, `plan_id`, `billing_id`.
5. **Delegação ao service:** `asaasService.handlePaymentEvent({ eventType, asaasPaymentId, payload })`:
   - Atualizar status em `tenant_billing` (paid, overdue, refunded, etc.) e `paid_at` se aplicável.
   - Para evento “pago/confirmado”: disparar fluxo de ativação de plano (seção 4).
6. **Resposta:** sempre `200 OK` em tempo curto; processamento pesado pode ser em background (fila ou então await, conforme política de timeout do Asaas).

---

## 4) Fluxo de ativação de plano

1. **Gatilho:** chamado a partir do webhook quando o evento for “pagamento recebido/confirmado” (ex.: `PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED`), após atualizar `tenant_billing`.
2. **Serviço:** `asaasService.activatePlanForTenant({ tenantId, planId, billingId })` (ou equivalente dentro de `handlePaymentEvent`):
   - Validar que o pagamento está realmente confirmado e que o `tenant_id` e `plan_id` batem com o billing.
   - **v1:** Atualizar `tenants.plan_id` para o plano pago e `tenants.status` (ex.: `active`). Nada mais.
   - **Futuro:** Inserir registro em `tenant_plan` (histórico: `tenant_id`, `plan_id`, `starts_at`, `ends_at`); subscription/recorrência; opcional email de confirmação.
3. **Conflitos:** se o tenant já tiver sido ativado para a mesma cobrança (por retry do webhook), a idempotência (evento já processado) evita aplicar duas vezes.

---

## 5) Estrutura de banco necessária

### 5.1 Vínculo Tenant ↔ Cliente Asaas

- **Opção A (coluna em tenants):**  
  `tenants.asaas_customer_id TEXT UNIQUE` (ID do customer no Asaas).  
  Simples; suficiente se um tenant = um cliente Asaas.

- **Opção B (tabela dedicada):**  
  `tenant_asaas_customers (id, tenant_id, asaas_customer_id, created_at)` com UNIQUE(tenant_id) ou permitir múltiplos por tenant no futuro.  
  Permite histórico ou mais de um “cliente” por tenant se a regra de negócio evoluir.

**Recomendação inicial:** Opção A; migração para B se no futuro precisar de múltiplos clientes Asaas por tenant.

### 5.2 Cobranças e vínculo com Asaas

- **Opção A (estender tenant_billing):**  
  Adicionar em `tenant_billing`:  
  `gateway TEXT NOT NULL DEFAULT 'asaas'` (permite múltiplos gateways; ex.: 'asaas', 'stripe'),  
  `payment_method TEXT` — valores possíveis: `'PIX'`, `'BOLETO'`, `'CREDIT_CARD'` (forma de pagamento da cobrança),  
  `asaas_payment_id TEXT` (UNIQUE quando gateway = 'asaas'),  
  `asaas_status TEXT` (espelho do status no Asaas),  
  `idempotency_key TEXT UNIQUE` (opcional),  
  `period_start DATE`,  
  `period_end DATE` (opcional na v1; futuro: billing mensal/anual e período de cobertura).  
  Assim cada linha de `tenant_billing` pode ser ligada a uma cobrança de um gateway; `payment_method` indica PIX, boleto ou cartão. Na **v1** as cobranças são avulsas; `period_start`/`period_end` podem ficar NULL ou preenchidos apenas para referência.

- **Opção B (tabela separada):**  
  `tenant_billing_asaas (id, tenant_billing_id, ...)`.  
  Mantém tenant_billing “agnóstico” ao gateway.

**Recomendação:** Opção A (colunas em `tenant_billing`) para menos joins; `gateway` permite evoluir para outros gateways sem nova tabela; índice em `(gateway, asaas_payment_id)` para webhook lookup quando gateway = 'asaas'.

### 5.3 Idempotência e retry de webhooks

- **Tabela:** `asaas_webhook_events`  
  Campos:  
  `id UUID PRIMARY KEY`,  
  `event_id TEXT NOT NULL UNIQUE` (identificador único do evento no Asaas),  
  `event_type TEXT NOT NULL`,  
  `payment_id TEXT` (Asaas),  
  `payload_hash TEXT` (hash do payload recebido — ex.: SHA-256 do body JSON — para evitar duplicação em caso de **event replay**: se o mesmo payload for reenviado, detectar pelo hash e não processar de novo),  
  `status TEXT NOT NULL DEFAULT 'pending'` — `pending` | `processed` | `failed`,  
  `attempts INT NOT NULL DEFAULT 0`,  
  `last_error TEXT` (mensagem do último erro, para debug e retry),  
  `processed_at TIMESTAMPTZ` (preenchido quando status = processed).  

- **Estratégia de retry e replay:**  
  - Ao receber o webhook: calcular `payload_hash` do body; inserir ou atualizar registro com `event_id`. Se já existir com `status = 'processed'`, responder 200 e não reprocessar. Se existir registro com mesmo `payload_hash` (replay), responder 200 e não reprocessar.  
  - Se o processamento falhar: atualizar `status = 'failed'`, incrementar `attempts`, gravar `last_error`. Responder 200 para o Asaas e tratar retry internamente.  
  - Job de retry: buscar eventos com `status = 'failed'` e `attempts < N`; reprocessar e atualizar status/attempts/last_error. Após N tentativas, manter como failed para análise manual.
  - Objetivo: não processar o mesmo evento duas vezes com sucesso; evitar duplicação em event replay usando `payload_hash`.

### 5.4 Resumo das alterações de banco

| Item | Ação |
|------|------|
| tenants | Adicionar `asaas_customer_id TEXT UNIQUE` (e índice). |
| tenant_billing | Adicionar `gateway TEXT NOT NULL DEFAULT 'asaas'`; **`payment_method TEXT`** (PIX, BOLETO, CREDIT_CARD); `asaas_payment_id TEXT`; `asaas_status TEXT`; opcional `idempotency_key TEXT UNIQUE`; `period_start DATE`; `period_end DATE` (opcional na v1, podem ser NULL). Índice em `(gateway, asaas_payment_id)` para lookup no webhook. |
| asaas_webhook_events | Nova tabela: id, event_id UNIQUE, event_type, payment_id, **payload_hash TEXT** (evitar replay), status, attempts, last_error, processed_at. Suporte a idempotência, retry e detecção de replay. |

Scripts de migração em `database/init/` ou em migrations versionadas, conforme padrão do projeto.

---

## 6) Como evitar duplicação de cobrança (idempotência)

1. **Chave de idempotência por cobrança:**  
   O caller (controller/job) envia `idempotencyKey` (ex.: `tenant_id + plan_id + due_date` ou UUID gerado no front).  
   Antes de chamar `asaasClient.createPayment()`:
   - Buscar `tenant_billing` por `idempotency_key = key`.
   - Se existir e já tiver `asaas_payment_id`, retornar esse registro (e links) sem criar nova cobrança no Asaas.
   - Se não existir, criar cobrança, persistir com `idempotency_key` e `asaas_payment_id`.

2. **Não reutilizar mesma chave para valores/vencimentos diferentes:**  
   A idempotency key deve representar “esta intenção de cobrança única”. Ex.: `tenant:{id}:plan:{id}:due:{date}` ou hash disso.

3. **Webhook:**  
   Idempotência por evento (tabela `asaas_webhook_events`) e por **payload_hash** (hash do body) evita aplicar duas vezes o mesmo evento e detecta **event replay** (reenvio do mesmo payload).

4. **Criar cliente no Asaas:**  
   Antes de criar customer, verificar se `tenants.asaas_customer_id` já está preenchido; se sim, usar esse ID em vez de criar outro cliente.

---

## 7) Relacionamento: users, tenants, pagamentos, planos

### Modelo conceitual

- **users** — pertencem a um **tenant** (`users.tenant_id`).
- **tenants** — têm um **plan_id** vigente e um **asaas_customer_id** (quando integrados).
- **tenant_billing** — cobranças por tenant; cada linha tem **gateway**, **payment_method** (PIX, BOLETO, CREDIT_CARD), **plan_id**, **period_start**/**period_end** (opcional na v1), **asaas_payment_id** quando gateway Asaas, status, valor, vencimento. Na v1: uma cobrança avulsa por vez; no futuro: mensal/anual/recorrente.
- **tenant_plan** — (fora do escopo v1) histórico de planos por tenant (starts_at, ends_at); usado para auditoria e recorrência no futuro. Na v1 a ativação apenas atualiza `tenants.plan_id` e `tenants.status`.
- **plans** — definem preço, intervalo, limites (max_users, etc.); referenciados por `tenants.plan_id` e por `tenant_billing.plan_id`.

### Quem paga

- No modelo atual (B2B do painel): o **tenant** é a unidade de cobrança. O “cliente” no Asaas é o tenant (empresa). Dados do cliente Asaas podem vir do tenant (nome, documento, email do responsável) ou do primeiro usuário do tenant (primary user).
- **users** não são criados como clientes no Asaas neste fluxo; o pagamento está atrelado ao **tenant**. Opcionalmente, o email/CPJ do responsável pelo tenant pode ser usado no Customer do Asaas.

### Fluxo resumido

1. **Tenant** é criado (cadastro) com um **plan_id** (ex.: trial ou free).  
2. Quando for cobrar (v1: cobrança avulsa): **asaasService** garante **Customer** no Asaas para o tenant (1:1).  
3. **Cobrança** é criada no Asaas vinculada a esse Customer e registrada em **tenant_billing** com **asaas_payment_id**.  
4. **Webhook** de pagamento atualiza **tenant_billing** (status, paid_at) e dispara **ativação de plano**: atualiza **tenants.plan_id** e **tenants.status** (v1; no futuro também insere em **tenant_plan**).  
5. **Users** do tenant passam a usufruir dos limites do novo plano (já resolvidos via `tenants.plan_id` e serviços de limite).

### Diagrama de relações (resumo)

```
plans (id, name, price_cents, ...)
  ^
  | plan_id
  |
tenants (id, name, plan_id, asaas_customer_id, status, ...)
  ^
  | tenant_id
  |
users (id, tenant_id, ...)

tenant_billing (id, tenant_id, plan_id, gateway, payment_method, amount_cents, due_date, period_start, period_end, status, asaas_payment_id, ...)
  |
  +---> asaas_webhook_events (event_id, payment_id, payload_hash, status, attempts, last_error, ...)

(v1: ativação de plano apenas atualiza tenants.plan_id e tenants.status; tenant_plan fica para versão futura)
```

---

## Configuração do Gateway e Uso no Sistema

Dois níveis de uso do módulo Asaas: **configuração global** (Super Admin) e **uso dentro do tenant** (empresa). O módulo `src/modules/asaas` **implementa a interface PaymentGateway** e permanece **genérico e reutilizável**: não depende diretamente de `tenant_billing` nem de modelos de domínio do SaaS ou do CRM. Serviços de negócio (`tenantBillingService`, `invoiceService`) obtêm o gateway via **gatewayProvider.getActiveGateway()** e chamam `gateway.createCustomer` / `gateway.createCharge`; são responsáveis por persistir em suas próprias tabelas.

---

### 1) Configuração global (Super Admin)

**Menu:** Admin → Configurações → Pagamentos → Asaas

O Super Admin configura o gateway Asaas em nível de sistema (uma única conta Asaas para cobrança dos tenants do SaaS).

**Campos / responsabilidades:**

| Configuração | Descrição |
|--------------|-----------|
| **ASAAS_API_KEY** | Chave de API (sandbox ou produção). Armazenada de forma segura (criptografada ou em vault). |
| **Ambiente** | `sandbox` ou `produção` — define a base URL e o contexto das cobranças. |
| **Webhook** | URL do webhook (ex.: `https://api.seudominio.com/api/webhooks/asaas`), opcionalmente token/secret para validar origem. |
| **Ativar gateway** | Flag para habilitar ou desabilitar o uso do Asaas no sistema (ex.: desligar em manutenção). |

**Persistência:** tabela global do sistema, por exemplo:

- **payment_gateways** — ex.: `id`, `gateway_key` ('asaas'), `is_enabled`, `config` (JSON: api_key_encrypted, environment, webhook_url, webhook_secret), `created_at`, `updated_at`; ou
- **system_settings** — chave/valor com prefixo `payment.asaas.*` (ex.: `payment.asaas.enabled`, `payment.asaas.environment`, `payment.asaas.api_key_encrypted`).

O módulo Asaas **lê** essa configuração (via serviço de settings ou repositório) para obter API key e ambiente; não gerencia a UI de Admin.

---

### 2) Uso dentro do tenant (empresa)

**Menu sugerido:** Configurações → Pagamentos → Asaas

Dentro do tenant (empresa), o usuário pode **usar** o módulo Asaas para gerar cobranças para **seus clientes** (CRM Billing — ex.: faturas para clientes do CRM, contratos, propostas).

- A empresa pode ter sua **própria conta Asaas** (configurada no tenant) ou, em um modelo alternativo, o sistema usar a conta global com identificação por tenant.
- O plano deve prever: configuração por tenant (API key do Asaas da empresa) armazenada em tabela tipo `tenant_settings` ou `tenant_payment_config` (tenant_id, gateway_key, config, is_enabled).

**Fluxo:** na tela Configurações → Pagamentos → Asaas do tenant, o usuário informa (se aplicável) a chave Asaas da empresa e ativa o gateway. Ao gerar cobrança para um cliente do CRM, o **invoiceService** obtém o gateway via **gatewayProvider** e chama `gateway.createCharge(...)` (e, se necessário, `gateway.createCustomer(...)`), passando os DTOs (dados do “cliente” e da cobrança); o módulo Asaas não conhece `tenant_billing` nem tabelas de invoices do CRM — apenas cria customer/cobrança no Asaas e retorna o resultado. O **invoiceService** persiste o vínculo na sua própria tabela (ex.: invoices, client_charges).

---

### Módulo genérico: quem persiste o quê

**Importante:** o módulo `src/modules/asaas` **não deve depender diretamente** de `tenant_billing`, `invoices` ou de qualquer tabela de domínio. Ele oferece:

- **Entrada:** DTOs (ex.: dados do “cliente” para criar no Asaas, dados da cobrança).
- **Saída:** resultado da API (IDs Asaas, links de pagamento, status).

**Serviços que usam o gateway:**

| Serviço | Uso | Persistência |
|---------|-----|--------------|
| **tenantBillingService** | Cobrança de **tenants** (SaaS Billing): plano, mensalidade, etc. | Obtém gateway via **gatewayProvider.getActiveGateway()** (ex.: Asaas); chama `gateway.createCharge(...)`; cria/atualiza `tenant_billing` com `asaas_payment_id`, `gateway`, `payment_method`, etc. |
| **invoiceService** (ou equivalente) | Cobrança de **clientes do CRM** (CRM Billing): faturas para clientes da empresa. | Obtém gateway via **gatewayProvider** (global ou por tenant); chama `gateway.createCharge(...)`; persiste em tabelas de faturas do tenant (ex.: `invoices`, `client_charges`). |

Assim, os serviços dependem apenas da interface **PaymentGateway** e do **gatewayProvider**; a implementação (Asaas, Stripe, etc.) pode ser trocada sem alterar tenantBillingService ou invoiceService.

---

### Diagrama: SaaS Billing e CRM Billing

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    CONFIGURAÇÃO GLOBAL                   │
                    │  Admin → Configurações → Pagamentos → Asaas               │
                    │  (payment_gateways / system_settings)                    │
                    │  API Key, Ambiente, Webhook, Ativar gateway              │
                    └─────────────────────────────────────────────────────────┘
                                                        │
                    ┌───────────────────────────────────┼───────────────────────────────────┐
                    │                                   ▼                                   │
                    │  ┌─────────────────────────────┐     ┌─────────────────────────────┐  │
                    │  │ src/modules/payments/       │     │ src/modules/asaas/          │  │
                    │  │ gatewayProvider             │────>│ (implementa PaymentGateway) │  │
                    │  │ getActiveGateway()          │     │ asaasService                │  │
                    │  └─────────────┬───────────────┘     │ createCustomer, createCharge│  │
                    │                │                     │ getPayment, handlePayment   │  │
                    │                │                     └─────────────┬───────────────┘  │
                    │                │                                   │                  │
                    │         ┌──────┴──────┐                      ┌─────┴─────┐           │
                    │         ▼             ▼                      ▼           ▼           │
                    │  ┌──────────────┐  ┌──────────────┐   SaaS Billing  Webhook Asaas   │
                    │  │ SaaS Billing │  │ CRM Billing  │   CRM Billing   (payload_hash)   │
                    │  │ (tenants)    │  │ (clientes)   │                                  │
                    │  └──────┬───────┘  └──────┬───────┘                                  │
                    │         ▼                 ▼                                           │
                    │  tenantBillingService  invoiceService  gateway.createCharge()        │
                    │         │                 │             asaasService.handlePayment   │
                    │         ▼                 ▼             Event()                      │
                    │  tenant_billing       invoices /       asaas_webhook_events          │
                    │  (gateway,             client_charges                                │
                    │   payment_method, …)                                                   │
                    └─────────────────────────────────────────────────────────────────────┘
```

**Resumo:**

- **SaaS Billing:** Super Admin configura Asaas globalmente; `tenantBillingService` obtém o gateway via **gatewayProvider.getActiveGateway()** e chama `gateway.createCharge(...)`; persiste em `tenant_billing` (com `payment_method`: PIX, BOLETO, CREDIT_CARD).
- **CRM Billing:** Dentro do tenant, Configurações → Pagamentos → Asaas; `invoiceService` usa **gatewayProvider** e `gateway.createCharge(...)`; persiste em tabelas de faturas do tenant.

---

## CHECKLIST DE IMPLEMENTAÇÃO POR FASES

**Escopo v1:** (1) Criação de customer (2) Criação de cobrança avulsa (3) Webhook de pagamento (4) Ativação do plano no tenant (atualizar `tenants.plan_id` e `tenants.status`) (5) Registro em `tenant_billing`. **Fora do escopo v1:** subscription, billing recorrente, inserção em `tenant_plan`.

---

### Fase 1 — Database migrations

- [x] Migração: `tenants.asaas_customer_id TEXT` + índice UNIQUE (WHERE NOT NULL).
- [x] Migração: `tenant_billing` — adicionar `gateway`, `payment_method` (PIX, BOLETO, CREDIT_CARD), `asaas_payment_id`, `asaas_status`, `idempotency_key`, `period_start`, `period_end`; índice UNIQUE em `(gateway, asaas_payment_id)` e em `idempotency_key`.
- [x] Migração: tabela `asaas_webhook_events` (id, event_id UNIQUE, event_type, payment_id, payload_hash, status, attempts, last_error, processed_at, created_at).
- [x] Executar migrações e validar schema.

**Validação Fase 1:** Arquivo `database/init/59_asaas_integration_phase1.sql` criado; registrado em `packages/backend/src/migrate.ts`; migração executada com sucesso.

### Fase 2 — PaymentGateway, gatewayProvider e módulo Asaas (skeleton)

- [x] Definir interface **PaymentGateway** (createCustomer, createCharge, getPayment) e DTOs genéricos em `src/modules/payments` (paymentGatewayTypes.ts).
- [x] Criar **gatewayProvider** em `src/modules/payments/gatewayProvider.ts` (getActiveGateway(); retorna PaymentGateway via import dinâmico do Asaas).
- [x] Criar estrutura de pastas do módulo Asaas: `packages/backend/src/modules/asaas/` com **client/**, **mappers/**, **services/**, **webhooks/**.
- [x] Criar `asaasTypes.ts` e `asaasEvents.ts` na raiz do módulo.
- [x] Criar `client/asaasClient.ts` (stub; não exportado pelo index).
- [x] Criar `mappers/asaasMapper.ts` (stubs; não exportado pelo index).
- [x] Criar `services/asaasService.ts` (implementa PaymentGateway via getAsaasGateway(); stubs createCustomer, createCharge, getPayment, handlePaymentEvent).
- [x] Criar `webhooks/asaasWebhook.ts` (handler stub que responde 200; Fase 5 implementa payload_hash e delega ao service).
- [x] Criar `index.ts` exportando **apenas** API pública: getAsaasGateway, handlePaymentEvent, asaasWebhookHandler, tipos e asaasEvents; **não** exportar client nem mappers.

**Validação Fase 2:** Interface PaymentGateway e DTOs em `modules/payments`; gatewayProvider com getActiveGateway() e import dinâmico do Asaas; módulo Asaas com client, mappers, services, webhooks, asaasTypes, asaasEvents, index; build OK.

### Fase 3 — Customer creation

- [x] Implementar em asaasClient: `createCustomer()`, `getCustomer()` (API v3 Asaas).
- [x] Implementar em asaasMapper: `toAsaasCustomer()`, `tenantToAsaasCustomer()` (tipo TenantForCustomer).
- [x] Implementar em asaasService: “garantir cliente Asaas para tenant” (buscar/crear e persistir `tenants.asaas_customer_id`).
- [ ] Testes manuais ou automatizados: criar/recuperar customer por tenant.

**Validação Fase 3:** asaasClient com createCustomer/getCustomer (base URL por ASAAS_ENV, auth por ASAAS_API_KEY); asaasMapper com toAsaasCustomer e tenantToAsaasCustomer; asaasService com ensureCustomerForTenant e gateway createCustomer; build OK.

### Fase 4 — Charge creation

- [x] Implementar em asaasClient: `createPayment()` e `getPayment()` (API v3 POST/GET /payments).
- [x] Implementar em asaasMapper: `toAsaasPayment(customerId, CreateChargeInput)` (v1: cobrança avulsa; value em reais, billingType, dueDate).
- [x] Implementar em asaasService (PaymentGateway): `createCharge()` (mapper + client); `getPayment()` (client → PaymentResult). Idempotência por idempotencyKey fica com o caller (consultar tenant_billing antes de chamar). Caller usa ensureCustomerForTenant antes e persiste em tenant_billing com gateway, payment_method, asaas_payment_id.
- [x] Retorno CreateChargeResult com paymentId, status, invoiceUrl, bankSlipUrl, pixQrCode/pixCopyPaste quando disponíveis.

**Validação Fase 4:** asaasClient createPayment/getPayment; asaasMapper toAsaasPayment; gateway createCharge e getPayment; build OK.

### Fase 5 — Webhook processing

- [x] Registrar rota `POST /webhooks/asaas` (sem JWT; asaasWebhookRoutes montada em index).
- [x] asaasWebhook: parsear body (event, id, payment.id), calcular payload_hash (SHA-256), inserir/atualizar asaas_webhook_events (event_id, event_type, payment_id, payload_hash, status, attempts, last_error); ignorar replay (payload_hash já existente).
- [x] Idempotência: se event_id já processado (status = processed) ou attempts >= MAX_ATTEMPTS (5), responder 200 e encerrar.
- [x] asaasService.handlePaymentEvent: buscar tenant_billing por gateway='asaas' e asaas_payment_id; atualizar asaas_status, status (paid/overdue) e paid_at; em falha, marcar evento status failed e last_error (resposta 200 para não reenviar em loop).
- [ ] Implementar job ou lógica de retry para eventos com status failed e attempts < N (opcional; eventos podem ser reprocessados manualmente ou por job futuro).

**Validação Fase 5:** POST /webhooks/asaas; asaasWebhookHandler com payload_hash, event_id, idempotência e handlePaymentEvent; build OK.

### Fase 6 — Plan activation (v1: apenas atualizar tenant)

- [x] No handlePaymentEvent, ao receber evento “pago/confirmado”, chamar fluxo de ativação de plano.
- [x] asaasService.activatePlanForTenant(tenantId, planId, billingId): validar billing por id (tenant_id/plan_id batem, status = 'paid'); **v1:** atualizar apenas `tenants.plan_id` e `tenants.status` = 'active'. **Não** inserir em `tenant_plan` na v1.
- [x] Idempotência: repetir a chamada para o mesmo billing deixa o tenant no mesmo estado (UPDATE idempotente); evento webhook já não reprocessa (event_id processed).
- [ ] Opcional: notificação/email de confirmação.

**Validação Fase 6:** handlePaymentEvent chama activatePlanForTenant quando isPaid; activatePlanForTenant valida billing e atualiza tenants; export no index; build OK.

---

## Referências

- [Asaas API v3 – Documentação](https://docs.asaas.com/)
- Autenticação: header `access_token` com API key.
- Base URL sandbox: `https://api-sandbox.asaas.com/v3`; produção: `https://api.asaas.com/v3`.
- Criar cliente: `POST /v3/customers`.
- Criar cobrança: `POST /v3/payments`.
- Webhooks: eventos como `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, etc.

---

*Documento apenas para planejamento. Implementação somente após aprovação deste plano.*
