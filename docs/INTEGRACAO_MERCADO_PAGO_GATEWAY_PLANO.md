# Plano de integração — Mercado Pago como gateway multi-gateway (PainelCRM)

**Escopo desta etapa:** diagnóstico, validação de arquitetura e plano por fases. **Nenhuma implementação** foi feita neste documento.

**Objetivo de produto:** adicionar **Mercado Pago** como gateway **independente**, ao lado do **Asaas**, com OAuth (quando aplicável), cobranças e webhooks próprios — **sem quebrar, alterar ou regredir** a integração Asaas já em produção.

---

## 0. Política crítica: não regressão do Asaas (obrigatória)

Esta seção prevalece sobre qualquer outra: a implantação do Mercado Pago **não pode** degradar o Asaas.

### 0.1 Congelamento funcional do Asaas

| Área | Regra |
|------|--------|
| Conexão / UI Asaas | Não alterar o fluxo funcional atual de conexão, teste e reconfiguração de webhook Asaas. |
| Payload webhook Asaas | Não alterar o payload enviado à API Asaas na criação/recriação de webhook (campos, `events`, `apiVersion`, etc.) salvo correção de bug **isolada** ao Asaas, com teste de regressão explícito. |
| Validação webhook Asaas | Não alterar validação do handler Asaas (`asaas-access-token`, idempotência, delegação ao core). |
| Endpoints Asaas | Não alterar contratos de `/api/integrations/asaas/*` nem remover aliases de `/api/webhooks/asaas` / `/webhooks/asaas`. Refatorações internas só se **sem mudança de contrato** e com checklist de regressão. |
| `payment_gateway_configs` | Não remover nem renomear colunas usadas pelo Asaas. Linhas com `gateway_key = 'asaas'` não devem ser migradas apagando dados; migrations só **incrementais** e compatíveis. |
| `payment_events` | Eventos Asaas continuam com `gateway = 'asaas'`. |

### 0.2 Isolamento do Mercado Pago

| Área | Regra |
|------|--------|
| Código | **Services, client HTTP, OAuth, parser de webhook** dedicados em `modules/gateways/mercado_pago/` (ou equivalente). **Não reutilizar** `asaasIntegrationService`, `asaasClient` ou parsers Asaas para lógica MP. |
| Rotas | Apenas: `/api/integrations/mercado-pago/*` e `POST /api/webhooks/mercado-pago` (mais aliases espelhando padrão Asaas **só se necessário**, sem desviar tráfego Asaas). |
| Camadas genéricas | Reutilizar somente o que já é multi-gateway: `payment_events`, `webhookCore` + `registerGatewayParser`, `paymentDomainService`, `statusNormalizer` (**extensão** por `gateway_key`), colunas `gateway` / `gateway_reference_id` / `gateway_metadata` / `gateway_status`. |
| Identificador | Todo registro lógico do MP usa `gateway_key` / coluna `gateway` = **`mercado_pago`** (valor fixo; não misturar com `asaas`). |

**Extensões em código compartilhado** (`gatewayResolver`, `statusNormalizer`, orquestração de cobrança): devem ser **aditivas** — ramo `mercado_pago` ou critério por `gateway_key` — mantendo o comportamento atual quando `gateway_key === 'asaas'`. Onde hoje o código assume só Asaas, preferir **branch explícita** `if (gatewayKey === 'mercado_pago')` em vez de mudar o default usado pelo Asaas.

### 0.3 Banco de dados

- Preferir `payment_gateway_configs`, `customer_invoices`, `tenant_billing`, `payment_events`.
- Migrations: **incrementais**; **não** renomear colunas; **não** alterar constraints sem auditoria de impacto no Asaas; **não** apagar ou reescrever dados de tenants que usam Asaas.
- Reuso de colunas de webhook em `payment_gateway_configs` para MP é permitido **desde que** linhas Asaas continuem com a mesma semântica; documentar mapeamento MP ↔ colunas (ex.: secret de assinatura) sem sobrescrever uso Asaas na mesma linha (cada linha é por `gateway_key`).

### 0.4 Frontend

- Tela de pagamentos: permitir **alternar** entre Asaas e Mercado Pago (quando flag ativa — ver §0.5).
- **Card/fluxo Asaas:** permanece como está; **não** substituir pela lógica MP.
- **Mercado Pago:** componente dedicado ou ramo isolado (`MercadoPagoGatewaySection` / rota filha), sem misturar estado nem mensagens de status entre gateways.

### 0.5 Feature flag (recomendada)

Variável de ambiente:

```env
MERCADO_PAGO_GATEWAY_ENABLED=true
```

Comportamento quando **`false`** (default sugerido em produção até go-live):

- Não listar / não exibir Mercado Pago na UI de pagamentos.
- Rotas `/api/integrations/mercado-pago/*` e webhook MP: retornar **404** ou `{ error: 'disabled', code: 'MERCADO_PAGO_DISABLED' }` **sem** tocar em rotas Asaas.
- Seed do catálogo `payment_gateways` pode inserir `mercado_pago` com `is_enabled = false` até a flag ligar, evitando seleção acidental.

Quando **`true`:** habilitar UI, rotas e registro no catálogo conforme fases abaixo. **Asaas não depende desta flag.**

### 0.6 Gateway ativo e tenants existentes

- O **gateway ativo** do tenant (config já existente) determina o provider na criação de cobrança.
- **Não** migrar automaticamente tenants Asaas para Mercado Pago.
- Mercado Pago só entra em uso após o usuário **conectar** e **selecionar** explicitamente esse gateway (salvar config ativa).

### 0.7 Webhooks: rotas separadas

| Gateway | Rota principal (manter) |
|---------|-------------------------|
| Asaas | `/api/webhooks/asaas` (e aliases já existentes, ex.: `/webhooks/asaas`) |
| Mercado Pago | **`/api/webhooks/mercado-pago`** (novo) |

Cada handler valida **sua própria** autenticação/assinatura. Eventos em `payment_events`: `gateway = 'asaas'` ou `gateway = 'mercado_pago'`.

### 0.8 Testes de regressão obrigatórios (Asaas)

Executar **antes e depois** de cada fase que toque código compartilhado:

- [ ] Status / tela Asaas carrega normalmente.
- [ ] Testar conexão Asaas funciona.
- [ ] Reconfigurar webhook Asaas funciona.
- [ ] Criação de cobrança com tenant Asaas funciona.
- [ ] Webhook Asaas processa eventos e atualiza faturas / `tenant_billing`.
- [ ] `payment_events` continua registrando `gateway = 'asaas'` para esses eventos.
- [ ] Nenhum erro novo nos logs nos fluxos acima.

---

## 1. Diagnóstico da arquitetura atual (código)

### 1.1 Modelo de dados

| Área | O que existe hoje | Observação para MP |
|------|-------------------|---------------------|
| Catálogo | `payment_gateways` (`key`, `name`, `is_enabled`, `credentials_schema`, …) | Seed atual inclui só `asaas` (`database/init/60_payment_gateway_configuration.sql`). MP: novo registro com **`gateway_key` = `mercado_pago`** (valor fixo; não usar outro slug sem revisão). |
| Config por tenant/global | `payment_gateway_configs` (`scope`, `tenant_id`, `gateway_key`, `credentials` JSONB, `options` JSONB, `is_active`, `status`, métodos de pagamento, …) | Uma linha **ativa** por `(tenant_id, gateway_key)` quando `is_active = true`. |
| Metadados de webhook | Mesmas colunas em `payment_gateway_configs` (origem Asaas; `database/init/173_asaas_webhook_auto_config_fields.sql`) | **Por linha:** linha `gateway_key = 'asaas'` mantém semântica Asaas. Linha `mercado_pago` pode reutilizar colunas (ex.: `webhook_auth_token` = secret HMAC do painel MP) **sem alterar** leitura/escrita Asaas. Não remover campos. |
| Faturas CRM | `customer_invoices`: `gateway`, `gateway_reference_id`, `gateway_metadata`, `gateway_status` (+ colunas legadas conforme migrações) | `gateway_reference_id` é o ID usado no webhook e lookups (`webhookCore`). Para Checkout Pro, pode ser `payment_id`; preferência pode ir em `gateway_metadata`. |
| Billing SaaS | `tenant_billing`: mesmas colunas genéricas | Mesmo padrão de webhook (`findBillingOrCustomerInvoice`). |
| Idempotência | `payment_events` (`gateway`, `event_id`, `reference_id`, `payload`, `processed`, …) — `UNIQUE (gateway, event_id)` (`database/init/73_gateway_payment_generic_columns.sql`) | **Obrigatório** definir `event_id` estável e único por notificação MP (ex.: combinação documentada de `data.id` + `x-request-id` ou id retornado pela API de notificações — verificar doc). |
| Debug opcional | `payment_webhook_events` (`database/init/62_payment_webhook_events_phase5.sql`) | Opcional para painel de eventos. |

### 1.2 Camada de gateway (criação de cobrança)

- **Registry:** `packages/backend/src/modules/payments/gatewayRegistry.ts` — hoje só registra `asaas` via `registerGateway('asaas', …)`.
- **Resolver:** `packages/backend/src/modules/payments/gatewayResolver.ts` — carrega `getActiveConfig`, depois **só instancia o gateway se** `credentials.api_key` for string não vazia. **Isso não serve para Mercado Pago OAuth**, que usará tipicamente `access_token` (e refresh). **Ajuste necessário** na fase de implementação: critério de “credencial presente” por `gateway_key` ou campo genérico `credentials.access_token`.
- **Provider:** `packages/backend/src/modules/payments/gatewayProvider.ts` — invalidação de cache; `getActiveAsaasConfigForSaas` é **específico Asaas** (SaaS).
- **Tipos:** `packages/backend/src/modules/payments/paymentGatewayTypes.ts` — contrato `PaymentGateway` (create customer, create charge, cancel, get payment, etc.). MP Checkout Pro pode mapear `createCharge` para “criar preferência + retornar URL”, estendendo `CreateChargeResult` ou usando `gateway_metadata` para `init_point` / `preference_id`.

### 1.3 Webhooks (pipeline único multi-gateway)

- **Orquestração:** `packages/backend/src/modules/payments/webhook/webhookCore.ts`
  - `registerGatewayParser(gatewayKey, parser)`
  - Fluxo: `parser.parsePayload` → `insertPaymentEvent` (idempotência) → resolve tentativa (`customer_invoice_payment_attempts` / `tenant_billing_payment_attempts`) ou entidade legada → `normalizeGatewayStatus` → `applyPaymentEvent` / `applyPaymentAttemptEvent` em `paymentDomainService.ts`.
- **Parser Asaas:** `packages/backend/src/modules/gateways/asaas/webhooks/asaasWebhookParser.ts` — extrai `eventId`, `referenceId` (= payment id), `externalStatus`.
- **Normalização:** `statusNormalizer.ts` — mapeamento explícito para `asaas` **permanece intacto**. Adicionar **somente** ramo `mercado_pago` para status MP → `InternalPaymentStatus`, sem alterar enum/contratos sem revisão de constraints.
- **Domínio:** `paymentDomainService.ts` — fluxo genérico permanece; efeitos colaterais específicos Asaas (ex.: cancelar outras cobranças no gateway) devem continuar **condicionados** a `gateway_key === 'asaas'` ou a dados da tentativa, de forma que MP não dispare lógica Asaas indevida. `billingGatewayChargeService.ts`: estender com ramos MP **sem** mudar regras de delete Asaas.

### 1.4 Rotas e integrações atuais

- **Tenant config:** `GET/PUT /api/me/tenant/payment-gateway`, teste, listagem — `myTenantPaymentGatewayController.ts`. Webhook URL exposta como `${PUBLIC_API_URL || host}/webhooks/${gateway_key}` — **alinhar** com padrão `/api/webhooks/...` se for o padrão desejado para MP (hoje Asaas também usa `/webhooks/asaas` e aliases em `index.ts`).
- **Asaas integração:** `POST/GET …` em `/api/integrations/asaas/*` — `asaasIntegrationRoutes.ts` + `asaasIntegrationService.ts`.
- **Webhook Asaas:** `/webhooks/asaas` e `/api/webhooks/asaas` — `asaasWebhookRoutes.ts` + `asaasWebhook.ts`.

### 1.5 Frontend

- **Configurações > Pagamentos:** `PaymentGatewaySection.tsx` — manter fluxo Asaas; adicionar **UI isolada** para MP (componente próprio ou seção condicional à flag + `gateway_key`), com alternância clara entre gateways **sem misturar** estado.
- **Seleção de gateway ativo:** via `PUT /api/me/tenant/payment-gateway` com `gateway_key` (uma config ativa por tenant na lógica atual).

### 1.6 Lacuna importante: criptografia de credenciais

O pedido do produto exige **nunca salvar token em texto puro**. No código atual, `credentials` é persistido como **JSONB** em `payment_gateway_configs` via `saveTenantConfig`; **não foi encontrado** uso de criptografia de campo no `paymentGatewayConfigService.ts` (busca por encrypt/AES não retorna matches). O plano de MP deve incluir **Fase 0/1**: definir estratégia (KMS, `pgcrypto`, libsodium com chave em env, ou cofre externo) e migrar de forma **compatível** (leitura legada + re-encrypt).

---

## 2. Mercado Pago — documentação oficial (resumo para o plano)

> **Nota:** URLs e detalhes mudam por país (.com.br / .com.ar) e por produto; na implementação, fixar links da documentação **pt-BR** vigente e validar em conta de testes.

### 2.1 OAuth 2.0

- **Conceito:** OAuth permite obter `access_token` (e em muitos fluxos `refresh_token`) em nome do vendedor, sem embedar `client_secret` no front.
- **Documentação:** [Segurança — OAuth](https://www.mercadopago.com.br/developers/pt/docs/security/oauth) e fluxo de criação/autorização (ex.: [Criação — OAuth](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/additional-content/security/oauth/creation)).
- **Pontos a validar na implementação:**
  - URL de autorização (domínio `auth.mercadopago...` conforme país).
  - Uso de **PKCE** (`code_challenge` / `code_verifier`) se exigido pela aplicação criada no painel MP.
  - Endpoint de troca de código: típico `POST https://api.mercadopago.com/oauth/token` com `client_id`, `client_secret`, `code`, `redirect_uri` e parâmetros PKCE quando aplicável.
  - **Validade** do `access_token` e política de **refresh** (documentação oficial de “Renovar Access Token”).
  - **Escopos** mínimos para: criar preferências/checkout, ler pagamentos, gerenciar notificações se houver API.

**Possibilidade real de OAuth no PainelCRM:** **Sim**, é o fluxo recomendado para apps que conectam contas de terceiros. Pré-requisitos: aplicação criada no painel MP, `redirect_uri` cadastrada **exatamente** igual à usada no backend, e armazenamento seguro de tokens.

### 2.2 Pagamentos / Checkout Pro (MVP sugerido)

- **Preferência (Checkout Pro):** API de **Preferences** — retorna `init_point` / `sandbox_init_point`, `id` da preferência.
- **Campos úteis:** `external_reference` (mapear para `invoice_id` ou `attempt_id` — **definir contrato**), `metadata`, `notification_url` (URL pública HTTPS do PainelCRM).
- **Documentação:** área Checkout Pro / notificações de pagamento no portal de desenvolvedores.

**Encaixe no modelo atual:** o tipo `CreateChargeResult` hoje prevê `paymentId`, URLs de boleto/PIX. Para MP, o MVP pode retornar:
- `paymentId` = id do **pagamento** quando existir, ou temporariamente id da **preferência** até o primeiro pagamento (preferível gravar ambos em `gateway_metadata` e padronizar `gateway_reference_id` como id que o webhook sempre menciona — normalmente **payment id**).

### 2.3 Webhooks e notificações

- **Webhooks** são o canal recomendado (IPN legado — ver doc — tem limitações).
- **Validação:** documentação descreve uso de cabeçalho **`x-signature`** (ex.: componentes `ts` e `v1`) e **`x-request-id`**, com **HMAC-SHA256** usando **secret** configurado no painel “Suas integrações”. Referência: [Webhooks — Notificações](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks) (ajustar locale no path se necessário).
- **Confiabilidade:** o payload pode conter apenas **tipo + id**; a prática recomendada é **consultar o recurso na API** (`GET /v1/payments/:id` ou recurso indicado) com o `access_token` do tenant antes de atualizar fatura interna — alinhado ao requisito do produto.

### 2.4 Webhook “automático” via API

- Na documentação voltada a integradores, a configuração principal de URL/secret costuma ser no **painel** (“Suas integrações” → Webhooks). Em vários fluxos, também é possível enviar `notification_url` na **criação da preferência/pagamento**.
- **Conclusão para o plano:** não assumir paridade com Asaas (`POST /webhooks` no provedor). **Fase 1:** suportar `notification_url` por cobrança + documentação para o operador configurar webhook global no painel MP; **Fase 2:** pesquisar se existe endpoint REST estável de “criar assinatura de webhook” para a aplicação (se existir e for suportado na conta BR do produto, implementar).

### 2.5 Ambientes

- **Credenciais de teste vs produção** no painel; `sandbox_init_point` vs `init_point`.
- **OAuth** e **usuários de teste** — seguir guia oficial de testes.

---

## 3. Arquitetura desejada (alvo)

### 3.1 Princípios

1. **`gateway_key` novo** (ex.: `mercado_pago`), convivendo com `asaas` no mesmo catálogo.
2. **Uma config ativa por tenant** (já é o padrão do `getActiveConfig` para CRM) — o tenant “escolhe” o gateway ativo ao salvar `payment_gateway` com aquele `gateway_key`.
3. **Implementação isolada:** `modules/gateways/mercado_pago/` (client HTTP, OAuth service, mapper, webhook parser, optional preference service).
4. **Webhook:** rota dedicada `POST /api/webhooks/mercado-pago` (e alias `/webhooks/mercado-pago` se necessário para compatibilidade), registrando parser `registerGatewayParser('mercado_pago', …)` **no bootstrap** (mesmo padrão Asaas).
5. **Idempotência:** reutilizar `payment_events`; definir `event_id` único por notificação MP.
6. **Status:** estender `normalizeGatewayStatus` sem alterar enum interno sem revisão de constraints.

### 3.2 OAuth (backend)

Endpoints alvo (conforme especificação do produto):

| Método | Rota | Função |
|--------|------|--------|
| GET | `/api/integrations/mercado-pago/connect-url` | Gera URL de autorização + `state` assinado (HMAC) com `tenant_id` + `user_id` + expiração. |
| GET | `/api/integrations/mercado-pago/callback` | Valida `state`, troca `code` por tokens, persiste credenciais **criptografadas**, `status=active`, redireciona ao front com flag de sucesso/erro. |
| POST | `/api/integrations/mercado-pago/test` | Chama endpoint leve MP (ex.: `/users/me` ou recurso oficial) para validar token. |
| GET | `/api/integrations/mercado-pago/status` | Status consolidado (ambiente, expiração, webhook configurado, último erro). |
| POST | `/api/integrations/mercado-pago/disconnect` | Limpa tokens locais, `status=disabled` ou remove credenciais, **sem apagar** `payment_events` / histórico. |

**Variáveis de ambiente (exemplo):**

- `MERCADO_PAGO_GATEWAY_ENABLED` (`true` | `false`) — ver §0.5
- `MERCADO_PAGO_CLIENT_ID`
- `MERCADO_PAGO_CLIENT_SECRET`
- `MERCADO_PAGO_REDIRECT_URI` (deve coincidir com app MP)
- `MERCADO_PAGO_OAUTH_STATE_SECRET` (para assinar `state`)
- `PUBLIC_API_URL` (HTTPS público para `notification_url` e documentação)

**Segurança:** nunca logar tokens completos; logs com comprimento e hash parcial se necessário.

### 3.3 Cobrança (MVP)

- **Serviços sugeridos:** `mercadoPagoPaymentService.createCustomerInvoicePayment` / `createTenantBillingPayment` encapsulando:
  - resolução de `access_token` do tenant (com refresh proativo);
  - criação de **Preference** Checkout Pro;
  - persistência de `gateway_reference_id` + `gateway_metadata` (`preference_id`, `init_point`, etc.).
- **Integração com fluxo existente:** no ponto único de criação de cobrança, **branch** por gateway ativo: se `asaas`, caminho atual **inalterado**; se `mercado_pago`, chamar service MP (Checkout Pro / preferência). **Adapter** explícito; não substituir implementação Asaas.

### 3.4 Webhook

- Handler dedicado: validar assinatura → enfileirar/processar assíncrono se necessário → responder 200 rápido **após** persistir `payment_events` (padrão atual do core espera resultado síncrono; avaliar `setImmediate` como Asaas se MP exigir).
- **Sempre** consultar API de pagamento antes de `applyPaymentEvent`.
- Atualizar `last_webhook_received_at` / `last_webhook_error` em `payment_gateway_configs` (reuso das colunas Asaas).

### 3.5 Parser

- Arquivo: `mercadoPagoWebhookParser.ts` — extrair `eventId`, `referenceId` (payment id), `externalStatus` (após GET payment), `metadata`.
- Registrar em `registerGatewayParser('mercado_pago', …)` no mesmo local onde Asaas registra.

---

## 4. Persistência e migrations

### 4.1 Reuso sem migration

- `credentials` / `options` JSONB já comportam `access_token`, `refresh_token`, `expires_at`, `public_key`, `user_id`, `scope`.
- Colunas de webhook em `payment_gateway_configs` podem ser reutilizadas; **documentar** mapeamento campo a campo.

### 4.2 Migrations incrementais possíveis

1. **Seed** `payment_gateways`: inserir `mercado_pago` com `credentials_schema` documentando campos OAuth.
2. **Opcional:** `payment_gateway_configs.gateway_metadata JSONB` se `options` ficar sobrecarregado.
3. **Opcional:** tabela `mercado_pago_oauth_states` (state, tenant_id, user_id, expires_at) se não quiser apenas state assinado stateless.
4. **Criptografia:** coluna `credentials_enc` ou serviço de envelope encryption — **decisão arquitetural** antes de tokens em produção.

---

## 5. Entrega segura por fases (oficial)

Esta é a sequência aprovada para implementação; cada fase fecha com **checklist de regressão Asaas** (§0.8).

### Fase 1 — Documento técnico e investigação

- Conteúdo: este plano + contratos (`gateway_key`, `external_reference`, idempotência `event_id` MP).
- **Sem alteração** de fluxo Asaas nem de código produtivo (salvo correções urgentes não relacionadas a MP).

### Fase 2 — Estrutura isolada Mercado Pago + OAuth / status

- Backend: módulo `mercado_pago` (client, OAuth service, rotas `/api/integrations/mercado-pago/*` protegidas pela flag §0.5).
- Persistência: credenciais MP na linha `gateway_key = 'mercado_pago'` (criptografia conforme decisão §1.6).
- Seed catálogo: `mercado_pago` (pode nascer `is_enabled = false` até go-live).
- **Sem** criação de cobrança ainda; **sem** webhook MP ainda.
- **Gate:** regressão Asaas §0.8.

### Fase 3 — Criação de cobrança via Mercado Pago

- Service dedicado (Checkout Pro / preferência); branch por **gateway ativo**; tenant Asaas **inalterado**.
- `gatewayResolver` / registry: instanciar gateway MP **sem** mudar critério Asaas.
- **Gate:** regressão Asaas §0.8 + teste MP sandbox (apenas tenants que optaram por MP).

### Fase 4 — Webhook Mercado Pago + normalização

- `POST /api/webhooks/mercado-pago`; validação `x-signature`; consulta API de pagamento; parser; `payment_events` com `gateway = 'mercado_pago'`.
- `statusNormalizer`: **apenas** ramo `mercado_pago` (§0.2).
- Ajustes finos em `billingGatewayChargeService` / pós-pagamento: **condicionais** por gateway (§3.1).
- **Gate:** regressão **completa** Asaas §0.8 + suíte MP.

### Detalhamento técnico interno (referência, não substitui fases acima)

| Sub-etapa | Notas |
|-----------|--------|
| Frontend MP | Card “Conectar Mercado Pago”, OAuth redirect, status; **componente isolado**; respeitar flag. |
| Cancelamento / limpeza MP | Regras específicas MP (não reaproveitar delete Asaas). |
| Hardening | Rate limit OAuth/callback, refresh token, observabilidade, e2e sandbox. |

---

## 6. Impactos nos fluxos existentes (mitigação)

Qualquer mudança em arquivos compartilhados deve ser **mínima e aditiva**:

| Área | Impacto | Mitigação |
|------|---------|-----------|
| `gatewayResolver` | Precisa reconhecer credenciais MP | Branch `mercado_pago` apenas; ramo Asaas idêntico ao atual. |
| `gatewayRegistry` | Registrar factory MP | `registerGateway('mercado_pago', …)` **adicional**; não alterar registro Asaas. |
| `statusNormalizer` | Mapear status MP | Novo `if (gatewayKey === 'mercado_pago')`; bloco Asaas **sem edição** de regras. |
| `paymentDomainService` / billing cleanup | Risco de efeito cruzado | Condições explícitas por `gateway` da tentativa/invoice. |
| Rotas | Nova superfície | Somente rotas MP + flag; Asaas inalterado. |

---

## 7. Riscos

| Risco | Mitigação |
|-------|-----------|
| Regressão Asaas por refatoração “acidental” | Congelamento §0.1; PRs separados; checklist §0.8 obrigatório. |
| Token em claro no banco | Criptografia antes de OAuth MP em produção (§1.6). |
| `event_id` duplicado ou instável (MP) | Definir chave idempotente alinhada à doc + `x-request-id`. |
| `reference_id` / invoice | Contrato `external_reference` + GET payment antes de aplicar domínio. |
| Multi-país OAuth | URLs parametrizadas conforme app MP / doc BR. |
| Flag desligada mas rota exposta | 404 / disabled uniforme; testes automatizados. |

---

## 8. Checklist de validação (pós-implementação)

**Asaas (obrigatório em toda release que toque pagamentos):** §0.8.

**Mercado Pago (após Fase 4):**

- [ ] Flag `MERCADO_PAGO_GATEWAY_ENABLED=true`; catálogo e UI exibem MP.
- [ ] OAuth completa; tokens armazenados com política de segurança acordada.
- [ ] Preferência / pagamento sandbox; `external_reference` resolve entidade correta.
- [ ] Webhook: assinatura válida processa; inválida não altera invoice.
- [ ] `payment_events` com `gateway = 'mercado_pago'`; idempotência verificada.
- [ ] `PUBLIC_API_URL` HTTPS em produção para notificações.
- [ ] Runbook: configuração de URL/secret no painel MP se aplicável.

---

## 9. Referências de código (âncoras)

- Registry Asaas: `packages/backend/src/modules/payments/gatewayRegistry.ts`
- Resolver (critério `api_key`): `packages/backend/src/modules/payments/gatewayResolver.ts`
- Webhook core: `packages/backend/src/modules/payments/webhook/webhookCore.ts`
- Idempotência: `packages/backend/src/modules/payments/webhook/paymentEventsService.ts`
- Normalização (só Asaas hoje): `packages/backend/src/modules/payments/webhook/statusNormalizer.ts`
- Schema gateway + seed: `database/init/60_payment_gateway_configuration.sql`
- Colunas genéricas + `payment_events`: `database/init/73_gateway_payment_generic_columns.sql`
- Webhook columns config: `database/init/173_asaas_webhook_auto_config_fields.sql`

---

## 10. Próximo passo

1. **Aprovação** explícita deste plano (incluindo §0 — não regressão Asaas e feature flag).
2. Decisão sobre **criptografia** de credenciais para tokens MP (antes de OAuth em produção).
3. Iniciar **Fase 2** em branch dedicada: estrutura isolada + OAuth/status, flag desligada em produção até validação; **nenhuma** alteração em payload/validação/endpoints Asaas.
4. Ao concluir cada fase: executar **§0.8** e registrar evidências (manual ou automatizado).
