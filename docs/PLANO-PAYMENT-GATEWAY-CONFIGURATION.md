# Plano de Arquitetura — Configuração de Gateways de Pagamento

Documento de planejamento técnico para permitir **configuração de gateway de pagamento em dois níveis**: Super Admin (global) e Tenant (por empresa). **Não implementar nada ainda** — apenas planejamento.

---

## Objetivos

1. **Nível Super Admin (global)**  
   Configurar o gateway usado para cobrar os planos das empresas (tenants) — faturamento SaaS (tenant_billing).

2. **Nível Tenant (por empresa)**  
   Permitir que cada empresa configure seu próprio gateway para cobrar seus clientes no futuro (faturas do CRM / invoices).

A arquitetura deve suportar ambos os níveis sem quebrar o que já existe e preparar para múltiplos gateways (Asaas, Stripe, PagarMe, etc.).

---

## 1) Análise do que já existe hoje no projeto

### 1.1 Módulos de pagamento

| Local | Conteúdo |
|-------|----------|
| **`packages/backend/src/modules/payments/`** | `paymentGatewayTypes.ts` (interface `PaymentGateway`, DTOs genéricos), `gatewayProvider.ts` (getActiveGateway, setGatewayForTesting), `index.ts`. |
| **`packages/backend/src/modules/asaas/`** | Cliente HTTP (asaasClient: createCustomer, getCustomer, createPayment, getPayment), mappers (asaasMapper), services (asaasService implementa PaymentGateway; ensureCustomerForTenant, handlePaymentEvent, activatePlanForTenant), webhooks (asaasWebhook), tipos e eventos. |

- **PaymentGateway**: `createCustomer`, `createCharge`, `getPayment`.
- **GatewayProviderContext**: hoje `{ tenantId?: string }`; no plano passa a ser `{ billingType: 'saas' | 'crm'; tenantId?: string }` (tenantId obrigatório quando billingType = 'crm'). Usado para resolver qual config usar (ver seção 5).

### 1.2 gatewayProvider (comportamento atual)

- **Arquivo:** `packages/backend/src/modules/payments/gatewayProvider.ts`
- **getActiveGateway(context?: GatewayProviderContext):** ignora `context`; não consulta banco.
- Lógica: import dinâmico de `../asaas`, chama `getAsaasGateway()`; se retornar instância, cacheia e retorna.
- **getAsaasGateway()** (módulo Asaas): retorna `PaymentGateway` se `asaasClient.isConfigured()` (presença de `ASAAS_API_KEY`), senão `null`.
- Comentário no código: *“no futuro lê de payment_gateways ou system_settings”*.

### 1.3 Uso de variáveis de ambiente (Asaas)

- **asaasClient.ts** (uso interno do módulo Asaas):
  - `ASAAS_ENV`: `'sandbox'` | `'production'` → define base URL da API.
  - `ASAAS_API_KEY`: chave de API; se ausente, `isConfigured()` retorna false e o gateway não é exposto.
- Nenhuma configuração de gateway é lida de banco ou de arquivo; tudo vem de env.

### 1.4 Rotas existentes

| Rota | Uso | Autenticação |
|------|-----|--------------|
| `POST /webhooks/asaas` | Receber eventos do Asaas (pagamento confirmado, etc.) | Nenhuma (webhook) |
| `GET /api/superadmin/tenants/:id/billing` | Ver faturamento do tenant (plano, próxima cobrança, histórico) | Super Admin |
| `POST /api/superadmin/tenants/:id/billing/charge` | Criar cobrança **apenas em banco** (tenant_billing) | Super Admin |

- **createTenantCharge** (tenantsController): insere em `tenant_billing` (tenant_id, plan_id, amount_cents, due_date, status pending, invoice_number). **Não chama** gateway nem Asaas; não preenche gateway, payment_method, asaas_payment_id (colunas existem mas o fluxo atual não as usa na criação).
- Não existe rota de configuração de gateway (nem `/admin/payments`, nem `/settings/payments`, nem equivalente no superadmin).

### 1.5 Tabelas relacionadas a billing e pagamentos

| Tabela | Finalidade | Colunas relevantes para gateway |
|--------|------------|----------------------------------|
| **tenant_billing** | Cobranças das empresas (SaaS) | gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key, period_start, period_end |
| **tenants** | Empresas (clientes do SaaS) | plan_id, status, **asaas_customer_id** (vínculo com Asaas para cobrança) |
| **asaas_webhook_events** | Idempotência e retry de webhooks | event_id, payment_id, payload_hash, status, attempts, last_error |
| **invoices** | Faturas do CRM (tenant cobra seus clientes) | Sem colunas de gateway hoje; status draft/pending/paid/overdue |
| **superadmin_settings** | Configurações globais Super Admin | key (TEXT), value (TEXT); ex.: max_registrations |

- Não existe tabela `payment_gateways` (catálogo de gateways suportados), `payment_gateway_configs` (configurações por conta) nem `system_settings` para configuração de gateways.

### 1.6 Estrutura de configurações existentes

- **superadmin_settings**: chave/valor genérico. Usado hoje para itens como `max_registrations`. Poderia ser estendido com chaves do tipo `payment_gateway_active` ou `asaas_api_key`, mas não é o ideal para credenciais (segurança, escopo global apenas).
- **tenant_feature_overrides**: por tenant e feature_key (módulos do sistema); não é usado para pagamento.
- Não há tabela de “configurações por tenant” genérica (exceto feature overrides e dados específicos como domain, etc.).

### 1.7 Estrutura de tenants e billing

- Um **tenant** tem um **plan_id** e **status** (active, suspended, trial). Cobranças do tenant (para renovar plano) ficam em **tenant_billing** (uma linha por cobrança: plan_id, amount_cents, due_date, status, gateway, asaas_payment_id, etc.).
- Fluxo atual de “cobrança” no Super Admin: criar linha em tenant_billing (pending); a integração Asaas (createCharge, webhook, activatePlanForTenant) está implementada no módulo Asaas, mas o **controller** (createTenantCharge) ainda não chama o gateway — ou seja, o fluxo completo “escolher gateway → criar cobrança no Asaas → persistir asaas_payment_id” não está ligado à rota atual.
- **CRM (invoices)**: tabela `invoices` por tenant (client_id, user_id, etc.); no futuro, cobrança ao cliente do CRM poderá usar gateway **configurado pelo tenant**.

---

## 2) O que está faltando para suportar configuração de gateway

| Necessidade | Situação atual | Observação |
|-------------|----------------|------------|
| **Configuração persistida (global)** | Só env (ASAAS_*) | Falta: onde guardar “gateway ativo” e credenciais/opções por gateway (ex.: Asaas) para uso **global** (SaaS billing). |
| **Configuração persistida (por tenant)** | Inexistente | Falta: onde guardar gateway ativo e credenciais por tenant (CRM billing futuro). |
| **Resolução de gateway por contexto** | gatewayProvider ignora context | Falta: getActiveGateway({ billingType: 'saas' }) vs getActiveGateway({ billingType: 'crm', tenantId }). |
| **Múltiplas instâncias do mesmo gateway** | Asaas usa uma única env | Falta: suportar várias “contas” (ex.: uma global, uma por tenant) com credenciais diferentes. |
| **Rotas de configuração** | Nenhuma | Falta: Super Admin configurar gateway global; Tenant configurar gateway próprio (quando feature existir). |
| **Telas de configuração** | Nenhuma | Falta: Configurações → Pagamentos/Gateway (Super Admin) e, no tenant, equivalente em Configurações (ex.: Cobrança / Integrações). |
| **Uso de config no módulo Asaas** | asaasClient lê só env | Falta: Asaas poder receber “qual conta usar” (global vs tenant X) e ler credenciais da config correspondente (banco ou serviço de config). |

---

## 3) Estrutura de banco recomendada

### 3.1 Opção recomendada: tabelas dedicadas

Evitar colocar API keys em `superadmin_settings` (segurança, auditoria, escopo). Usar tabelas específicas para gateways.

#### 3.1.0 Tabela: `payment_gateways` (gateways suportados pelo sistema)

**Avaliação:** Recomenda-se criar uma tabela de catálogo para registrar quais gateways estão disponíveis (Asaas, Stripe, etc.). Benefícios: (1) frontend e backend podem listar gateways suportados dinamicamente; (2) novos gateways são adicionados via seed/migração sem alterar código de UI; (3) permite desativar um gateway temporariamente (ex.: manutenção na API); (4) metadados por gateway (nome de exibição, URL de documentação, campos obrigatórios para credenciais).

```sql
-- Catálogo de gateways suportados (não executar ainda — apenas planejamento)

CREATE TABLE public.payment_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  credentials_schema JSONB DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payment_gateways IS 'Gateways de pagamento suportados pelo sistema; usado para listar opções na configuração e validar gateway_key em payment_gateway_configs.';
-- credentials_schema: ex. { "api_key": "required", "env": "sandbox|production" } para documentar campos esperados em credentials (JSONB) da config.
```

- **payment_gateway_configs.gateway_key** deve referenciar **payment_gateways.key** (FK ou validação na aplicação). Em migrações iniciais, seed com `key = 'asaas'`, name = 'Asaas', is_enabled = true.

#### 3.1.1 Tabela: `payment_gateway_configs` (configurações por “conta”)

Escopo: **global** (scope = 'global') ou **tenant** (scope = 'tenant', tenant_id preenchido).

```sql
-- Exemplo de schema (não executar ainda — apenas planejamento)

CREATE TABLE public.payment_gateway_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('global', 'tenant')),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  gateway_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_name TEXT,
  -- Credenciais por gateway (ex.: { "api_key": "...", "env": "sandbox" }); em produção considerar cifração em aplicação antes de persistir
  credentials JSONB DEFAULT '{}',
  options JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_gateway_configs_scope_tenant
    CHECK (
      (scope = 'global' AND tenant_id IS NULL) OR
      (scope = 'tenant' AND tenant_id IS NOT NULL)
    )
);

-- Índice único: uma config ativa global por gateway_key (regra de negócio)
CREATE UNIQUE INDEX idx_payment_gateway_configs_one_active_global
  ON public.payment_gateway_configs (gateway_key) WHERE scope = 'global' AND is_active = true;

-- Por tenant: uma config ativa por (tenant_id, gateway_key)
CREATE UNIQUE INDEX idx_payment_gateway_configs_one_active_per_tenant
  ON public.payment_gateway_configs (tenant_id, gateway_key) WHERE scope = 'tenant' AND is_active = true;
```

- **scope = 'global'**: uma (ou mais) configs para cobrança SaaS (tenant_billing). Em v1 pode existir apenas uma ativa por `gateway_key` (ex.: asaas).
- **scope = 'tenant', tenant_id = X**: config do tenant X para cobrar seus clientes (invoices). Cada tenant pode ter sua própria conta Asaas (ou outro gateway).
- **gateway_key**: identificador do provedor; deve existir na tabela `payment_gateways` (gateways suportados). Ex.: `'asaas'`, `'stripe'`.
- **credentials**: JSONB com credenciais específicas do gateway (ex.: `{ "api_key": "...", "env": "sandbox" }` para Asaas). Em produção, considerar cifração em aplicação antes de persistir. **options** pode guardar webhook_secret, etc., conforme o gateway.

#### 3.1.2 Regra de “ativo”

- **Global:** para cada `gateway_key`, no máximo uma linha com `scope = 'global' AND is_active = true` (ou política “uma conta global ativa por gateway”).
- **Tenant:** por (tenant_id, gateway_key), no máximo uma ativa. Se o tenant não tiver config, o fluxo de “cobrança ao cliente do CRM” pode usar fallback para gateway global (se a regra de negócio permitir) ou exigir config do tenant.

#### 3.1.3 Índices sugeridos

- `(scope, tenant_id)` para listar configs por escopo/tenant.
- `(gateway_key, scope, is_active)` para resolução rápida do gateway ativo (global ou por tenant).

### 3.2 Alternativa mínima (só global)

Se no primeiro momento só for necessária a **configuração global**:

- **Opção A:** Estender `superadmin_settings` com chaves como `payment_gateway_active` (valor: `asaas`), `asaas_api_key`, `asaas_env`. Simples, mas credenciais em tabela genérica e sem suporte nativo a multi-tenant.
- **Opção B:** Uma tabela `payment_gateway_configs` apenas com `scope = 'global'` (tenant_id sempre NULL). Depois adicionar scope tenant e coluna tenant_id.

O plano recomenda **tabela dedicada desde o início** (3.1), mesmo que a primeira implementação use só scope global, para não migrar credenciais depois.

### 3.3 Compatibilidade com tabelas atuais

- **tenant_billing:** já possui `gateway` (ex.: 'asaas'). Continua indicando qual gateway foi usado naquela cobrança; a **origem** da configuração (global vs tenant) pode ficar implícita pelo fluxo (SaaS billing = global) ou, no futuro, uma coluna opcional `config_scope` ('global' | 'tenant').
- **tenants.asaas_customer_id:** segue sendo o customer no provedor; o provedor pode ser resolvido pela config global (hoje) ou pela config do tenant (futuro CRM).
- **invoices:** no futuro, ao gerar cobrança no gateway para um cliente do CRM, usar config do tenant; pode ser adicionada coluna `gateway`, `external_payment_id`, etc., alinhado ao que já existe em tenant_billing.

---

## 4) Estrutura de módulos backend

### 4.1 Manter como está

- **modules/asaas:** continua responsável por toda comunicação com a API Asaas; expõe PaymentGateway (com instância configurada) e webhooks.
- **modules/payments:** tipos genéricos e **gatewayProvider** como único ponto de resolução de gateway para o resto do app.

### 4.2 Novos ou estendidos

| Componente | Responsabilidade |
|------------|-------------------|
| **Serviço de configuração (novo)** | Ler/escrever `payment_gateway_configs`; expor “config ativa global” e “config ativa por tenant”; não expor credenciais em texto claro para o front (apenas “mascaradas” ou existência). Pode ficar em `services/paymentGatewayConfigService.ts` ou em `modules/payments/config/`. |
| **gatewayProvider (estendido)** | Receber contexto `{ billingType: 'saas' | 'crm', tenantId?: string }`. **billingType 'saas'** = cobrança de planos (tenant_billing) → config global. **billingType 'crm'** = cobrança ao cliente do CRM (invoices) → config do tenant (exige tenantId). 1) Mapear billingType + tenantId para a config (global ou tenant); 2) Obter gateway_key e credentials; 3) Instanciar o adapter com essa config e retornar PaymentGateway. Cache por (billingType, tenantId) para não recarregar a cada request. |
| **Módulo Asaas (adaptação)** | Em vez de ler apenas env, permitir criar instância “configurada” a partir de um objeto de config (api_key, env/base_url). Ex.: `getAsaasGateway(config?: AsaasConfig): PaymentGateway | null`. Se config não for passada, fallback para env (compatibilidade). Assim o gatewayProvider pode passar a config lida do banco. |

### 4.3 Fluxo de dependências (após mudanças)

```
Controller (Super Admin ou Tenant)
  → paymentGatewayConfigService (ler/gravar configs)
  → gatewayProvider.getActiveGateway({ billingType, tenantId })
       → paymentGatewayConfigService.getActiveConfig(billingType, tenantId)
       → módulo asaas.getAsaasGateway(config)  [ou stripe, etc.]
  → PaymentGateway.createCharge / createCustomer / getPayment
```

- Nenhum controller chama o módulo Asaas diretamente; todos usam o gateway via gatewayProvider.
- Webhooks continuam por gateway (ex.: POST /webhooks/asaas); o handler usa o módulo Asaas; a identificação “qual conta” pode ser por API key no header ou por tenant/customer no payload, conforme o provedor.

---

## 5) Fluxo de resolução do gateway (billingType: saas vs crm)

### 5.1 Semântica do contexto (billingType)

O **gatewayProvider** usa **billingType** para decidir qual configuração usar:

- **billingType = 'saas'**: cobrança de planos das empresas (tenant_billing). Sempre usa config **global** (scope = 'global'). Ex.: Super Admin gera cobrança para o tenant → `getActiveGateway({ billingType: 'saas' })`.
- **billingType = 'crm'**: cobrança ao cliente do CRM (invoices). Usa config do **tenant** que está emitindo a fatura; **tenantId** é obrigatório. Ex.: `getActiveGateway({ billingType: 'crm', tenantId: req.tenant.id })`.

Assim o caller não precisa conhecer “scope” ou “global/tenant”; apenas informa o tipo de cobrança (saas ou crm) e, no caso crm, o tenantId.

### 5.2 Algoritmo sugerido (getActiveGateway)

1. Se `context?.billingType === 'crm'` e `context.tenantId`:
   - Buscar config ativa para (scope = 'tenant', tenant_id = context.tenantId).
   - Se existir, instanciar gateway com essa config e retornar.
2. Se `context?.billingType === 'saas'` ou não houver config de tenant:
   - Buscar config ativa global (scope = 'global').
   - Se existir, instanciar gateway com essa config e retornar.
3. Fallback (opcional, apenas para não quebrar deploy atual): se não houver nenhuma config no banco e billingType for 'saas', para gateway_key asaas usar variáveis de ambiente (ASAAS_API_KEY, ASAAS_ENV) como “config implícita”.
4. Se nada for encontrado, retornar `null`; o caller trata “nenhum gateway configurado”.

### 5.3 Cache

- Cache em memória por chave `(billingType, tenantId ?? 'global')` com TTL curto ou invalidação ao salvar config, para evitar ler banco em toda chamada a createCharge/createCustomer.

---

## 6) Rotas necessárias

### 6.1 Super Admin (configuração global)

| Método | Rota sugerida | Descrição |
|--------|----------------|-----------|
| GET | `/api/superadmin/payment-gateway` ou `/api/superadmin/settings/payment-gateway` | Retornar config ativa global (gateway_key, display_name, máscara de credencial; sem expor API key). |
| PUT ou POST | `/api/superadmin/payment-gateway` | Salvar/atualizar config global (ex.: gateway_key = asaas, api_key, env). Apenas Super Admin. |

- Autenticação: middleware superadmin existente.

### 6.2 Tenant (configuração por empresa)

| Método | Rota sugerida | Descrição |
|--------|----------------|-----------|
| GET | `/api/me/tenant/payment-gateway` ou `/api/settings/payment-gateway` | Retornar config ativa do tenant (se houver). Escopo do tenant vem do JWT/sessão. |
| PUT ou POST | `/api/me/tenant/payment-gateway` ou `/api/settings/payment-gateway` | Salvar/atualizar config do tenant. Protegido por tenant auth. |

- Só expor rotas de tenant quando a feature “cobrança ao cliente do CRM” estiver no escopo; até lá, apenas as rotas Super Admin já atendem o objetivo de “configurar gateway para cobrar planos”.

### 6.3 Outras

- **Webhooks:** manter `POST /webhooks/asaas`. Se no futuro houver múltiplas contas Asaas (global + por tenant), o webhook pode precisar identificar a conta pelo payload (ex.: custom_id ou customer) e rotear para o handler correto; isso pode ficar para fase posterior.
- Com a tabela **payment_gateways**, uma rota GET (ex.: `/api/superadmin/payment-gateways` ou `/api/payment-gateways`) pode devolver a lista de gateways suportados (key, name, is_enabled) para popular o dropdown no front; ou o front pode usar lista fixa em v1.

---

## 7) Estrutura de telas no frontend

### 7.1 Super Admin

- **Onde:** área do Super Admin (ex.: menu “Configurações” ou “Sistema”).
- **Tela:** ex.: “Configurações → Pagamentos” ou “Configurações → Gateway de pagamento”.
  - Exibir gateway ativo atual (ex.: Asaas – Sandbox/Produção) com dados mascarados.
  - Formulário: escolher gateway (Asaas inicialmente), ambiente (sandbox/produção), API Key (campo senha). Botão “Testar conexão” (opcional) e “Salvar”.
- **Fluxo:** GET da config global; ao salvar, PUT/POST para a rota Super Admin. Não exibir API key em texto claro após salvar (apenas “••••••••” ou “Configurado”).

### 7.2 Tenant (empresa)

- **Onde:** Configurações da empresa (mesma área onde hoje está “Cobrança” / BillingSection).
- **Estrutura sugerida:** Configurações → **Pagamentos** (ou “Gateway de pagamento” em Integrações).
  - Subseção ou aba: “Gateway para cobrança de clientes” (ou “Faturas / CRM”).
  - Conteúdo: semelhante ao Super Admin (gateway, ambiente, API key), mas escopo do tenant.
- **BillingSection atual:** pode permanecer para “Métodos de pagamento” e “Histórico de faturas” do próprio tenant (cobranças que o SaaS faz à empresa). A **nova** tela/aba é para configurar como a empresa cobra **seus** clientes (futuro).

- Não criar tela de tenant até que o backend e a regra de negócio para “cobrança ao cliente do CRM” estejam definidos; o plano apenas reserva o lugar na estrutura (Configurações → Pagamentos / Integrações).

### 7.3 Resumo

| Nível | Local no frontend | Conteúdo |
|-------|-------------------|----------|
| Super Admin | Configurações do Super Admin → Pagamentos / Gateway | Formulário config global (gateway_key, env, API key). |
| Tenant | Configurações da empresa → Pagamentos (ou Integrações) | Formulário config do tenant (mesmo formato), quando feature estiver ativa. |

---

## 8) Compatibilidade com a arquitetura atual

- **gatewayProvider:** assinatura passa a usar `GatewayProviderContext` com **billingType** ('saas' | 'crm') e **tenantId** (obrigatório quando billingType = 'crm'). Durante a transição, manter `context` opcional; quando ausente, tratar como billingType 'saas' e fallback para env para Asaas global.
- **Módulo Asaas:** `getAsaasGateway()` pode passar a aceitar `getAsaasGateway(config?: AsaasConfig)`. Chamadas sem config continuam usando env; gatewayProvider, ao obter config do banco, chama com config.
- **createTenantCharge (tenantsController):** quando a config global existir, o fluxo pode ser estendido para: 1) getActiveGateway({ billingType: 'saas' }); 2) ensureCustomerForTenant(tenantId); 3) createCharge; 4) persistir em tenant_billing com gateway, asaas_payment_id, etc. Isso não exige mudar a estrutura da tabela tenant_billing.
- **Webhook Asaas:** continua recebendo eventos e atualizando tenant_billing por asaas_payment_id; não depende de “qual config” foi usada na criação, desde que o payment_id no evento seja o mesmo que está em tenant_billing.
- **superadmin_settings:** permanece para outras chaves (max_registrations, etc.); não é necessário migrar nada para a nova tabela de gateways.

---

## 9) Preparação para múltiplos gateways no futuro

- **gateway_key:** sempre usado (asaas, stripe, pagarme). O provider escolhe qual adapter instanciar a partir do gateway_key da config ativa.
- **Tabela de config:** já pensada para vários gateways (uma config ativa global por gateway_key, se a regra for “um gateway ativo por vez”; ou várias configs com is_active por gateway_key para “múltiplas contas”). Para “um gateway ativo por escopo”, pode existir uma única linha ativa com scope=global (gateway_key escolhido pelo admin) e, por tenant, uma linha ativa com scope=tenant.
- **Adapters:** cada gateway (Asaas, Stripe…) em seu próprio módulo; gatewayProvider faz um switch/map de gateway_key → função que retorna PaymentGateway (com config injetada). Novos gateways = novo módulo + registro no provider.
- **Webhooks:** cada gateway mantém seu endpoint (ex.: /webhooks/asaas, /webhooks/stripe); o handler já está isolado por provedor.
- **Frontend:** dropdown “Gateway” com as opções suportadas (lista pode vir da tabela **payment_gateways** via GET ou de constante); formulário pode ter campos específicos por gateway (ex.: Asaas: api_key + env; Stripe: secret_key + webhook_secret), alinhados a **credentials_schema** se existir.

---

## 10) Etapas de implantação

A implementação está dividida em etapas. Para iniciar uma etapa, diga **"ok etapa N"** (ex.: *ok etapa 1*).

Cada etapa pode ser feita e validada antes de passar à próxima. A ordem deve ser respeitada por causa das dependências.

---

### Etapa 1 — Banco de dados

**Objetivo:** Criar tabelas e seed para suportar configuração de gateways.

- [x] Migração: tabela **payment_gateways** (id, key, name, description, is_enabled, credentials_schema, sort_order, created_at, updated_at).
- [x] Migração: tabela **payment_gateway_configs** (id, scope, tenant_id, gateway_key, is_active, display_name, credentials JSONB, options JSONB, created_at, updated_at); CHECK scope/tenant_id; índices únicos parciais (uma ativa global por gateway_key, uma ativa por tenant por gateway_key).
- [x] Seed ou script: inserir em **payment_gateways** o registro Asaas (key = 'asaas', name = 'Asaas', is_enabled = true, credentials_schema conforme necessário).
- [x] Registrar migração(s) no `migrate.ts` e executar; validar schema.

**Entregável:** Banco com `payment_gateways` e `payment_gateway_configs` criados; Asaas no catálogo.

**Validação Etapa 1:** Arquivo `database/init/60_payment_gateway_configuration.sql` criado; migração registrada em `migrate.ts`; migração executada com sucesso.

---

### Etapa 2 — Backend: tipos, serviço de config e gatewayProvider

**Objetivo:** Tipos com billingType, serviço que lê/grava configs, e gatewayProvider resolvendo por billingType (com fallback para env).

- [x] **paymentGatewayTypes.ts:** estender `GatewayProviderContext` com `billingType: 'saas' | 'crm'` (tipo `BillingType`); manter `tenantId?: string` (obrigatório quando billingType = 'crm').
- [x] **paymentGatewayConfigService** (novo): getActiveConfig(billingType, tenantId?), getGlobalConfig() (credenciais mascaradas), saveGlobalConfig(), isGatewayKeyValid(); não expor credenciais em claro no retorno para o front (credentialsMasked).
- [x] **gatewayProvider:** aceitar `context?: { billingType, tenantId }`; mapear billingType 'saas' → config global, 'crm' → config tenant; buscar config via getActiveConfig; se não houver config no banco e billingType for 'saas', fallback para getAsaasGateway() (env); cache por (billingType, tenantId ?? 'global'); invalidateGatewayCache() exportado.
- [x] Build OK.

**Entregável:** Contexto com billingType; serviço de config; gatewayProvider que resolve por billingType e lê do banco (gateway ainda usa env até Etapa 3).

**Validação Etapa 2:** paymentGatewayTypes com BillingType e GatewayProviderContext; paymentGatewayConfigService em services/; gatewayProvider com cache e fallback env; build OK.

---

### Etapa 3 — Backend: módulo Asaas com config injetada

**Objetivo:** Asaas poder receber credenciais/opções da config (banco) em vez de só env.

- [x] **asaasTypes.ts (ou equivalente):** tipo `AsaasConfig` (api_key, env ou base_url).
- [x] **asaasClient:** permitir receber config (api_key, base_url) na chamada ou criar instância “configurável”; quando config não for passada, usar env (comportamento atual).
- [x] **asaasService:** `getAsaasGateway(config?: AsaasConfig)` — quando config é passada, usar para construir cliente/instância; quando não é, manter lógica atual (isConfigured() via env).
- [x] **gatewayProvider:** ao obter config do banco (payment_gateway_configs.credentials + options), mapear para AsaasConfig e chamar getAsaasGateway(config); remover ou ajustar cache para incluir instância por config.
- [x] Build e testes: getActiveGateway({ billingType: 'saas' }) com config salva no banco retorna gateway funcional usando credenciais do banco.

**Entregável:** Asaas operando com config vinda do banco; fallback para env quando config ausente.

**Validação Etapa 3:** asaasTypes.AsaasConfig; asaasClient/asaasService aceitam config opcional; gatewayProvider mapeia credentials → AsaasConfig e chama getAsaasGateway(asaasConfig); build OK.

---

### Etapa 4 — Rotas Super Admin (configuração global)

**Objetivo:** API para o Super Admin ler e salvar a config global do gateway.

- [x] **GET** `/api/superadmin/payment-gateway`: retorna config ativa global (gateway_key, display_name, options; credenciais mascaradas). Autenticação: middleware superadmin.
- [x] **PUT** `/api/superadmin/payment-gateway`: body (gateway_key, credentials, options, display_name); valida gateway_key em payment_gateways (is_enabled); upsert em payment_gateway_configs (scope = 'global'); invalida cache do gatewayProvider após salvar.
- [x] **GET** `/api/superadmin/payment-gateways`: lista payment_gateways (key, name, is_enabled) para dropdown no front.
- [x] Registrar rotas em superadminRoutes (GET/PUT payment-gateway, GET payment-gateways).

**Entregável:** Super Admin pode configurar e consultar o gateway global via API.

**Validação Etapa 4:** paymentGatewayConfigController (get/put payment-gateway, get payment-gateways); listGateways() no serviço; rotas em superadminRoutes com superadminAuth; build OK.

---

### Etapa 5 — Frontend Super Admin (tela de configuração)

**Objetivo:** Tela no painel do Super Admin para configurar o gateway de pagamento (billingType saas).

- [x] Menu/navegação Super Admin: entrada “Configurações” ou “Sistema” → **Pagamentos** (ou “Gateway de pagamento”).
- [x] Página/componente: exibir config atual (gateway, ambiente, “API key configurada” mascarada); formulário para gateway_key (dropdown com gateways suportados, ex.: da API ou constante), ambiente (sandbox/produção), API Key (campo senha); botão Salvar (chamar PUT/POST da Etapa 4).
- [ ] Opcional: botão “Testar conexão” (chamar endpoint que valida credenciais sem persistir).
- [x] Validação e feedback de sucesso/erro (toast).

**Entregável:** Super Admin configura o gateway pela tela; alterações refletidas na API e no gatewayProvider.

**Validação Etapa 5:** SuperAdminLayout grupo Configurações → Pagamentos; rota /superadmin/pagamentos; SuperAdminPagamentos (config atual + form); backend merge credenciais ao manter valor mascarado/vazio.

---

### Etapa 6 — Integrar createTenantCharge com o gateway

**Objetivo:** Ao criar cobrança no Super Admin, usar gateway configurado (banco ou env), criar cobrança no Asaas e persistir gateway/asaas_payment_id em tenant_billing.

- [x] **tenantsController.createTenantCharge:** após validar tenant/plano e calcular amount/due_date: 1) getActiveGateway({ billingType: 'saas' }); 2) se gateway existir, ensureCustomerForTenant(tenantId); 3) createCharge com idempotencyKey (ex.: billing_id ou composite); 4) INSERT/UPDATE em tenant_billing incluindo gateway, payment_method, asaas_payment_id, asaas_status (ex.: PENDING), idempotency_key; 5) retornar links (invoiceUrl, bankSlipUrl, etc.) no response quando aplicável.
- [x] Idempotência: antes de chamar createCharge, verificar se já existe tenant_billing com mesmo idempotency_key e asaas_payment_id preenchido; se sim, retornar cobrança existente.
- [x] Tratamento de erro: se gateway for null ou createCharge falhar, ainda assim permitir criar o registro em tenant_billing como pending (sem asaas_payment_id) ou retornar erro conforme regra de negócio.
- [x] Testes: criar cobrança pela rota Super Admin e conferir tenant_billing e, se config/Asaas ok, link de pagamento.

**Entregável:** Fluxo completo de cobrança SaaS usando config do banco (ou env); tenant_billing preenchido com dados do gateway.

**Validação Etapa 6:** createTenantCharge com idempotency_key (saas_tenantId_planId_dueDate); verificação de cobrança existente; getActiveGateway + ensureCustomerForTenant + createCharge; INSERT com gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key; resposta com invoiceUrl/bankSlipUrl quando aplicável; fallback para pending sem asaas_payment_id em caso de falha; getActiveAsaasConfigForSaas no gatewayProvider.

---

### Etapa 7 — Configuração por tenant (CRM billing) — futuro

**Objetivo:** Permitir que cada tenant configure seu próprio gateway para cobrar clientes (invoices). Só iniciar quando a feature “cobrança ao cliente do CRM” estiver no escopo.

- [x] Rotas: GET/PUT `/api/me/tenant/payment-gateway`, GET `/api/me/tenant/payment-gateways`; tenantId de req.tenantId (tenantAuth).
- [x] gatewayProvider: já suporta billingType 'crm' + tenantId; getActiveConfig('crm', tenantId) lê config do tenant.
- [x] Frontend tenant: Configurações → Integrações → **Pagamentos** (“Gateway para cobrança de clientes”); formulário análogo ao Super Admin.
- [x] Quando houver fluxo de cobrança de invoice no CRM: chamar getActiveGateway({ billingType: 'crm', tenantId }) e usar o gateway retornado (pronto para uso).

**Entregável:** Tenant pode configurar e usar seu próprio gateway para cobranças do CRM (a ser ligado ao fluxo de invoices quando existir).

**Validação Etapa 7:** getTenantConfig/saveTenantConfig no serviço; myTenantPaymentGatewayController (GET/PUT payment-gateway, GET payment-gateways); rotas em myTenantPlanRoutes; PaymentGatewaySection em Configurações → Integrações → Pagamentos; build OK.

---

## 11) Resumo e referência rápida

| Item | Recomendação |
|------|--------------|
| **Banco** | Tabelas **payment_gateways** e **payment_gateway_configs** (credentials JSONB); seed Asaas (Etapa 1). |
| **Backend** | billingType no contexto; serviço de config; gatewayProvider por billingType; Asaas com config injetada (Etapas 2–3). Rotas Super Admin (Etapa 4). Integração createTenantCharge (Etapa 6). |
| **Frontend** | Tela Super Admin Configurações → Pagamentos (Etapa 5). Tela tenant (Etapa 7, futuro). |
| **Compatibilidade** | Fallback para env (billingType 'saas') quando não houver config no banco. |

**Para iniciar:** diga **"ok etapa 1"**, **"ok etapa 2"**, etc., conforme a etapa desejada.
