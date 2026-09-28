# Auditoria funcional ponta a ponta — Fluxo de criação de faturas (Customer Invoice)

**Objetivo:** Diagnóstico completo do fluxo de criação de faturas de clientes (manual), sem implementar correções.  
**Problemas observados:** (1) Gateway configurado mas sistema indica "Gateway não configurado"; (2) Clientes sinalizados como "sem CPF/CNPJ" sem campo na UI para informar CPF/CNPJ.

---

## 1. Auditoria do endpoint de pré-condições

### 1.1 O que foi inspecionado

- **Endpoint:** `GET /api/customer-invoices/preconditions?client_id=<uuid>`
- **Controller:** `getCustomerInvoicePreconditions` em `packages/backend/src/controllers/customerInvoicesController.ts`
- **Serviço:** `validateInvoicePreconditions` em `packages/backend/src/services/customerInvoicePreconditions.ts`

### 1.2 Como `gatewayConfigured` é determinado

- `validateInvoicePreconditions` chama `getActiveConfig('crm', tenantId)`.
- `gatewayConfigured = (config != null)`.

Fonte: `customerInvoicePreconditions.ts` linhas 43–45.

### 1.3 Qual tabela/config é lida

- **Tabela:** `payment_gateway_configs`
- **Query em `getActiveConfig(billingType, tenantId)` para `billingType === 'crm'`:**
  - `scope = 'tenant'`
  - `tenant_id = $1` (tenant do usuário)
  - `is_active = true`
  - **`status = 'active'`** ← condição crítica

Fonte: `paymentGatewayConfigService.ts` linhas 114–121.

### 1.4 Filtro por tenant

- Sim. A query usa `tenant_id = $1` com o `tenantId` do request (via `req.tenantId`).
- O controller exige tenant identificado (401 se não houver).

### 1.5 Por que `gatewayConfigured` retorna false mesmo com gateway “configurado”

- **Causa raiz:** Para contexto CRM, `getActiveConfig('crm', tenantId)` exige **`status = 'active'`**.
- Ao **salvar** a config do tenant (`saveTenantConfig`), o sistema grava sempre **`status = 'pending'`** (tanto no UPDATE quanto no INSERT).  
  Fonte: `paymentGatewayConfigService.ts` linhas 358–363 e 372–375.
- O status só passa para **`'active'`** quando o tenant chama **POST /api/me/tenant/payment-gateway/test** e o teste de conexão **é bem-sucedido** (`updateConnectionTestResult(..., 'active')`).  
  Fonte: `myTenantPaymentGatewayController.ts` linhas 124–126.
- **Conclusão:** Se o tenant apenas salvou a API key e não clicou em “Testar conexão”, ou se o teste falhou, a config continua com `status = 'pending'`. Nesse caso `getActiveConfig('crm', tenantId)` não retorna linha e `gatewayConfigured` fica **false**.
- A tela de configuração (ex.: GET tenant config / status) pode considerar “configurado” apenas por existir config com `is_active = true`, enquanto as pré-condições exigem ainda `status = 'active'`. Daí a sensação de “gateway configurado” na UI vs “não configurado” no checklist.

### 1.6 Resumo pré-condições

| Item | Situação |
|------|----------|
| Tabela lida | `payment_gateway_configs` (scope tenant, tenant_id) |
| Filtro tenant | Correto |
| Exigência extra | `status = 'active'` (só após teste de conexão bem-sucedido) |
| Inconsistência | Salvar config → `status = 'pending'`; pré-condição exige `status = 'active'` |

---

## 2. Auditoria do fluxo CPF/CNPJ do cliente

### 2.1 Banco de dados

- **Tabela:** `public.clients`
- **Campo:** `cpf_cnpj TEXT` (nullable), adicionado na migration `72_clients_cpf_cnpj.sql`.
- **Obrigatoriedade:** Não é NOT NULL; obrigatório apenas para emissão de fatura (regra de negócio).

### 2.2 API de clientes (backend)

- **GET lista/detalhe:** Usam `SELECT c.*`, então **`cpf_cnpj` é retornado** pelo banco (o campo existe).
- **Schema de create/update:** `clientSchema` em `clientsController.ts` **não inclui `cpf_cnpj`**.  
  Fonte: linhas 20–30.
- **createClient:** Monta `cleanData` apenas com os campos do schema; o INSERT **não inclui `cpf_cnpj`**.  
  Fonte: linhas 198–209.
- **updateClient:** Usa `clientSchema.partial().parse(req.body)` e monta UPDATE dinâmico a partir dos campos parseados. Como `cpf_cnpj` não está no schema, **não é aceito nem persistido** no PATCH.

Conclusão: o backend **não expõe** `cpf_cnpj` no create/update; apenas o GET pode devolver o valor se já existir no banco.

### 2.3 Frontend — tipo e formulários

- **Tipo `Client`** em `src/services/clients.ts`: **não possui** `cpf_cnpj`.
- **Página de clientes (`Clients.tsx`):** Formulário de novo cliente usa `newClient` com: name, company, email, phone, status, group_id, notes. **Não há campo CPF/CNPJ.**
- **Edição de cliente (view/edit em `Clients.tsx`):** `editedClient` usa os mesmos campos; **não há CPF/CNPJ.**
- **Perfil do cliente (`ClientProfile.tsx`):** Exibe name, company, email, phone, etc.; **não exibe nem edita `cpf_cnpj`.**

Os únicos lugares com campo “CPF/CNPJ” no frontend são **Onboarding** e **PlanCheckout**, para **dados do tenant/empresa**, não para o cadastro de **clientes** (CRM).

### 2.4 Por que o usuário não consegue informar CPF/CNPJ

1. **Backend:** create/update de clientes não aceitam `cpf_cnpj` (schema + INSERT/UPDATE).
2. **Frontend:** tipo `Client` não tem `cpf_cnpj`; formulários de criar/editar cliente não têm campo; tela de perfil do cliente não mostra nem edita.

### 2.5 Onde o campo deve ser adicionado

- **Backend:** Incluir `cpf_cnpj` no schema de create/update; no INSERT e no UPDATE dinâmico de clientes.
- **Frontend:** Incluir `cpf_cnpj` na interface `Client`; adicionar campo “CPF/CNPJ” em:
  - Formulário de **criar** cliente (modal/página em `Clients.tsx`).
  - Formulário de **editar** cliente (idem).
  - **Perfil do cliente** (`ClientProfile.tsx`): exibir e permitir edição (ou link “Editar cliente” já leva ao formulário com o campo).

### 2.6 Máscara/formatação

- Recomendável: máscara ou validação (CPF 11 dígitos, CNPJ 14 dígitos; remover não dígitos antes de salvar, como em `planPurchaseController`/Onboarding). Não é obrigatório para o fluxo funcionar, mas melhora UX e consistência.

---

## 3. Auditoria da integração frontend (modal e API)

### 3.1 Modal “Nova Fatura — Pré-requisitos”

- **Fluxo:** Usuário escolhe cliente no select → `form.client_id` é preenchido → `useEffect` chama `customerInvoicesService.getPreconditions(form.client_id)`.
- **URL chamada:** `GET /api/customer-invoices/preconditions?client_id=<uuid>` (BASE = `/api/customer-invoices`). Correto.

### 3.2 Tratamento da resposta

- O serviço normaliza a resposta (aceita camelCase e snake_case) e preenche `ok`, `clientHasCpfCnpj`, `gatewayConfigured`, `errors`.
- Em caso de erro (ex.: 404, 500), o `catch` faz `setPreconditions(null)`; o checklist continua sendo renderizado (com ❌ em ambos os itens e mensagem “Não foi possível verificar”) após o ajuste anterior.

### 3.3 Possíveis erros de mapeamento

- Não há evidência de mapeamento errado de campos. O backend retorna `clientHasCpfCnpj` e `gatewayConfigured` em camelCase; o frontend lê e normaliza. O problema de “gateway não configurado” vem do backend (status da config), não do mapeamento da resposta.

---

## 4. Auditoria da configuração do gateway

### 4.1 Asaas e armazenamento

- **Config por tenant:** `payment_gateway_configs` com `scope = 'tenant'`, `tenant_id`, `gateway_key` (ex.: `'asaas'`), `credentials` (ex.: `api_key`, `env`).
- **AsaasService:** Usa config resolvida pelo `gatewayResolver` / `getActiveConfig` (para CRM, com `billingType = 'crm'` e `tenantId`).

### 4.2 Onde a API key fica

- No banco: coluna `credentials` (JSONB) da linha em `payment_gateway_configs` do tenant (ex.: `{ "api_key": "...", "env": "sandbox" }`). Não vem de variável de ambiente para o contexto CRM do tenant.

### 4.3 Como o sistema considera “configurado”

- **Para exibição (ex.: painel de configuração):** Pode usar “existe config com `is_active = true`” ou “tem credenciais”.
- **Para pré-condições e cobrança:** `getActiveConfig('crm', tenantId)` exige **`is_active = true` e `status = 'active'`**. Ou seja, “configurado” para o fluxo de fatura = config salva **e** teste de conexão bem-sucedido.

### 4.4 Ambiente (sandbox vs prod)

- O campo `credentials.env` (ex.: `'production'` ou `'sandbox'`) é usado na integração Asaas. Não há indício de que isso altere a lógica de “configurado” nas pré-condições; o bloqueio é o `status !== 'active'`.

---

## 5. Consistência de dados e simulação

### 5.1 Cenário: tenant com gateway “configurado” na tela

- Se o tenant só salvou a config: em `payment_gateway_configs` há linha com `scope='tenant'`, `tenant_id`, `is_active=true`, **`status='pending'`**.
- `getActiveConfig('crm', tenantId)` → **null** → `gatewayConfigured = false`.

### 5.2 Cenário: cliente que “deveria” ter CPF/CNPJ

- Se `clients.cpf_cnpj` estiver NULL ou vazio (padrão para clientes antigos ou criados pela UI atual), a pré-condição retorna `clientHasCpfCnpj = false`.
- Não há como o usuário preencher esse campo hoje (falta campo na UI e aceite na API).

### 5.3 Simulação manual da resposta de pré-condições

- Com gateway em `pending`: backend retorna `gatewayConfigured: false`, `ok: false`.
- Com cliente sem `cpf_cnpj`: backend retorna `clientHasCpfCnpj: false`, `ok: false`.
- Frontend exibe checklist e botão “Continuar” desabilitado de acordo; o problema não é o frontend e sim a regra de “configurado” (status) e a ausência do campo CPF/CNPJ.

---

## 6. Diagnóstico final — lista de problemas

### 6.1 Campos / dados faltando

- **Cliente:** Campo `cpf_cnpj` existe no banco mas **não** é aceito na API de create/update e **não** existe na UI (criar/editar/perfil). Usuário não tem como informar CPF/CNPJ.

### 6.2 Validações / regras incorretas ou confusas

- **Gateway “configurado”:** Para pré-condições e cobrança CRM, exige-se `status = 'active'`, que só é setado após “Testar conexão” com sucesso. Quem apenas salva a config vê “Gateway não configurado” no checklist, gerando expectativa errada.

### 6.3 Integrações quebradas ou incompletas

- **API de clientes:** Create/update não incluem `cpf_cnpj` (schema + SQL).
- **Frontend de clientes:** Não envia nem exibe `cpf_cnpj`; tipo `Client` não declara o campo.

### 6.4 Lacunas de UX

- Checklist de pré-requisitos não deixa claro que “Gateway configurado” significa “salvo **e** teste de conexão ok”.
- Não há como preencher CPF/CNPJ do cliente em nenhuma tela de cliente; o link “Editar cliente” leva a um formulário que não tem esse campo.

---

## 7. Plano de ação (ordem sugerida)

### Prioridade 1 — Correções críticas

**1.1 Expor e persistir CPF/CNPJ do cliente na API**

- **O quê:** Incluir `cpf_cnpj` no fluxo de create/update de clientes.
- **Onde:**  
  - `packages/backend/src/controllers/clientsController.ts`: adicionar `cpf_cnpj` em `clientSchema` (opcional, string); em `createClient`, incluir `cpf_cnpj` em `cleanData` e na lista de colunas/valores do INSERT; em `updateClient`, garantir que o schema e o UPDATE dinâmico aceitem `cpf_cnpj`.
- **Por quê:** Sem isso, o usuário nunca consegue satisfazer a pré-condição “Cliente possui CPF/CNPJ”.

**1.2 Campo CPF/CNPJ na UI de clientes**

- **O quê:** Permitir informar e editar CPF/CNPJ do cliente.
- **Onde:**  
  - `src/services/clients.ts`: adicionar `cpf_cnpj?: string` em `Client`.  
  - `src/pages/Clients.tsx`: estado do formulário de novo cliente e do edit (ex.: `newClient`, `editedClient`) incluir `cpf_cnpj`; adicionar campo no modal de criação e no de edição; enviar `cpf_cnpj` no create/update.
- **Por quê:** Sem campo na UI, a pré-condição nunca será atendida pela via normal.

**1.3 Exibir/editar CPF/CNPJ no perfil do cliente**

- **O quê:** Mostrar CPF/CNPJ na página do cliente e, se houver edição inline ou formulário de edição, permitir alterar.
- **Onde:** `src/pages/ClientProfile.tsx`: exibir `client.cpf_cnpj` (e opcionalmente campo editável ou link para edição que já inclua o campo).
- **Por quê:** Consistência e possibilidade de corrigir dados sem ir só pela lista.

---

### Prioridade 2 — Ajustes de comportamento do gateway

**2.1 Alinhar critério “Gateway configurado” com a expectativa do usuário**

Duas abordagens possíveis (escolher uma):

- **Opção A — Manter exigência de teste:**  
  - Manter `getActiveConfig('crm', tenantId)` exigindo `status = 'active'`.  
  - Melhorar mensagens: no checklist, usar texto do tipo “Gateway configurado e testado”; na tela de configuração, deixar explícito: “Salve e clique em **Testar conexão** para ativar o gateway para faturas.”

- **Opção B — Considerar “configurado” sem exigir teste:**  
  - Para pré-condições (e apenas para “está configurado?”), usar um critério mais fraco: por exemplo, existir config tenant com `is_active = true` e `credentials` com `api_key` preenchida (ou chamar algo como `getConfigForTest('tenant', tenantId)` e considerar “configurado” se retornar config).  
  - Manter `getActiveConfig` com `status = 'active'` para **criar cobrança** (customerBillingService), para não usar config nunca testada em produção.  
  - Ou seja: pré-condição “gateway configurado” = tem config com credencial; uso real do gateway = continua exigindo status ativo após teste.

- **Onde:**  
  - Opção A: textos em `customerInvoicePreconditions.ts` (ou mensagens retornadas) e em componentes de settings/payment gateway.  
  - Opção B: novo critério em `validateInvoicePreconditions` para “configurado” (ex.: chamar serviço que não exija `status = 'active'`) e manter `getActiveConfig` para o billing.

**2.2 (Opcional) Testar conexão ao salvar config**

- **O quê:** Ao salvar a config do tenant, chamar o teste de conexão em background; se sucesso, setar `status = 'active'`.
- **Onde:** `myTenantPaymentGatewayController` (PUT config) e/ou `paymentGatewayConfigService.saveTenantConfig`.
- **Por quê:** Reduz um passo manual e reduz a sensação de “configurei mas continua dizendo que não está configurado”.

---

### Prioridade 3 — Ajustes de backend e validação

**3.1 Normalização de CPF/CNPJ**

- **O quê:** Salvar apenas dígitos (remover pontuação), como em outros fluxos do sistema.
- **Onde:** No controller de clientes, ao receber `cpf_cnpj`, fazer `replace(/\D/g, '')` antes de persistir (e opcionalmente validar 11 ou 14 dígitos).
- **Por quê:** Consistência e compatibilidade com gateways que esperam só números.

**3.2 (Opcional) Máscara no frontend**

- **O quê:** Máscara CPF/CNPJ no campo (ex.: 000.000.000-00 / 00.000.000/0000-00) e enviar só dígitos ou valor já normalizado conforme backend.
- **Onde:** Campo de CPF/CNPJ em `Clients.tsx` (e se houver em `ClientProfile.tsx`).
- **Por quê:** UX e menos erros de digitação.

---

### Prioridade 4 — Validações e mensagens

**4.1 Mensagens do checklist**

- **O quê:** Textos claros: “Gateway de pagamento configurado e testado” (se mantiver status active) ou “Gateway de pagamento configurado” (se adotar Opção B); manter “Cliente possui CPF/CNPJ” e “Cliente sem CPF/CNPJ” com links “Editar cliente” e “Configurar gateway”.
- **Onde:** `src/pages/CustomerInvoices.tsx` (modal de pré-requisitos).
- **Por quê:** Evitar confusão entre “configurado na tela” e “configurado para faturas”.

**4.2 (Opcional) Validação de formato CPF/CNPJ no backend**

- **O quê:** Rejeitar create/update com `cpf_cnpj` inválido (tamanho 11 ou 14 dígitos, ou algoritmo de dígitos verificadores).
- **Onde:** `clientsController.ts` ao processar `cpf_cnpj`.
- **Por quê:** Evitar dados inúteis no gateway e na pré-condição.

---

## Resumo executivo

- **Problema 1 — “Gateway não configurado”:** O sistema considera gateway “configurado” para faturas apenas quando há config do tenant com **`status = 'active'`**. Esse status só é setado após “Testar conexão” com sucesso. Quem só salva a config fica com `status = 'pending'` e vê “Gateway não configurado” no checklist.  
  **Ação:** Alinhar critério (mensagens e/ou regra) e, se desejado, ativar config após teste automático ao salvar.

- **Problema 2 — “Sem CPF/CNPJ” e sem campo:** O campo `clients.cpf_cnpj` existe no banco, mas a API de clientes não aceita em create/update e a UI não tem campo em nenhum formulário de cliente.  
  **Ação:** Incluir `cpf_cnpj` na API (schema + INSERT/UPDATE), no tipo `Client` e nos formulários de criar/editar cliente e no perfil.

Implementando o plano acima na ordem indicada, o fluxo de criação de faturas (pré-requisitos + criação) fica completo e funcional de ponta a ponta.
