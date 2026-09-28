# Plano de ação — Customer Billing: validações, gateway e pré-condições

**Objetivo:** Planejar a execução das correções e evoluções do Customer Billing de forma segura, escalável e organizada, sem implementar código ou migrations neste documento.

**Referências:**  
- `docs/DIAGNOSTICO-CUSTOMER-BILLING-GATEWAY-E-VALIDACOES.md`  
- `docs/PLANO-CUSTOMER-BILLING-FATURAS-TENANT.md`  
- `docs/VALIDACAO-FINAL-PRE-IMPLEMENTACAO-CUSTOMER-BILLING.md`

---

## Contexto e problemas identificados

| Problema | Descrição |
|----------|-----------|
| Faturas sem cobrança | Faturas criadas no sistema mas cobrança não gerada no gateway (Asaas). |
| Gateway opcional | Sistema não bloqueia quando não há config ativa para CRM; fluxo é ignorado silenciosamente. |
| Erros engolidos | Try/catch em `createManualInvoice` apenas faz `console.error`; usuário recebe sucesso sem `paymentUrls`. |
| CPF/CNPJ ausente | Tabela `clients` não possui `cpf_cnpj`; Asaas pode exigir documento para cobrança. |
| Frontend sem validação | Formulário de nova fatura não valida pré-condições antes de enviar o POST. |

**Evoluções desejadas:**

- Impedir criação de faturas inválidas (cliente sem documento; gateway não configurado).
- Integração obrigatória com gateway para faturas manuais (não criar fatura se não for possível cobrar).
- Fluxo de validação antes da criação (preconditions) — backend e endpoint para o frontend.
- Preparar para escala e múltiplos gateways (abstração, configuração por tenant, reuso do Billing Engine).

---

## 1) Divisão em fases

### Visão geral

| Fase | Nome | Objetivo principal |
|------|------|--------------------|
| **1** | Validações e segurança (backend) | Schema e regras para CPF/CNPJ; função de pré-condições; bloquear criação quando inválido. |
| **2** | Correções de integração com gateway | Gateway obrigatório; propagar erros; enviar CPF/CNPJ ao Asaas; evitar faturas órfãs. |
| **3** | Endpoint de preconditions | GET para o frontend consultar status das validações (checklist). |
| **4** | Frontend (UX e popup) | Modal de pré-requisitos; botão Continuar condicional; links para editar cliente / configurar gateway. |
| **5** | Melhorias futuras / extensões | Múltiplos gateways, retry, observabilidade, compatibilidade com subscription billing. |

---

### Fase 1 — Validações e segurança (backend)

**Objetivo:** Garantir que o backend não crie faturas quando cliente não tiver CPF/CNPJ ou quando o gateway não estiver configurado. Introduzir a noção de “pré-condições” reutilizável.

**O que será implementado:**

- Migration: adicionar coluna `cpf_cnpj` em `clients` (TEXT NULL), com comentário e política de preenchimento (obrigatório apenas para cobrança; migração não altera dados existentes).
- Serviço/helper: função `validateInvoicePreconditions(tenantId, clientId)` que retorna:
  - `clientHasCpfCnpj: boolean`
  - `gatewayConfigured: boolean`
  - `ok: boolean` (ambos true)
  - `errors: string[]` (mensagens para API e frontend).
- Uso em `createManualInvoice`: chamar `validateInvoicePreconditions` **antes** de `createManualCustomerInvoice`; se `ok === false`, lançar erro HTTP (ex.: 400) com corpo estruturado (ex.: `{ code: 'PRECONDITION_FAILED', errors: [...] }`), sem criar fatura.

**Arquivos/serviços impactados:**

- Novo arquivo de migration (ex.: `database/init/72_clients_cpf_cnpj.sql`).
- `packages/backend/src/services/customerBillingService.ts` (nova função ou módulo de validação; chamada em `createManualInvoice`).
- Opcional: novo módulo `packages/backend/src/services/customerInvoicePreconditions.ts` para manter validações isoladas e testáveis.

**Riscos:**

- Clients já existentes sem `cpf_cnpj`: validação impedirá criação de fatura para eles até que o dado seja preenchido (comportamento desejado).
- Nenhum impacto em subscription billing (worker usa `createCustomerInvoice` para recorrência; pré-condições aplicam-se apenas ao fluxo manual, a menos que se decida estender depois).

---

### Fase 2 — Correções de integração com gateway

**Objetivo:** Tornar o gateway obrigatório para criação de fatura manual, propagar erros ao usuário e enviar CPF/CNPJ ao Asaas; evitar faturas “órfãs” (criadas sem cobrança) e garantir consistência entre sistema e gateway.

**Ordem do fluxo em `createManualInvoice` (obrigatória):**

1. **Validar preconditions** — chamar `validateInvoicePreconditions(tenantId, clientId)`; se `!ok`, retornar erro (ex.: 400) e **não** prosseguir.
2. **Obter gateway (obrigatório)** — `getActiveGateway({ billingType: 'crm', tenantId })`; se `null`, retornar erro (ex.: 400/503) com mensagem “Gateway de pagamento não configurado” e **não** prosseguir.
3. **Garantir customer no gateway** — obter dados do cliente (incluindo `cpf_cnpj`); `getPaymentCustomerForClient` ou `ensureCustomerForClient` com `cpfCnpj` no payload; em caso de falha, propagar erro ao cliente e **não** criar fatura.
4. **Criar cobrança no gateway** — `gateway.createCharge(...)` com idempotency key e externalReference (ex.: `tenant_{tenantId}_client_{clientId}_{dueDate}_{shortId}` ou esquema que não dependa do id da fatura, pois a fatura ainda não existe); em caso de falha, propagar erro ao cliente e **não** criar fatura.
5. **Somente após sucesso** — criar a fatura no banco com `createManualCustomerInvoice` (ou equivalente) já incluindo `gateway`, `asaas_payment_id`, `asaas_status`, `idempotency_key` e demais dados retornados pelo gateway; em seguida retornar 201 com `invoice` e `paymentUrls`.

**Benefícios dessa ordem:**

- Evita faturas órfãs (nunca haverá fatura no banco sem cobrança correspondente no gateway).
- Garante consistência entre sistema e gateway (fatura só existe se a cobrança foi criada).
- Simplifica estados: não é necessário tratar status `failed` para “gateway falhou após criar fatura”, pois a fatura só é criada após sucesso no gateway.

**O que será implementado:**

- Reordenar `createManualInvoice` conforme os cinco passos acima; **não** criar registro em `customer_invoices` antes de obter sucesso em `createCharge`.
- Incluir `cpf_cnpj` do cliente no SELECT de `clients` e passar `cpfCnpj` em `ensureCustomerForClient` (objeto `CreateCustomerInput` já suportado pelo Asaas e pelo mapper).
- Em qualquer falha nos passos 2, 3 ou 4: retornar resposta de erro ao cliente (ex.: 400/502/503) e **não** persistir fatura; nenhuma atualização de status “failed” é necessária nesse fluxo.
- Definir esquema de `idempotencyKey` e `externalReference` para a cobrança que não dependa do `id` da fatura (ex.: tenant + client + due_date + uuid ou timestamp), pois o id da fatura só existirá após o passo 5; o webhook continua resolvendo a fatura por `(gateway, asaas_payment_id)` após a fatura ser criada com esse `asaas_payment_id`.

**Arquivos/serviços impactados:**

- `packages/backend/src/services/customerBillingService.ts`: reimplementar `createManualInvoice` na ordem 1 → 2 → 3 → 4 → 5; remover criação de fatura antes do gateway; persistir fatura somente após sucesso de `createCharge`, já com dados do gateway.
- `packages/backend/src/services/customerInvoiceService.ts`: eventual extensão de `createManualCustomerInvoice` (ou função equivalente) para aceitar dados opcionais do gateway no momento da criação (gateway, asaas_payment_id, asaas_status, idempotency_key), de forma que o registro já nasça consistente com a cobrança.
- `packages/backend/src/modules/gateways/asaas/services/asaasService.ts`: nenhuma alteração obrigatória no contrato; o mapper já aceita `cpfCnpj`; apenas garantir que o caller envie o dado.

**Riscos:**

- Tenants sem gateway configurado passarão a receber erro ao tentar criar fatura (comportamento desejado).
- Erros de gateway (timeout, 4xx/5xx) serão visíveis ao usuário; em caso de falha não haverá fatura no banco (usuário pode tentar novamente). Mensagens claras e, se necessário, retry ou fila assíncrona em fase futura.

**Confirmação de cenários (nova ordem):**

| Cenário | Comportamento com fluxo 1→2→3→4→5 |
|--------|-----------------------------------|
| Preconditions falham (sem CPF/CNPJ ou sem gateway configurado) | Erro no passo 1; nenhuma chamada ao gateway; nenhuma fatura criada. |
| Gateway null | Erro no passo 2; nenhuma fatura criada. |
| Falha em ensureCustomerForClient (ex.: Asaas rejeita cliente) | Erro no passo 3; nenhuma fatura criada. |
| Falha em createCharge (ex.: timeout, 4xx/5xx) | Erro no passo 4; nenhuma fatura criada; usuário pode reenviar. |
| Sucesso em 1–4 | Passo 5: fatura criada no banco já com gateway, asaas_payment_id, etc.; 201 com invoice e paymentUrls. |
| Webhook de pagamento | Continua resolvendo por `(gateway, asaas_payment_id)`; a fatura já existirá no banco com esse id após o passo 5. |

Todos os cenários do diagnóstico e do plano original continuam cobertos; a única mudança é que a fatura passa a existir somente após a cobrança ter sido criada no gateway, eliminando faturas órfãs e a necessidade de status `failed` neste fluxo.

---

### Fase 3 — Endpoint de preconditions

**Objetivo:** Expor as mesmas regras de validação usadas no POST para que o frontend mostre o checklist (cliente com CPF/CNPJ; gateway configurado) e habilite “Continuar” apenas quando tudo estiver ok.

**O que será implementado:**

- Novo endpoint: `GET /api/customer-invoices/preconditions?client_id=...`
  - Autenticação: mesmo middleware das rotas de customer-invoices (tenantAuth).
  - Validação: `client_id` obrigatório na query; verificar que o cliente pertence ao tenant (ex.: `clientBelongsToTenant`).
  - Resposta: objeto com `ok`, `clientHasCpfCnpj`, `gatewayConfigured`, `errors` (e opcionalmente mensagens amigáveis por item para exibição no popup).
- Implementação: reutilizar a mesma função `validateInvoicePreconditions(tenantId, clientId)` usada no POST (Fase 1), garantindo uma única fonte de verdade.

**Arquivos/serviços impactados:**

- `packages/backend/src/controllers/customerInvoicesController.ts` (ou equivalente): nova ação para GET preconditions.
- `packages/backend/src/routes/customerInvoicesRoutes.ts`: registro da rota GET (ex.: `/preconditions` ou `/customer-invoices/preconditions` conforme convenção do projeto).

**Riscos:**

- Baixo; endpoint somente leitura e reutiliza lógica já existente. Atenção à autorização (apenas tenant dono do cliente).

---

### Fase 4 — Frontend (UX e popup)

**Objetivo:** Melhorar a experiência ao criar fatura: exibir popup de pré-requisitos, habilitar “Continuar” somente quando as pré-condições forem atendidas e sugerir ações corretivas (editar cliente; configurar gateway).

**O que será implementado:**

- No fluxo de “Nova Fatura” (modal ou página):
  - Ao abrir o modal ou ao selecionar um cliente, chamar `GET /api/customer-invoices/preconditions?client_id=...` (quando `client_id` estiver definido).
  - Exibir um popup/modal de “Pré-requisitos para emitir fatura” com checklist:
    - Item 1: “Cliente possui CPF/CNPJ” — ✔ verde se `clientHasCpfCnpj`, ❌ vermelho se não.
    - Item 2: “Gateway de pagamento configurado” — ✔ verde se `gatewayConfigured`, ❌ vermelho se não.
  - Botão “Continuar” habilitado apenas quando a resposta indicar `ok === true`.
  - Se CPF/CNPJ faltando: exibir ação sugerida “Editar cliente” com link para a tela de edição do cliente (ex.: `/clients/:id` ou rota equivalente).
  - Se gateway não configurado: exibir “Configurar gateway” com link para a tela de configuração do gateway (ex.: `/settings/payments` ou rota existente).
- Após “Continuar”, o usuário segue para o formulário de criação (valor, vencimento, etc.) e o POST só será enviado quando o usuário confirmar; o backend continuará validando no POST (Fase 1 e 2).

**Arquivos/serviços impactados:**

- Página ou componente de listagem/criação de faturas de clientes (ex.: `src/pages/CustomerInvoices.tsx`).
- Novo componente de modal/dialog de pré-requisitos (ex.: `CustomerInvoicePreconditionsModal.tsx` ou similar), reutilizável.
- Serviço de API no frontend (ex.: `src/services/customerInvoices.ts`): nova função para GET preconditions.

**Riscos:**

- Fluxo pode exigir duas etapas (popup → formulário); garantir que o usuário entenda que “Continuar” apenas libera o próximo passo. Nenhum impacto em outras páginas se o componente for isolado.

---

### Fase 5 — Melhorias futuras / extensões

**Objetivo:** Preparar para escala, múltiplos gateways e operação robusta, sem bloquear as fases 1–4.

**O que pode ser planejado (não implementado neste ciclo):**

- **Múltiplos gateways:** Manter abstração `PaymentGateway` e `getActiveGateway(billingType, tenantId)`; configuração por tenant em `payment_gateway_configs` já suporta isso; documentar que novos gateways (ex.: Stripe, Pagar.me) exigirão apenas nova implementação de `PaymentGateway` e registro no resolver.
- **Retry e resiliência:** Para falhas transitórias do gateway (timeout, 5xx), considerar fila assíncrona ou job de retry que tenta novamente criar a cobrança para faturas em `pending` sem `asaas_payment_id` (evitar duplicar lógica com o reconciliation job existente; alinhar com plano de reconciliação já documentado).
- **Observabilidade:** Logs estruturados em criação de fatura e chamadas ao gateway (já parcialmente existente); métricas (ex.: contagem de faturas criadas, falhas por tenant/gateway) para dashboards.
- **Compatibilidade com subscription billing:** O worker de recorrência (`recurringBillingJobService`) e o fluxo de faturas manuais são distintos; as pré-condições (CPF/CNPJ, gateway) podem ser aplicadas também ao worker para faturas `type=customer` em fase futura, usando a mesma `validateInvoicePreconditions` ou uma variante (ex.: apenas gateway obrigatório para recorrência).

---

## 2) Detalhamento técnico por fase

### Fase 1 — Validações e segurança

| Item | Descrição |
|------|------------|
| **Migration** | Uma migration (ex.: `72_clients_cpf_cnpj.sql`): `ALTER TABLE clients ADD COLUMN cpf_cnpj TEXT NULL`; COMMENT na coluna; sem backfill obrigatório. |
| **Serviços** | `customerBillingService` ou novo `customerInvoicePreconditions`: implementar `validateInvoicePreconditions(tenantId: string, clientId: string)`. |
| **Funções novas** | `validateInvoicePreconditions` — consulta cliente (com filtro tenant), verifica `cpf_cnpj` preenchido; chama `getActiveConfig('crm', tenantId)` para `gatewayConfigured`; retorna objeto com `ok`, `clientHasCpfCnpj`, `gatewayConfigured`, `errors`. |
| **Mudanças em funções existentes** | `createManualInvoice`: no início, após `clientBelongsToTenant`, chamar `validateInvoicePreconditions`; se `!ok`, lançar erro (ex.: 400) com corpo `{ code: 'PRECONDITION_FAILED', errors }`; não chamar `createManualCustomerInvoice`. |
| **Endpoints** | Nenhum novo na Fase 1. |

---

### Fase 2 — Integração com gateway

| Item | Descrição |
|------|------------|
| **Migrations** | Nenhuma (uso de `clients.cpf_cnpj` já previsto na Fase 1). |
| **Serviços** | `customerBillingService.ts`; eventual extensão em `customerInvoiceService.ts` para criar fatura já com dados do gateway. |
| **Funções novas** | Nenhuma obrigatória; opcional: variante de `createManualCustomerInvoice` que aceite dados do gateway (gateway, asaas_payment_id, asaas_status, idempotency_key) no momento do INSERT. |
| **Mudanças em funções existentes** | `createManualInvoice`: reordenar para (1) validar preconditions, (2) obter gateway (obrigatório), (3) garantir customer no gateway (com `cpf_cnpj`), (4) criar cobrança no gateway, (5) **somente após sucesso** criar a fatura no banco com dados do gateway. Não criar fatura antes do passo 5; em falha em 2, 3 ou 4, retornar erro e não persistir; não é necessário status `failed` neste fluxo. Definir idempotency/externalReference sem depender do id da fatura. |
| **Endpoints** | Nenhum novo; comportamento do POST existente alterado (erros explícitos, gateway obrigatório, fatura criada só após sucesso no gateway). |

---

### Fase 3 — Endpoint de preconditions

| Item | Descrição |
|------|------------|
| **Serviços** | Controller de customer-invoices; reuso de `validateInvoicePreconditions`. |
| **Funções novas** | Handler do GET preconditions: extrai `client_id` da query, valida tenant e `clientBelongsToTenant`, chama `validateInvoicePreconditions(tenantId, clientId)`, retorna JSON. |
| **Mudanças em funções existentes** | Apenas registro de rota. |
| **Endpoints** | `GET /api/customer-invoices/preconditions?client_id=<uuid>` — resposta: `{ ok, clientHasCpfCnpj, gatewayConfigured, errors?, messages? }`. |

---

### Fase 4 — Frontend

| Item | Descrição |
|------|------------|
| **Componentes** | Modal de pré-requisitos (checklist + ações sugeridas + botão Continuar); integração na página de criação de fatura. |
| **Serviços** | Função no `customerInvoices` service (ex.: `getPreconditions(clientId)`) que chama GET preconditions. |
| **Mudanças** | Fluxo do modal “Nova Fatura”: antes do formulário de valor/vencimento, exibir (ou abrir) popup de preconditions quando houver `client_id`; chamar GET; habilitar “Continuar” somente quando `ok === true`; links para editar cliente e configurar gateway. |

---

### Fase 5 — Futuro

| Item | Descrição |
|------|------------|
| **Escala** | Manter gateway atrás de interface única; config por tenant; documentar contrato para novos gateways. |
| **Retry/Reconciliação** | Alinhar com job de reconciliação existente; definir se faturas `pending` sem `asaas_payment_id` entram em retry automático. |
| **Subscription billing** | Decidir se pré-condições (CPF/CNPJ, gateway) aplicam-se ao worker de recorrência para `type=customer` e reutilizar mesma validação. |

---

## 3) Ordem segura de execução

A ordem abaixo evita inconsistência de dados, faturas órfãs e surpresas em produção:

1. **Fase 1 (validações + schema)**  
   - Rodar migration `clients.cpf_cnpj`.  
   - Implementar `validateInvoicePreconditions` e uso em `createManualInvoice` (bloquear criação se não ok).  
   - **Resultado:** Nenhuma fatura nova será criada sem cliente com CPF/CNPJ e sem gateway configurado (quando a Fase 2 estiver ativa, o “gateway configurado” já pode ser checado na mesma função, mas o “bloqueio por gateway null” pode ser feito na Fase 2).

2. **Fase 2 (gateway obrigatório e ordem do fluxo)**  
   - Reordenar `createManualInvoice`: (1) preconditions, (2) obter gateway (erro se null), (3) garantir customer no gateway (com `cpf_cnpj`), (4) criar cobrança no gateway, (5) **somente após sucesso** criar a fatura no banco.  
   - Incluir `cpf_cnpj` no payload para `ensureCustomerForClient`.  
   - Em falha em qualquer passo 2–4: retornar erro ao cliente e **não** criar fatura (não é necessário status `failed`).  
   - **Resultado:** Faturas manuais só existem no banco quando a cobrança foi criada no gateway; consistência garantida; sem faturas órfãs.

3. **Fase 3 (endpoint preconditions)**  
   - GET preconditions reutilizando `validateInvoicePreconditions`.  
   - **Resultado:** Frontend pode consultar o mesmo critério do backend.

4. **Fase 4 (frontend)**  
   - Integrar chamada ao GET e popup de checklist; links e botão Continuar.  
   - **Resultado:** UX alinhada às regras do backend.

5. **Fase 5**  
   - Apenas planejamento e documentação; implementação em ciclos futuros.

**Regra de ouro:** Nunca criar fatura no banco se as pré-condições falharem (Fase 1), se o gateway não estiver disponível, ou se a cobrança no gateway falhar (Fase 2). A fatura só é persistida **após** sucesso em `createCharge`; assim não surgem faturas órfãs e dispensa-se o uso de status `failed` neste fluxo.

---

## 4) Impacto no sistema atual

### O que pode “quebrar” ou mudar de comportamento

| Área | Impacto | Mitigação |
|------|---------|-----------|
| **Criação de fatura manual** | POST passará a retornar 400 (ou 503) quando cliente sem CPF/CNPJ ou gateway não configurado. | Comunicar usuários; frontend (Fase 4) orienta a preencher CPF/CNPJ e configurar gateway antes. |
| **Tenants sem gateway CRM** | Não conseguirão criar faturas até configurar o gateway. | Documentar e fornecer link “Configurar gateway” no popup. |
| **Clientes antigos sem CPF/CNPJ** | Não poderão receber faturas até o dado ser preenchido. | Permitir edição de cliente para incluir CPF/CNPJ; link “Editar cliente” no popup. |

### O que precisa de atenção especial

- **Subscription billing (recorrência):** O worker usa `createCustomerInvoice` (customer_invoices com `subscription_id`) e fluxo próprio (`processOneCustomerRenewalJob`). As mudanças em `createManualInvoice` e em `validateInvoicePreconditions` **não** alteram esse fluxo, a menos que se decida explicitamente aplicar as mesmas pré-condições ao worker (Fase 5 ou posterior). Atenção: se no futuro o worker usar a mesma validação, garantir que assinaturas `type=customer` só gerem fatura quando cliente tiver CPF/CNPJ e tenant tiver gateway.
- **Compatibilidade:** Manter contrato do POST (corpo e resposta de sucesso) compatível; apenas adicionar respostas de erro estruturadas (ex.: 400 com `code: 'PRECONDITION_FAILED'`). Frontend já deve tratar erros da API.

### Compatibilidade com billing de assinaturas

- **tenant_billing / plano do tenant:** Não afetado; continua usando `getActiveConfig('saas')` e fluxo próprio.
- **customer_invoices recorrentes (subscription_id NOT NULL):** Não afetado nas Fases 1–4; mesmo serviço `customerInvoiceService.createCustomerInvoice` e mesmo worker; apenas o fluxo manual (`createManualInvoice`) usa preconditions e gateway obrigatório.
- **Webhook e reconciliation:** Sem alteração nas fases 1–4; continuam tratando `customer_invoices` e `tenant_billing` como hoje.

---

## 5) Validações e testes por fase

### Fase 1

- **Testes manuais:** (1) Criar fatura com cliente sem CPF/CNPJ → esperar 400 e mensagem clara. (2) Preencher CPF/CNPJ do cliente e criar fatura com gateway configurado → sucesso. (3) Tenant sem config de gateway: tentar criar fatura → esperar 400 (se a checagem de gateway já estiver na Fase 1) ou preparar cenário para Fase 2.
- **Cenários de erro:** client_id de outro tenant; client_id inválido; cliente sem cpf_cnpj.
- **Como validar:** Logs e resposta HTTP; nenhuma linha nova em `customer_invoices` quando preconditions falham.

### Fase 2

- **Testes manuais:** (1) Tenant sem gateway: POST fatura → 400/503 e mensagem “Gateway não configurado”; nenhum registro em `customer_invoices`. (2) Gateway configurado e cliente com CPF/CNPJ: POST → 201, cobrança visível no Asaas e fatura no banco com `asaas_payment_id` preenchido. (3) Simular falha do Asaas (ex.: API key inválida) antes de criar a fatura: esperar erro retornado ao cliente e **nenhuma** fatura criada no banco.
- **Cenários de erro:** gateway null; timeout/5xx do Asaas; Asaas rejeitando cliente (ex.: CPF inválido); falha em `ensureCustomerForClient` ou `createCharge`. Em todos: erro retornado ao cliente e zero inserts em `customer_invoices`.
- **Como validar:** Quando o backend retorna 201, deve existir exatamente uma cobrança no Asaas e uma fatura no banco com o mesmo `asaas_payment_id`. Quando retorna erro, não deve existir fatura nova para aquele pedido.

### Fase 3

- **Testes manuais:** GET preconditions com client_id válido (com e sem CPF/CNPJ, com e sem gateway) e validar corpo da resposta. GET com client_id de outro tenant → 403 ou 404.
- **Cenários de erro:** client_id ausente; client_id inválido; token de outro tenant.
- **Como validar:** Comparar resultado do GET com o comportamento do POST (mesma regra).

### Fase 4

- **Testes manuais:** Abrir “Nova Fatura”, selecionar cliente sem CPF/CNPJ → popup com ❌ em CPF/CNPJ e “Continuar” desabilitado; preencher CPF/CNPJ e reabrir → ✔ e “Continuar” habilitado. Gateway não configurado → ❌ e link para configurar. Ambos ok → “Continuar” habilitado e fluxo segue para o formulário.
- **Cenários de erro:** API de preconditions falhando; cliente sem permissão.
- **Como validar:** Checklist reflete o retorno do GET; POST só é enviado após “Continuar” e preenchimento do formulário.

### Fase 5

- Nenhum teste obrigatório neste ciclo; apenas documentar cenários para retry, múltiplos gateways e extensão ao worker.

---

## 6) Preparação para escala

- **Múltiplos gateways:** Manter `getActiveGateway(billingType, tenantId)` e `payment_gateway_configs` por tenant; novos gateways = nova implementação de `PaymentGateway` + registro; preconditions continuam “gateway configurado” (qualquer um ativo para o tenant).
- **Alto volume de faturas:** Índices já existentes em `customer_invoices` (tenant_id, created_at, gateway + asaas_payment_id); preconditions são leitura leve (um cliente, uma config); GET preconditions pode ser cacheado por alguns segundos no frontend se necessário.
- **Reuso do Billing Engine:** Fluxo manual (createManualInvoice) e fluxo de recorrência (worker) compartilham `customer_invoices` e gateway; validação centralizada em `validateInvoicePreconditions` permite reutilizar no worker no futuro sem duplicar regras.
- **Contratos estáveis:** Manter interface `CreateCustomerInput` (com `cpfCnpj` opcional) e resposta de preconditions estável para o frontend e para futuros gateways.

---

## 7) Resultado final

### Visão geral da arquitetura após as mudanças

- **Schema:** `clients` possui `cpf_cnpj`; validação de pré-condições usa esse campo e a existência de config ativa para CRM.
- **Backend:** `createManualInvoice` segue a ordem: (1) preconditions, (2) gateway obrigatório, (3) garantir customer no gateway, (4) criar cobrança no gateway, (5) somente após sucesso criar a fatura no banco; erros em 2–4 são propagados e nenhuma fatura é persistida; CPF/CNPJ é enviado ao Asaas em `ensureCustomerForClient`.
- **API:** POST `/api/customer-invoices` pode retornar 400 (preconditions) ou 502/503 (gateway); GET `/api/customer-invoices/preconditions?client_id=...` expõe o estado das pré-condições.
- **Frontend:** Fluxo “Nova Fatura” inclui popup de checklist; “Continuar” habilitado apenas quando preconditions ok; links para editar cliente e configurar gateway.
- **Subscription billing:** Inalterado nas Fases 1–4; possível estender preconditions ao worker em fase futura.

### Checklist final de implementação

- [ ] **Fase 1**  
  - [ ] Migration `clients.cpf_cnpj`.  
  - [ ] Função `validateInvoicePreconditions(tenantId, clientId)`.  
  - [ ] Uso em `createManualInvoice` (bloquear criação se não ok).  
  - [ ] Testes manuais e cenários de erro.

- [ ] **Fase 2**  
  - [ ] Reordenar `createManualInvoice`: preconditions → gateway obrigatório → garantir customer → createCharge → **somente após sucesso** criar fatura no banco.  
  - [ ] Incluir e enviar `cpf_cnpj` em `ensureCustomerForClient`.  
  - [ ] Propagação de erros (2–4): retornar erro ao cliente e não criar fatura.  
  - [ ] Definir idempotency/externalReference sem depender do id da fatura; persistir fatura já com dados do gateway.  
  - [ ] Testes manuais e verificação no Asaas (201 → fatura + cobrança; erro → nenhuma fatura nova).

- [ ] **Fase 3**  
  - [ ] GET `/api/customer-invoices/preconditions?client_id=...`.  
  - [ ] Autorização e reuso de `validateInvoicePreconditions`.  
  - [ ] Testes manuais.

- [ ] **Fase 4**  
  - [ ] Serviço frontend para GET preconditions.  
  - [ ] Modal de pré-requisitos (checklist + ações + Continuar).  
  - [ ] Integração no fluxo “Nova Fatura”.  
  - [ ] Testes manuais de UX.

- [ ] **Documentação e comunicação**  
  - [ ] Atualizar documentação de API (erros do POST e novo GET).  
  - [ ] Comunicar usuários sobre obrigatoriedade de CPF/CNPJ e gateway para faturas manuais.

### Indicação “READY FOR IMPLEMENTATION”

O plano está **pronto para implementação** quando:

1. Este documento for revisado e aprovado (product/tech).  
2. A ordem de execução (Fase 1 → 2 → 3 → 4) for confirmada.  
3. A política de erro (não criar fatura quando preconditions falham ou gateway null; propagar erro de gateway) estiver alinhada com o negócio.  
4. As rotas de frontend para “Editar cliente” e “Configurar gateway” estiverem definidas para os links do popup.  
5. Não houver dependências bloqueantes (ex.: migração de dados em massa de CPF/CNPJ não é obrigatória para ir para produção; clientes podem ser preenchidos sob demanda).

Nenhum código, migration ou alteração de arquivo foi realizado neste documento — apenas planejamento para execução segura, escalável e alinhada ao diagnóstico do Customer Billing.
