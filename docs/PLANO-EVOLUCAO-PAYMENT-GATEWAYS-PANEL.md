# Plano de Evolução Técnica — Painel de Gateways de Pagamento

Documento de planejamento para evoluir a configuração de gateways de pagamento de uma **tela única (Asaas)** para um **painel escalável com cards por gateway**.  
**Não implementar ainda** — apenas plano técnico.

---

## Estado atual (referência)

| Item | Situação hoje |
|------|----------------|
| **Rota frontend (tenant)** | Configurações → seção "Pagamentos" (tab dentro de `/settings`) com formulário único Asaas |
| **Rota frontend (Super Admin)** | `/superadmin/pagamentos` — formulário único Asaas |
| **Backend API (tenant)** | `GET/PUT /api/me/tenant/payment-gateway`, `GET /api/me/tenant/payment-gateways`, `POST .../payment-gateway/test` |
| **Backend API (Super Admin)** | `GET/PUT /api/superadmin/payment-gateway`, `GET /api/superadmin/payment-gateways` |
| **Banco** | `payment_gateways` (catálogo: key, name, is_enabled, credentials_schema, sort_order), `payment_gateway_configs` (scope, tenant_id, gateway_key, credentials JSONB, options JSONB) |
| **Interface backend** | `PaymentGateway` em `paymentGatewayTypes.ts`: createCustomer, createCharge, getPayment |
| **Asaas** | `modules/asaas/` (client, mapper, service, webhook); `testConnection` exposto |
| **Webhooks** | `POST /webhooks/asaas` (asaasWebhookRoutes) |

---

## 1. Nova estrutura da página

### 1.1 Rota principal: painel de gateways

- **Rota:** `/settings/payments`
- **Nome sugerido da tela:** "Pagamentos" ou "Gateways de pagamento"
- **Comportamento:** Página dedicada (não mais uma seção dentro de Configurações) que exibe um **grid de cards**, um por gateway disponível.

### 1.2 Conteúdo de cada card

Para cada gateway (ex.: Asaas, Stripe, Mercado Pago, Pagar.me — os dois últimos como "futuro" desabilitados ou em breve):

| Elemento | Descrição |
|----------|-----------|
| **Nome do gateway** | Ex.: "Asaas", "Stripe" (vindo do catálogo `payment_gateways.name`) |
| **Status da conexão** | Badge: **Conectado** / **Pendente** / **Não configurado** / **Erro** / **Desativado** (regras na seção 6.1) |
| **Último teste** | "Último teste: há 2 minutos" ou "Nunca testado" (fonte: `last_connection_test_at`) |
| **Ambiente** | Sandbox ou Produção (quando configurado) |
| **Webhook** | "Webhook: configurado" quando a URL do webhook estiver definida (reduz suporte) |
| **Botão "Configurar"** | Navega para a tela de configuração do gateway |
| **Botão "Testar conexão"** | Visível quando configurado; dispara teste, atualiza status e `last_connection_test_at`; sujeito a rate limit (máx 5 testes/min por tenant) |

### 1.3 Gateways a exibir

- **Asaas** — já implementado; card ativo com config e teste.
- **Stripe** — card pode aparecer desabilitado ou "Em breve" até implementação.
- **Mercado Pago** — idem.
- **Pagar.me** — idem.

A lista de cards deve vir do catálogo `payment_gateways` (já existente), ordenada por `sort_order`/nome, permitindo ativar/desativar gateways via seed ou admin sem mudar front.

### 1.4 Navegação

- No menu **Configurações** do tenant: manter entrada "Pagamentos" (ou "Gateways") que leva para `/settings/payments` em vez da seção atual.
- A seção atual "Pagamentos" dentro de `/settings` (tab) será **substituída** por um link/redirect para `/settings/payments`, ou a rota `/settings/payments` será a única tela de gateways e o menu de configurações passará a abrir essa página.

---

## 2. Comportamento ao clicar no card

### 2.1 Opções de UX

| Opção | Prós | Contras |
|-------|-----|--------|
| **Rota dedicada** `/settings/payments/asaas` | URL compartilhável, histórico do browser, fácil refresh | Mais rotas e componentes de página |
| **Modal** | Mantém contexto do painel, menos navegação | URL não reflete estado; conteúdo longo pode ficar apertado |

**Recomendação:** **Rota dedicada** `/settings/payments/:gatewayKey` (ex.: `/settings/payments/asaas`). Melhor para acessibilidade, deep link e formulários longos (API Key, webhook, ambiente, etc.).

### 2.2 Conteúdo da tela (ou modal) de configuração

- **Status da conexão** (badge: Conectado / Não configurado / Erro de autenticação)
- **Ambiente:** Sandbox / Produção (radio buttons)
- **API Key:** valor atual mascarado (ex.: `••••••••a1b2`) + campo opcional "Nova API Key"
- **Botão Salvar**
- **Botão Testar conexão**
- **URL do Webhook** (somente leitura) + botão Copiar

Ou seja, a experiência atual da seção "Pagamentos" (PaymentGatewaySection) passa a ser a **tela de detalhe de um único gateway**, acessada por `/settings/payments/asaas` (e no futuro `/settings/payments/stripe`, etc.).

### 2.3 Rotas frontend propostas

- `GET /settings/payments` — lista de cards (painel).
- `GET /settings/payments/:gatewayKey` — configuração do gateway (ex.: asaas). Validação: `gatewayKey` deve existir em `payment_gateways` e estar habilitado.

---

## 3. Arquitetura backend (dados e modelo)

### 3.1 O que já existe

- **`payment_gateways`** (catálogo): `id`, `key`, `name`, `description`, `is_enabled`, `credentials_schema` (JSONB), `sort_order`, `created_at`, `updated_at`.
- **`payment_gateway_configs`** (configuração por escopo): `id`, `scope` (global/tenant), `tenant_id`, `gateway_key`, `is_active`, `display_name`, **`credentials` (JSONB)**, **`options` (JSONB)**, timestamps. **Não possui hoje** coluna `status` de operação (apenas `is_active` para ativar/desativar a config).

Credenciais hoje estão em **JSONB em texto** (não criptografadas em repouso). O front só recebe valores mascarados.

### 3.1.1 Ajuste: coluna `status` em `payment_gateway_configs`

Para SaaS multi-tenant o status da config **não deve depender apenas do teste de conexão**. Cenários reais:

- Empresa desativou o gateway manualmente.
- Gateway suspenso pelo provedor.
- Erro temporário de API.
- Sandbox ativo e funcionando.

**Inclusão no plano:**

- Adicionar **`status`** em `payment_gateway_configs`:
  - **Tipo:** `TEXT` (ou ENUM no PostgreSQL) com valores: **`pending`** | **`active`** | **`error`** | **`disabled`**.
  - **Default:** `'pending'` (config salva mas nunca testada) ou `'active'` conforme política (ex.: ao salvar config pela primeira vez, manter `pending` até primeiro teste ok).
  - **Uso:**

| Status     | Significado |
|-----------|-------------|
| `pending` | Configurado mas nunca testado (melhora UX no card: "Pendente" em vez de assumir erro). |
| `active`  | Funcionando (último teste ok). |
| `error`   | Falha (teste falhou ou problema conhecido). |
| `disabled`| Desligado pela empresa ou admin (sem apagar credenciais). |

- **Migração:** `ALTER TABLE payment_gateway_configs ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'` (e CHECK ou ENUM com os quatro valores).
- O **Resolver** (seção 4) deve considerar apenas configs com `status = 'active'` (e `is_active = true`) ao resolver o gateway. A UI pode permitir "Desativar gateway" setando `status = 'disabled'`.

### 3.2 Abordagem sugerida no plano: tabela única vs JSON config

**Opção A — Tabela por gateway com colunas fixas** (ex.: `api_key_encrypted`, `environment`, `status`):

- Prós: tipagem forte, fácil indexar status/ambiente.
- Contras: migração e novo schema a cada gateway; múltiplas tabelas ou colunas nullable por gateway.

**Opção B — Manter `payment_gateway_configs` com credentials/options em JSONB** (atual):

- Prós: flexível para Asaas (api_key, env), Stripe (api_key, webhook_secret), etc., sem alterar schema; um único serviço de config.
- Contras: credenciais em JSONB em claro no banco (mitigável com criptografia em aplicação — ver seção 9).

**Recomendação:** **Manter e evoluir a abordagem atual (Opção B)** — `payment_gateways` (catálogo) + `payment_gateway_configs` (credentials + options em JSONB). Adicionar **uma coluna genérica `status`** (pending | active | error | disabled) na tabela de configs (ver 3.1.1), sem criar colunas fixas por gateway (api_key_encrypted, environment por coluna). Para segurança, evoluir com **criptografia em aplicação** das chaves sensíveis antes de persistir (ver seção 9). Usar `credentials` e `options` como contrato por `gateway_key`, documentado em `credentials_schema` no catálogo.

### 3.3 Campos adicionais úteis (se necessário)

- Em **`payment_gateway_configs`**:
  - **Obrigatório (ajuste do plano):** **`status`** TEXT (valores: `pending` | `active` | `error` | `disabled`) — ver 3.1.1.
  - **Opcional:** `last_connection_test_at` (timestamptz) e `last_connection_status` (text: ok / auth_error / error) para exibir status e "último teste" no card; atualizados ao rodar "Testar conexão".
- Manter **`credentials`** e **`options`** como JSONB; não adicionar coluna `webhook_url` na tabela (webhook_url é derivada: base da API + `/webhooks/{gateway_key}`).

### 3.4 Índices em `payment_gateway_configs` (muito importante)

Sem índices adequados, o **Resolver** fica lento com muitos tenants. Incluir na migração:

```sql
CREATE INDEX idx_pg_configs_tenant
ON payment_gateway_configs (tenant_id);

CREATE INDEX idx_pg_configs_gateway
ON payment_gateway_configs (gateway_key);

CREATE INDEX idx_pg_configs_active
ON payment_gateway_configs (tenant_id, gateway_key)
WHERE status = 'active';
```

O índice parcial `idx_pg_configs_active` deixa `resolvePaymentGateway()` extremamente rápido ao buscar config ativa por tenant e gateway.

### 3.5 Tabela `payment_customers` (persistir external_reference localmente)

Além de enviar **externalReference = tenant_id** ao gateway, **persistir no banco local** o vínculo tenant ↔ cliente do gateway, para não precisar consultar a API do gateway sempre em `ensureCustomer`.

**Tabela sugerida:**

| Coluna                | Tipo        | Descrição |
|-----------------------|------------|-----------|
| `id`                  | uuid / bigint | PK |
| `tenant_id`           | uuid       | Tenant |
| `gateway_key`         | text       | ex.: asaas |
| `gateway_customer_id`  | text       | ID do cliente no gateway |
| `external_reference`  | text       | valor enviado ao gateway (ex.: tenant_id) |
| `created_at`          | timestamptz | |

**Fluxo em `ensureCustomer`:**
1. Tenant + gateway_key → buscar em **payment_customers**.
2. Se existir → usar `gateway_customer_id` (e opcionalmente validar no gateway).
3. Se não existir → criar cliente no gateway (com externalReference = tenant_id), persistir em **payment_customers** e retornar.

Isso melhora performance e reduz chamadas à API do gateway.

### 3.6 Resumo do modelo de dados (evolução)

- **Não substituir** `payment_gateways` nem `payment_gateway_configs`.
- **Adicionar** em `payment_gateway_configs`: **`status`** (TEXT: `pending` | `active` | `error` | `disabled`); opcionalmente `last_connection_test_at`, `last_connection_status`.
- **Adicionar índices** em `payment_gateway_configs`: tenant_id, gateway_key, e índice parcial (tenant_id, gateway_key) WHERE status = 'active'.
- **Nova tabela** **`payment_customers`**: tenant_id, gateway_key, gateway_customer_id, external_reference, created_at.
- **Evoluir:** criptografia em aplicação para chaves em `credentials` (seção 9).
- **Documentar** em `credentials_schema` (ou docs) o formato esperado por gateway (ex.: Asaas: api_key, env; Stripe: api_key, webhook_secret).

---

## 4. Camada de integração (serviços por gateway)

### 4.1 Estado atual

- **`modules/payments/`**: tipos (`PaymentGateway` com createCustomer, createCharge, getPayment), `gatewayProvider` (getActiveGateway por billingType/tenantId).
- **`modules/asaas/`**: client HTTP, mapper, `asaasService` (implementa PaymentGateway + ensureCustomerForTenant, handlePaymentEvent, activatePlanForTenant, testConnection).

Não existe hoje `cancelCharge` nem `getCharge` genérico (existe getPayment no Asaas).

### 4.2 Interface comum proposta: PaymentGatewayInterface

Contrato que todo gateway deve implementar (evolução da atual `PaymentGateway`):

| Método | Descrição |
|--------|-----------|
| `createCustomer` | Criar cliente no gateway (já existe). |
| **`ensureCustomer`** | **Criar cliente ou reutilizar existente.** Vários gateways exigem “criar ou reutilizar”; esse método encapsula a lógica (ex.: buscar por externalReference/email e, se não existir, criar). Já existe no Asaas como `ensureCustomerForTenant`; elevar a método da interface. |
| `createCharge` | Criar cobrança (já existe). |
| `getCharge` / `getPayment` | Consultar status de uma cobrança (já existe como getPayment; pode padronizar nome como getCharge). |
| `cancelCharge` (opcional) | Cancelar cobrança (estender quando houver uso). |
| `testConnection` | Validar credenciais (já existe no Asaas). |
| `handleWebhook` | Processar payload do webhook (hoje no módulo asaas; padronizar assinatura por gateway). |

**Resumo da interface:** `createCustomer`, **`ensureCustomer`**, `createCharge`, `getCharge`, `cancelCharge`, `testConnection`, `handleWebhook`.

**Método opcional para debug (não na interface, mas no sistema):** **`getWebhookEvents()`** — listar últimos eventos de webhook recebidos (ver seção 5.5).

### 4.3 Estrutura de pastas sugerida (backend)

**Separar núcleo de pagamentos dos gateways concretos:**

- **`modules/payments/`** (core) — apenas resolução e contrato:
  - `gatewayResolver.ts`
  - `gatewayRegistry.ts`
  - `paymentGatewayTypes.ts`
- **`modules/gateways/`** — um subdiretório por gateway:
  - **`gateways/asaas/`** — `asaasClient.ts`, `asaasService.ts`, `asaasWebhook.ts` (e mapper se existir).
  - **`gateways/stripe/`** (futuro)
  - **`gateways/mercadopago/`** (futuro)
  - **`gateways/pagarme/`** (futuro)

O Registry em `modules/payments/` referencia as factories em `modules/gateways/{key}/`. Migração: mover o atual `modules/asaas/` para `modules/gateways/asaas/` e apontar o Registry para ele. Assim o core (resolver, tipos, registry) fica isolado e cada gateway é um plugin.

### 4.4 Camada Gateway Resolver (separar do “provider”)

Com múltiplos gateways, a lógica de **qual gateway usar** deve ficar concentrada em uma camada clara, evitando espalhar decisões pelo sistema.

**Estrutura proposta em `modules/payments/` (ou `payments/`):**

- **`gatewayResolver.ts`** — Responsável por **descobrir** qual gateway usar a partir do contexto (tenant, billingType, etc.). Não instancia o gateway; apenas resolve qual `gateway_key` e qual config usar.
- **`gatewayRegistry.ts`** — Registro que associa `gateway_key` → factory (função que, dado config, retorna instância que implementa PaymentGatewayInterface). Ex.: `asaas` → getAsaasGateway(config), `stripe` → getStripeGateway(config).
- **`paymentGatewayTypes.ts`** — Tipos e interface comum (já existe).

**Fluxo:**

1. **tenantId** (e billingType, ex.: `"invoice"` ou `"saas"`) → entrada.
2. **Resolver:** buscar config ativa (ex.: `getActiveConfig(billingType, tenantId)`), filtrando por `status = 'active'` e `is_active = true`; obter **gateway_key** e credenciais/options.
3. **Registry:** com `gateway_key` e config, obter instância do gateway (createCustomer, createCharge, etc.).
4. Retornar a instância pronta para uso.

**Exemplo de uso no sistema:**

```ts
const gateway = await resolvePaymentGateway({
  tenantId,
  billingType: "invoice", // ou "saas"
});
if (gateway) {
  await gateway.ensureCustomer(...);
  await gateway.createCharge(...);
}
```

Assim, o restante do sistema chama apenas **`resolvePaymentGateway(context)`** e não precisa conhecer Asaas, Stripe, etc. O **gatewayProvider** atual pode ser refatorado para usar internamente o Resolver + Registry, ou o Resolver passa a ser o ponto único de entrada e o “provider” vira um alias ou é descontinuado.

### 4.5 Timeout e retry na camada client

APIs de pagamento às vezes travam ou demoram. Na camada **client** de cada gateway (ex.: asaasClient, stripeClient):

- **Timeout:** 10 segundos por requisição HTTP.
- **Retry:** até 2 tentativas em caso de timeout ou erro 5xx (com backoff opcional).

Isso deve ser configurável por client (constantes ou options) e aplicado a todas as chamadas ao gateway.

### 4.6 Registro de gateways

- **Catálogo** `payment_gateways` define quais gateways existem e estão habilitados.
- **Registry** (`gatewayRegistry.ts`): mapa `gateway_key` → factory (ex.: `asaas` → getAsaasGateway(config)). O Resolver usa o Registry após obter `gateway_key` e config da base.

---

## 5. Sistema de webhooks

### 5.1 Padrão atual

- Uma rota por gateway: **`POST /webhooks/asaas`** (asaasWebhookRoutes).
- Handler: validação de payload, idempotência (asaas_webhook_events), chamada a `handlePaymentEvent` do módulo Asaas.

### 5.2 Padrão desejado (escalável)

- **Padrão de URL:** `/webhooks/{gateway_key}` — ex.: `/webhooks/asaas`, `/webhooks/stripe`, `/webhooks/mercadopago`.
- Cada gateway registra sua rota sob `/webhooks/:gateway` ou o backend expõe um único router que delega por path (ex.: `/webhooks/asaas` → asaasWebhookHandler).
- **Segurança:** validar assinatura/secret por gateway (campo em `options`, ex.: webhook_secret); não confiar apenas em path.

### 5.3 Webhook multi-tenant (muito importante)

No modelo SaaS multi-tenant, **cada tenant pode ter sua própria conta no gateway** (ex.: conta Asaas por tenant). Com uma única URL `/webhooks/asaas`, o backend precisa **descobrir qual tenant** enviou o evento.

**Forma 1 (recomendada): usar `externalReference` = tenant_id**

- Ao criar **customer**, **charge** ou **subscription** no gateway, gravar **`externalReference` (ou campo equivalente) = `tenant_id`** (ou ID interno que identifique o tenant).
- No webhook:
  1. Receber payload (ex.: `customer`, `subscription`, `payment`).
  2. Extrair **externalReference** (ou `externalReference` do customer/charge).
  3. **Descobrir tenant** via `externalReference` → buscar config e contexto do tenant.
  4. Processar o evento no contexto correto (ex.: ativar plano, atualizar cobrança).

Assim continua-se com **uma URL por gateway**: `/webhooks/asaas`. Não é necessário registrar um webhook por tenant no painel do provedor.

**Forma 2 (evitar): webhook por tenant**

- URL do tipo `/webhooks/asaas/{tenantId}`.
- Contras: **muitos endpoints** (ex.: 1000 tenants = 1000 URLs no painel do gateway), difícil manutenção e limite de URLs em alguns provedores.

**Recomendação:** usar **externalReference = tenant_id** (ou identificador estável do tenant) em todos os recursos criados no gateway (customer, charge, subscription) e documentar no plano que o handler de webhook **sempre** resolve o tenant a partir do payload (customer.externalReference, payment.externalReference, etc.) antes de processar.

### 5.5 Eventos de webhook para debug (getWebhookEvents)

Inspirado em ferramentas como o Stripe: expor um endpoint que lista os **últimos eventos de webhook** recebidos, facilitando suporte e debugging.

- **Endpoint sugerido:** `GET /api/.../payments/webhooks/events` (tenant ou superadmin, conforme escopo).
- **Resposta (exemplo):** lista de eventos com:
  - `event_id` (ou id interno)
  - `gateway` (ex.: asaas)
  - `status` (processed, failed, pending)
  - `payload` (truncado ou resumido, sem dados sensíveis)
  - `created_at`
- **Uso:** tela de configuração do gateway ou área de suporte pode exibir "Últimos eventos" para ver se o webhook está sendo chamado e com qual resultado. **Economiza tempo** em debugging de integração.

O plano deve prever uma tabela ou estrutura para persistir eventos (ex.: `payment_webhook_events`: id, gateway_key, event_id, payload_hash ou resumo, status, created_at) e o endpoint GET para listagem (com paginação e filtro por gateway).

### 5.6 Documentação no plano

- O plano deve prever que **cada novo gateway** terá:
  - Rota dedicada: `POST /webhooks/{gateway_key}`.
  - Handler que **extrai tenant do payload** (externalReference ou equivalente) quando escopo for tenant; para escopo global (billing SaaS), usar config global.
  - Webhook URL exibida na tela de configuração do gateway como `{BASE_URL}/webhooks/{gateway_key}`.

---

## 6. Estado do gateway (exibição no card)

### 6.1 Estados possíveis (regras finais para o card)

O estado exibido no card segue a tabela abaixo. Em todos os casos em que houver `last_connection_test_at`, exibir também **"Último teste: há X minutos"** (ou "Nunca testado"); e quando o webhook estiver configurado (URL definida e conhecida), exibir **"Webhook: configurado"** (reduz dúvidas de suporte).

| Estado UI        | Regra |
|------------------|--------|
| **Não configurado** | Sem credenciais (api_key vazia ou ausente). |
| **Pendente**       | Configurado mas nunca testado (`status = 'pending'` ou `last_connection_test_at` null). |
| **Conectado**      | `last_connection_status = ok` (e config ativa). |
| **Erro**           | Teste falhou (auth_error ou outro) ou `status = 'error'`. |
| **Desativado**     | `status = 'disabled'` (empresa desativou o gateway). |

### 6.2 Fonte do estado

- **Opção 1 (tempo real):** ao carregar o painel, para cada gateway configurado chamar endpoint de teste (pode ser pesado e lento).
- **Opção 2 (cache):** usar `last_connection_test_at` e `last_connection_status` em `payment_gateway_configs`; ao abrir o painel, exibir esse status; "Testar conexão" atualiza e persiste o resultado. Opcionalmente no painel fazer um único teste em background por gateway configurado para atualizar o cache.
- **Recomendação:** **Opção 2** para a listagem de cards; na tela de detalhe do gateway, o botão "Testar conexão" continua em tempo real e pode atualizar o cache.

### 6.3 API para o painel

- **GET** `/api/me/tenant/payment-gateways` já retorna lista de gateways (key, name, is_enabled).
- **Novo ou evoluído:** **GET** `/api/me/tenant/payment-gateways/status` (ou incluir no list) retornando, por gateway: key, name, is_enabled, `configured`, `connection_status` (ok | auth_error | error | null), `environment` (sandbox | production | null), **`last_connection_test_at`** (ISO ou null), **`webhook_configured`** (boolean: URL do webhook definida) para exibir "Último teste: há X minutos" e "Webhook: configurado" no card. Assim os cards são montados sem uma chamada de teste por gateway na abertura.

---

## 7. Estrutura frontend (componentes reutilizáveis)

### 7.1 Componentes sugeridos

| Componente | Responsabilidade |
|------------|------------------|
| **PaymentGatewayCard** | Card no painel: nome, GatewayStatusBadge, "Último teste: há X minutos" (ou "Nunca testado"), ambiente, **"Webhook: configurado"** (quando aplicável), botões "Configurar" e "Testar conexão". Recebe gateway (key, name, status, environment, configured, lastConnectionTestAt, webhookConfigured) e callbacks. |
| **GatewayStatusBadge** | Exibe Conectado / Pendente / Não configurado / Erro / Desativado com ícone e cor. |
| **WebhookDisplay** | Bloco que mostra a URL do webhook (read-only) e botão "Copiar". |
| **ConnectionTestButton** | Botão "Testar conexão" com estado loading e toast de sucesso/erro. |
| **ApiKeyField** | Campo de API Key com placeholder "Nova API Key (opcional)", mascaramento no valor atual (ex.: últimos 4 caracteres) e type="password". |

### 7.2 Páginas

- **PaymentsPanelPage** (`/settings/payments`): grid de `PaymentGatewayCard` para cada gateway retornado pela API (filtrado por is_enabled).
- **GatewayConfigPage** (`/settings/payments/:gatewayKey`): formulário do gateway (status, ambiente, ApiKeyField, salvar, ConnectionTestButton, WebhookDisplay). Reutiliza lógica atual de PaymentGatewaySection, parametrizada por `gatewayKey`.

### 7.3 Rotas (React Router)

- `/settings/payments` → PaymentsPanelPage
- `/settings/payments/:gatewayKey` → GatewayConfigPage (validar gatewayKey contra lista de gateways habilitados; 404 se inválido)

---

## 8. Migração da tela atual

### 8.1 O que existe hoje

- **Tenant:** em Configurações, seção "Pagamentos" (PaymentGatewaySection) com formulário Asaas único e chamadas a `/api/me/tenant/payment-gateway` e `/api/me/tenant/payment-gateways`.
- **Super Admin:** `/superadmin/pagamentos` com formulário similar e `/api/superadmin/payment-gateway` e `/api/superadmin/payment-gateways`.

### 8.2 Estratégia de migração (tenant)

1. **Criar** a rota `/settings/payments` e a página de painel (grid de cards).
2. **Criar** a rota `/settings/payments/asaas` e a página de configuração do Asaas (conteúdo equivalente ao atual PaymentGatewaySection), usando os mesmos endpoints (`/api/me/tenant/payment-gateway`, PUT, POST test). Assim, nenhuma API nova é obrigatória para a migração.
3. **No menu Configurações:** trocar a entrada "Pagamentos" para apontar para `/settings/payments` em vez de abrir a seção (tab) "paymentGateway". A seção "Pagamentos" pode ser removida do Settings ou mantida como redirect para `/settings/payments`.
4. **Remover** a tab "Pagamentos" do Settings (ou mantê-la apenas como redirect), para evitar duas formas de acessar a mesma função.
5. **Reutilizar** lógica e estilos de PaymentGatewaySection na nova GatewayConfigPage para Asaas, garantindo que status, ambiente, API Key mascarada, testar conexão e webhook continuem iguais.

### 8.3 Super Admin

- Opcionalmente aplicar o mesmo modelo: `/superadmin/payments` (lista de cards) e `/superadmin/payments/asaas` (config global). Ou manter por enquanto apenas a tela única em `/superadmin/pagamentos` e evoluir depois. O plano pode prever a mesma estrutura (cards + detalhe por gateway) para o Super Admin em fase posterior.

### 8.4 Garantias

- **APIs** `/api/me/tenant/payment-gateway`, PUT e POST test **permanecem**; a nova tela de detalhe Asaas continua usando-as. Nenhuma quebra para quem já configurou.
- **Banco** inalterado na migração mínima; apenas evoluções opcionais (last_connection_status, etc.) e depois criptografia.

---

## 9. Segurança

### 9.1 Criptografia da API Key

- **Hoje:** credenciais em `payment_gateway_configs.credentials` em JSONB em texto.
- **Evolução:** antes de persistir, criptografar em aplicação (ex.: AES-256-GCM com chave em env) os valores sensíveis (api_key, webhook_secret, etc.); armazenar ciphertext ou um blob único; na leitura, descriptografar apenas em memória para uso (createCharge, testConnection, etc.) e nunca enviar valor em claro para o front.
- **Escopo:** apenas valores marcados como sensíveis no `credentials_schema` ou por convenção (api_key, secret, etc.).

### 9.2 Mascaramento no frontend

- Nunca enviar API Key em claro na API de leitura. Manter `api_key_masked` (ex.: últimos 4 caracteres) e `credentialsMasked` para exibição.
- No PUT, aceitar valor especial (ex.: string fixa "••••••••") para "manter valor atual"; no backend, ao fazer merge, não sobrescrever quando o valor for esse placeholder.

### 9.3 Validação de conexão

- Endpoint "Testar conexão" deve usar apenas chamadas read-only à API do gateway (ex.: GET /customers?limit=1 no Asaas); não criar dados reais. Resposta 401/403 → "Erro de autenticação"; outros erros → "Erro de conexão".

### 9.4 Proteção de webhook

- Validar assinatura/secret quando o gateway fornecer (ex.: Stripe signing secret, Asaas token). Armazenar secret em `payment_gateway_configs.options` (ex.: webhook_secret) e usar no handler.
- Manter idempotência por event_id/payload_hash para evitar replay.
- Rate limiting já aplicado em `/webhooks/` (conferir no backend).

### 9.5 Rate limit no teste de conexão

- **POST** `/payment-gateway/test` (tenant e/ou superadmin) deve ter **rate limit interno**: **máximo 5 testes por minuto por tenant** (ou por usuário superadmin). Evita abuso e sobrecarga nas APIs dos gateways.

### 9.6 Logging de operações de gateway

Para facilitar diagnóstico em produção, registrar no backend cada operação de gateway com:

- **Campos sugeridos:** `gateway_key`, `tenant_id`, `operation` (ex.: createCharge, ensureCustomer, testConnection), `duration` (ms), `status` (success, error).

**Exemplo de linha de log:**

```
[PAYMENT_GATEWAY] gateway=asaas tenant=123 operation=createCharge duration=312ms status=success
```

Em caso de erro, incluir código ou mensagem (sem dados sensíveis). Muito útil para suporte e análise de performance.

---

## 10. Resultado esperado

### 10.1 Ao final da evolução

- **Rota** `/settings/payments`: painel com **cards por gateway** (Asaas ativo; Stripe/Mercado Pago/Pagar.me quando habilitados).
- Cada card: nome, status (Conectado / Pendente / Não configurado / Erro / Desativado), **"Último teste: há X minutos"**, ambiente, **"Webhook: configurado"**, botões "Configurar" e "Testar conexão" (rate limit 5/min por tenant).
- **Rota** `/settings/payments/:gatewayKey` (ex.: `/settings/payments/asaas`): tela de configuração do gateway com status, ambiente, API Key mascarada, salvar, testar conexão, URL do webhook e copiar.
- **Backend:** modelo com **`status`** (pending/active/error/disabled); **índices** em payment_gateway_configs (tenant, gateway, ativo); tabela **payment_customers**; camada **Resolver** + **Registry** em `modules/payments/`, gateways em `modules/gateways/{asaas|stripe|...}`; **timeout 10s, retry 2x** nos clients; interface com **ensureCustomer**; webhooks multi-tenant via externalReference; **GET .../payments/webhooks/events**; **rate limit** no teste (5/min); **logging** [PAYMENT_GATEWAY] gateway, tenant, operation, duration, status; criptografia de credenciais.
- **Frontend:** componentes reutilizáveis (PaymentGatewayCard com último teste e webhook configurado, GatewayStatusBadge, WebhookDisplay, ConnectionTestButton, ApiKeyField) e migração sem quebra.

### 10.2 Não escopo deste plano

- Implementação de gateways Stripe, Mercado Pago, Pagar.me (apenas prever estrutura e catálogo).
- Mudança de escopo (global vs tenant) ou de regras de billing; apenas evolução da UI e da organização por gateway.

---

## 11. Plano de implantação em fases

Implantação em **etapas seguras**: cada fase é testável, não quebra o que já existe e permite pausar ou reverter entre fases.

---

### Fase 1 — Banco de dados (sem mudança de comportamento)

**Objetivo:** Preparar o modelo de dados. Nenhuma regra de negócio ou API muda ainda.

| Item | Ação |
|------|------|
| **payment_gateway_configs** | Adicionar colunas: `status` (TEXT, default `'pending'`, CHECK ou ENUM: pending, active, error, disabled), `last_connection_test_at` (timestamptz NULL), `last_connection_status` (TEXT NULL: ok, auth_error, error). |
| **Backfill** | Para configs já existentes com credenciais preenchidas: definir `status = 'active'` (ou manter `pending` e o Resolver tratar ambos até a Fase 3). |
| **Índices** | Criar `idx_pg_configs_tenant`, `idx_pg_configs_gateway`, `idx_pg_configs_active` (parcial WHERE status = 'active'). |
| **payment_customers** | Criar tabela: id, tenant_id, gateway_key, gateway_customer_id, external_reference, created_at. Índice único (tenant_id, gateway_key). |
| **payment_webhook_events** (opcional nesta fase) | Criar tabela para debug: id, gateway_key, event_id, payload_summary (ou hash), status, created_at. Pode ser feita na Fase 5. |

**Critério de sucesso:** Migração roda sem erro; aplicação atual continua funcionando; leitura/escrita das configs existentes inalterada.

**Rollback:** Reverter migração (remover colunas e índices, dropar payment_customers se criada).

---

### Fase 2 — Backend: Resolver, Registry e reorganização de código

**Objetivo:** Introduzir Resolver + Registry e reorganizar pastas sem alterar contratos de API nem comportamento visível.

| Item | Ação |
|------|------|
| **modules/payments/** (core) | Criar `paymentGatewayTypes.ts` (interface com ensureCustomer, getCharge, etc.), `gatewayRegistry.ts` (mapa gateway_key → factory), `gatewayResolver.ts` (resolvePaymentGateway(context) que usa config + registry). |
| **modules/gateways/asaas/** | Mover (ou copiar e depois remover) o conteúdo atual de `modules/asaas/` para `modules/gateways/asaas/` (asaasClient, asaasService, asaasWebhook, mapper). Ajustar imports em todo o backend. |
| **Registry** | Registrar factory do Asaas no Registry (gateway_key `asaas` → getAsaasGateway(config)). |
| **gatewayProvider / chamadas atuais** | Refatorar para usar `resolvePaymentGateway({ tenantId, billingType })` por baixo; ou manter gatewayProvider como fachada que chama o Resolver. Objetivo: nenhuma chamada direta ao módulo Asaas fora do payments/gateways. |
| **Resolver** | Na Fase 2 o Resolver pode ainda ignorar `status` (buscar config ativa por is_active) para não quebrar; na Fase 3 passa a filtrar por `status = 'active'`. |
| **Client HTTP** | No asaasClient (e futuros clients): timeout 10s, retry 2x (timeout/5xx). |
| **Logging** | Em operações de gateway (createCharge, ensureCustomer, testConnection): log `[PAYMENT_GATEWAY] gateway=… tenant=… operation=… duration=… status=…`. |

**Critério de sucesso:** Testes e fluxos atuais (cobrança tenant, webhook Asaas, config Super Admin e tenant) seguem funcionando. Resolver retorna o mesmo gateway que antes.

**Rollback:** Reverter commits; manter `modules/asaas` e gatewayProvider antigo até próxima fase.

---

### Fase 3 — Backend: Status, cache de teste e rate limit

**Objetivo:** Persistir status e resultado do teste de conexão; expor dados para o painel; limitar abuso do teste.

| Item | Ação |
|------|------|
| **Salvar config** | Ao criar/atualizar config (PUT), setar `status = 'pending'` se for primeira vez ou se credenciais mudaram; manter last_connection_* existentes. |
| **Testar conexão** | No POST .../payment-gateway/test: ao executar teste, atualizar na config `last_connection_test_at`, `last_connection_status` (ok | auth_error | error) e `status` (ok → active, falha → error). |
| **Resolver** | Passar a considerar apenas configs com `status = 'active'` (além de is_active) para resolver gateway usado em cobranças. |
| **API para o painel** | Novo endpoint **GET** .../payment-gateways/status (tenant e superadmin) ou estender GET .../payment-gateways: retornar por gateway: configured, connection_status, last_connection_test_at, environment, webhook_configured (boolean), status (pending/active/error/disabled). |
| **Rate limit** | No POST .../payment-gateway/test: máx **5 requisições por minuto por tenant** (e por superadmin). Retornar 429 quando exceder. |

**Critério de sucesso:** Teste de conexão atualiza status e last_*; listagem de gateways para o painel traz todos os campos; Resolver ignora configs com status != 'active'; rate limit bloqueia após 5 testes/min.

**Rollback:** Desconsiderar status no Resolver (voltar a usar só is_active); remover rate limit; opcionalmente deixar de persistir last_*.

---

### Fase 4 — Backend: payment_customers e ensureCustomer

**Objetivo:** Evitar consultar o gateway a cada ensureCustomer; persistir external_reference localmente.

| Item | Ação |
|------|------|
| **payment_customers** | Já criada na Fase 1. Implementar serviço ou funções: getPaymentCustomer(tenantId, gateway_key), createPaymentCustomer(tenantId, gateway_key, gateway_customer_id, external_reference). |
| **ensureCustomer** | No fluxo ensureCustomer (ex.: antes de createCharge): 1) Buscar em payment_customers por (tenant_id, gateway_key). 2) Se existir, usar gateway_customer_id (e opcionalmente validar no gateway). 3) Se não existir, criar cliente no gateway com externalReference = tenant_id, persistir em payment_customers e retornar. |
| **Integração** | Usar ensureCustomer (com payment_customers) em createTenantCharge e em qualquer outro ponto que hoje cria/usa cliente no gateway. |

**Critério de sucesso:** Primeira cobrança de um tenant cria cliente no gateway e grava em payment_customers; cobranças seguintes reutilizam o mesmo cliente sem chamar “buscar cliente” no gateway.

**Rollback:** Fazer ensureCustomer ignorar payment_customers e voltar a criar/buscar sempre no gateway (comportamento anterior).

---

### Fase 5 — Backend: Webhooks multi-tenant e eventos (debug) ✅

**Objetivo:** Webhook identificar tenant pelo payload; opcionalmente persistir eventos para debug.

| Item | Ação |
|------|------|
| **externalReference** | Garantir que customer e charge criados no gateway enviem externalReference = tenant_id (já previsto na Fase 4). |
| **Handler webhook** | No handler de cada gateway (ex.: Asaas): 1) Extrair externalReference do payload (customer, payment, subscription). 2) Resolver tenant_id a partir desse valor. 3) Buscar config e contexto do tenant; processar evento (ativar plano, atualizar cobrança, etc.). Para billing global (SaaS), manter fluxo atual por config global. |
| **payment_webhook_events** | Se tabela criada: ao receber webhook, inserir registro (gateway_key, event_id, payload_summary, status). |
| **GET .../payments/webhooks/events** | Endpoint (tenant e/ou superadmin) listando últimos eventos com paginação e filtro por gateway; retorno: event_id, gateway, status, payload (resumo), created_at. |

**Critério de sucesso:** Webhook de pagamento/customer resolve o tenant correto; em multi-tenant, cada tenant recebe apenas seus eventos; lista de eventos (se implementada) aparece na API.

**Rollback:** Handler voltar a usar apenas config global (se hoje for só SaaS); desativar persistência de eventos.

---

### Fase 6 — Frontend: Rotas e painel de gateways ✅

**Objetivo:** Nova página de painel e tela de configuração por gateway; menu aponta para a nova experiência; antiga tab vira redirect.

| Item | Ação |
|------|------|
| **Rotas** | Adicionar `/settings/payments` (PaymentsPanelPage) e `/settings/payments/:gatewayKey` (GatewayConfigPage). Validar gatewayKey contra lista de gateways (404 se inválido). |
| **PaymentsPanelPage** | Página com grid de cards; cada card mostra nome do gateway, status (badge simples ainda), link "Configurar" para /settings/payments/:gatewayKey. Dados do GET .../payment-gateways ou .../payment-gateways/status. |
| **GatewayConfigPage** | Reutilizar lógica e layout do PaymentGatewaySection atual, parametrizado por gatewayKey (por enquanto só Asaas). Mesmos endpoints: GET/PUT config, POST test. |
| **Menu** | Em Configurações, item "Pagamentos" (ou "Gateways") passa a navegar para `/settings/payments`. |
| **Tab Pagamentos no Settings** | Remover tab ou mantê-la apenas como redirect para `/settings/payments`. |

**Critério de sucesso:** Usuário acessa Configurações → Pagamentos e vê o painel com cards; ao clicar em Asaas, abre a tela de configuração equivalente à atual; salvar e testar conexão funcionam; fluxo antigo (se ainda acessível) redireciona para o novo.

**Rollback:** Reverter rotas e menu; restaurar tab "Pagamentos" no Settings com PaymentGatewaySection.

---

### Fase 7 — Frontend: Cards completos e UX ✅

**Objetivo:** Cards com todos os estados, “Último teste”, “Webhook: configurado” e ambiente; badge e botões alinhados ao plano.

| Item | Ação |
|------|------|
| **API** | Garantir que GET .../payment-gateways/status (ou list) retorne todos os campos necessários (connection_status, last_connection_test_at, webhook_configured, environment, status). |
| **GatewayStatusBadge** | Componente que exibe: Não configurado | Pendente | Conectado | Erro | Desativado (cores e ícones). |
| **PaymentGatewayCard** | Incluir: nome, GatewayStatusBadge, texto "Último teste: há X minutos" (ou "Nunca testado"), ambiente, "Webhook: configurado" (quando aplicável), botões Configurar e Testar conexão (com feedback de rate limit se 429). |
| **GatewayConfigPage** | Opção "Desativar gateway" (chamar API que seta status = disabled); manter exibição de status, ambiente, API Key mascarada, salvar, testar, webhook e copiar. |

**Critério de sucesso:** Painel exibe estado correto por gateway; “Último teste” e “Webhook: configurado” aparecem; Testar conexão reflete resultado no card (e respeita rate limit).

**Rollback:** Simplificar card (apenas nome e Configurar); remover badge avançado e “Desativar”.

---

### Fase 8 — Opcional / posterior

| Item | Descrição |
|------|------------|
| **Criptografia** | Criptografar em aplicação as chaves em `credentials` antes de persistir; descriptografar apenas em memória no backend (seção 9). |
| **GET webhooks/events na UI** | Tela de configuração do gateway (ou área suporte) exibir lista de últimos eventos de webhook (chamando GET .../payments/webhooks/events). |
| **Super Admin** | Aplicar mesmo modelo: painel `/superadmin/payments` com cards e `/superadmin/payments/asaas` para config global. |

---

### Resumo das fases e dependências

| Fase | Nome | Depende de | Entrega |
|------|------|------------|---------|
| **1** | Banco de dados | — | Colunas status, last_*; índices; payment_customers; opcional payment_webhook_events |
| **2** | Resolver + Registry + código | Fase 1 | modules/payments + modules/gateways/asaas; timeout/retry; logging |
| **3** | Status, teste, rate limit | Fase 1, 2 | Persistência de status e last_*; API status; Resolver por status; rate limit 5/min |
| **4** | payment_customers + ensureCustomer | Fase 1, 2 | ensureCustomer usa tabela local; externalReference = tenant_id |
| **5** | Webhooks multi-tenant + eventos | Fase 2, 4 | Handler resolve tenant pelo payload; GET events (opcional) |
| **6** | Frontend: rotas e painel | Fase 3 | /settings/payments e /:gatewayKey; menu e redirect |
| **7** | Frontend: cards e UX | Fase 3, 6 | Badge completo; último teste; webhook configurado; desativar |
| **8** | Opcional | Fases anteriores | Criptografia; eventos na UI; painel Super Admin |

**Ordem sugerida:** 1 → 2 → 3 → 4 → 5 → 6 → 7. As fases 4 e 5 podem ser trocadas (webhook multi-tenant antes de payment_customers) se o uso atual for só config global; caso já exista multi-tenant por tenant_id no payload, Fase 4 primeiro reduz chamadas ao gateway.

---

## Resumo de decisões

| Tópico | Decisão |
|--------|---------|
| **Nova página** | `/settings/payments` = painel de cards; `/settings/payments/:gatewayKey` = configuração do gateway |
| **Dados** | Manter `payment_gateways` + `payment_gateway_configs` (JSONB); **`status`** = pending \| active \| error \| disabled; **índices** em configs (tenant, gateway, ativo); tabela **payment_customers** (tenant, gateway_key, gateway_customer_id, external_reference); last_connection_test_at / last_connection_status; criptografia em aplicação |
| **Resolver** | **modules/payments/** (core): gatewayResolver, gatewayRegistry, paymentGatewayTypes; **modules/gateways/{asaas,stripe,...}** (implementações); ponto único `resolvePaymentGateway(context)` |
| **Client** | Timeout 10s, retry 2x em todos os clients de gateway |
| **Interface** | createCustomer, **ensureCustomer**, createCharge, getCharge, cancelCharge, testConnection, handleWebhook |
| **Webhooks** | `/webhooks/{gateway_key}`; multi-tenant via **externalReference = tenant_id**; validar assinatura; persistir external_reference em payment_customers |
| **Debug** | GET .../payments/webhooks/events (event_id, gateway, status, payload, created_at) |
| **Rate limit** | POST .../payment-gateway/test: **máx 5 testes/min por tenant** |
| **Logging** | [PAYMENT_GATEWAY] gateway, tenant_id, operation, duration, status |
| **Estado no card** | Não configurado \| Pendente \| Conectado \| Erro \| Desativado; exibir "Último teste: há X min" e "Webhook: configurado" |
| **Migração** | Nova rota e páginas; reutilizar APIs; menu → `/settings/payments`; remover/redirect tab Pagamentos; mover asaas para modules/gateways/asaas |
