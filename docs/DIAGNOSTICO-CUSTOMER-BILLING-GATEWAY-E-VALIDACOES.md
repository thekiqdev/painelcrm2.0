# Diagnóstico: Customer Billing — Gateway e validações

**Objetivo:** Explicar por que a cobrança não está sendo criada no Asaas, confirmar o plano original e propor correções e validações (sem implementar ainda).

---

## 1) Investigação do gateway — por que a cobrança não é criada

### 1.1 Fluxo atual em `createManualInvoice` (customerBillingService.ts)

O fluxo está implementado como previsto:

1. Valida `clientBelongsToTenant(tenantId, body.client_id)`.
2. Cria a fatura no banco com `createManualCustomerInvoice(data)`.
3. Chama `getActiveConfig('crm', tenantId)` → `config`, `gatewayKey`.
4. Chama `getActiveGateway({ billingType: 'crm', tenantId })` → `gateway`.
5. **Se `gateway` existir**, em um `try/catch`:
   - Obtém ou cria o cliente no gateway: `getPaymentCustomerForClient`; se não houver, `ensureCustomerForClient(tenantId, client_id, { name, email, phone })` e `createPaymentCustomerForClient`.
   - **Se `customerId` existir**, chama `gateway.createCharge(...)` e `updateCustomerInvoiceGatewayData`.
   - Em caso de erro no `try`, apenas faz `console.error` e segue.

Trecho relevante (linhas 91–159):

```ts
const config = await getActiveConfig('crm', tenantId);
const gatewayKey = config?.gateway_key ?? 'asaas';
const gateway = await getActiveGateway({ billingType: 'crm', tenantId });
// ...
if (gateway) {
  try {
    let customerId = (await getPaymentCustomerForClient(...))?.gateway_customer_id ?? null;
    if (!customerId && gateway.ensureCustomerForClient) {
      const clientRow = await pool.query('SELECT name, email, phone, company FROM clients WHERE id = $1', [body.client_id]);
      const c = clientRow.rows[0];
      if (c) {
        customerId = await gateway.ensureCustomerForClient(tenantId, body.client_id, {
          name: c.name,
          email: c.email ?? '',
          phone: c.phone ?? undefined,
        });
        // ...
      }
    }
    if (customerId) {
      const chargeResult = await gateway.createCharge({...});
      await updateCustomerInvoiceGatewayData(...);
      paymentUrls = {...};
    }
  } catch (gatewayErr) {
    console.error('[customerBillingService] gateway createCharge (manual) error', {...});
  }
}
return { invoice, paymentUrls };
```

Ou seja: **getActiveConfig**, **getActiveGateway**, **ensureCustomerForClient** e **createCharge** são chamados quando as condições são atendidas. O problema não é a ausência do fluxo, e sim **quando** ele é pulado ou quando erros são engolidos.

---

### 1.2 Causas pelas quais a cobrança não aparece no Asaas

#### Causa A — Gateway não configurado (mais provável)

- **Onde:** `getActiveGateway({ billingType: 'crm', tenantId })` em `gatewayResolver.ts` usa `getActiveConfig(billingType, tenantId)`.
- **Regra CRM:** em `paymentGatewayConfigService.ts` (linhas 114–124), para `billingType === 'crm'` a config ativa exige:
  - `scope = 'tenant'`
  - `tenant_id = $1`
  - `is_active = true`
  - **`status = 'active'`**
- Se não existir linha em `payment_gateway_configs` para aquele tenant com esses critérios, `getActiveConfig` retorna `null`.
- Em `gatewayResolver.ts`, para CRM não há fallback (o fallback com variáveis de ambiente existe só para `billingType === 'saas'`). Então `resolvePaymentGateway` retorna `null`.
- Em `createManualInvoice`, `gateway` fica `null` e o bloco `if (gateway) { ... }` **nunca é executado**.
- **Efeito:** fatura criada no sistema, nenhuma chamada ao Asaas, nenhum erro para o usuário.

**Trecho responsável:**  
`packages/backend/src/services/customerBillingService.ts` — condição `if (gateway)` (linha 96). Quando `gateway` é `null`, toda a integração é ignorada.

---

#### Causa B — Cliente não encontrado ou sem `customerId` no gateway

- Se `getPaymentCustomerForClient` não achar vínculo e o `SELECT` em `clients` não retornar linha (`clientRow.rows[0]` inexistente), `customerId` não é preenchido.
- Ou: `ensureCustomerForClient` é chamado mas a API do Asaas falha (ex.: documento obrigatório em produção). O `catch` só registra o erro; `customerId` continua null (ou a exceção ocorre antes de atribuir).
- O código só chama `createCharge` quando `if (customerId)`. Se `customerId` for null, a cobrança não é criada e nenhum erro é retornado ao cliente.

**Trecho responsável:**  
O mesmo bloco em `customerBillingService.ts`: dependência em `customerId` (linha 124) e o `catch` (linhas 151–156) que apenas faz log.

---

#### Causa C — Erro em `createCharge`

- Se `gateway.createCharge(...)` lançar (timeout, 4xx/5xx do Asaas, validação), o `catch` apenas faz `console.error` e não propaga o erro.
- A fatura já foi criada; a função retorna `{ invoice, paymentUrls }` com `paymentUrls` indefinido.
- Na prática o usuário vê “sucesso” e a cobrança não existe no gateway.

**Trecho responsável:**  
`packages/backend/src/services/customerBillingService.ts`, linhas 151–156 (try/catch que engole o erro).

---

### 1.3 Resumo do diagnóstico

| Causa | Onde | Comportamento |
|-------|------|----------------|
| **A** | `getActiveConfig` / `getActiveGateway` retornam null (CRM sem config ativa) | `if (gateway)` falso → nenhuma chamada ao gateway; fatura criada. |
| **B** | `customerId` null (cliente não no gateway ou falha em `ensureCustomerForClient`) | `if (customerId)` falso ou exceção engolida → sem `createCharge`. |
| **C** | Exceção em `createCharge` | `catch` só loga → retorno de sucesso sem `paymentUrls`. |

Conclusão: a cobrança não é criada no Asaas porque (1) o gateway para CRM pode não estar configurado/ativo, (2) o “customer” no gateway pode não ser criado/recuperado e (3) qualquer erro no gateway é tratado de forma “best effort” (só log), sem falhar a operação nem informar o usuário.

---

### 1.4 Confirmação em relação ao plano original

- No **PLANO-CUSTOMER-BILLING-FATURAS-TENANT.md** está previsto:
  - Uso de `getActiveConfig(billingType, tenantId)` e `getActiveGateway({ billingType: 'crm', tenantId })`.
  - Fluxo ensureCustomerForClient → createCharge com idempotency e externalReference.
- O plano também diz que, se no futuro for necessário dados de cobrança (ex.: CPF), pode-se adicionar colunas em `clients` (ou perfil de billing).
- Ou seja: a integração com o gateway estava prevista; **não** estava previsto que a criação da fatura fosse sempre bem-sucedida mesmo sem gateway configurado ou quando o gateway falha. O comportamento atual (“sempre retornar sucesso”) é uma decisão de implementação, não do plano.

---

## 2) Validações obrigatórias antes de criar fatura

### 2.1 Cliente deve ter CPF/CNPJ

- Hoje a tabela **`clients`** (em `04_create_leads_and_clients.sql`) **não** possui coluna `cpf_cnpj`. Só **`tenants`** tem `cpf_cnpj` (em `64_tenants_billing_contact.sql`).
- O Asaas (e o mapeador `asaasMapper`) aceitam `cpfCnpj` opcional em `CreateCustomerInput`; na prática, para cobrança no Brasil costuma ser obrigatório.
- Para “impedir criação de fatura se o cliente não tiver CPF/CNPJ” é necessário:
  1. **Schema:** adicionar coluna em `clients`, por exemplo `cpf_cnpj TEXT NULL`, via migration.
  2. **Regra de negócio:** considerar “possui CPF/CNPJ” quando `cpf_cnpj IS NOT NULL AND TRIM(cpf_cnpj) <> ''` (e opcionalmente validar formato).
  3. **Backend:** antes de criar a fatura (e de chamar o gateway), verificar esse campo e, se estiver vazio, retornar erro (ex.: “Cliente precisa ter CPF ou CNPJ cadastrado”).
  4. **Gateway:** ao chamar `ensureCustomerForClient`, enviar `cpfCnpj` do cliente (a partir do novo campo) no `CreateCustomerInput`.

### 2.2 Gateway (Asaas) deve estar configurado

- **Onde verificar:** mesmo critério usado em `createManualInvoice`: `getActiveConfig('crm', tenantId)` não nulo (e, por consequência, `getActiveGateway({ billingType: 'crm', tenantId })` não nulo).
- **Regra:** se não houver config ativa para o tenant no contexto CRM, não permitir criar a fatura e retornar erro explícito (ex.: “Gateway de pagamento não configurado para cobrança de clientes”).

---

## 3) Experiência do usuário (frontend) — popup de validação

- **Momento:** ao abrir o fluxo de “Nova Fatura” (ou ao escolher o cliente), exibir um popup/modal de “Pré-requisitos”.
- **Conteúdo:** checklist com dois itens (e possíveis extensões futuras):
  1. Cliente possui CPF/CNPJ (✔ verde se válido, ❌ vermelho se faltando).
  2. Gateway de pagamento configurado (✔ verde se config ativa, ❌ vermelho se não).
- **Ações sugeridas:**
  - Se CPF/CNPJ faltando: “Editar cliente” (link para a tela de edição do cliente).
  - Se gateway não configurado: “Configurar gateway” (link para a tela de configuração do gateway do tenant).
- **Botão “Continuar”:** habilitado somente quando todos os itens estiverem ✔.
- **Fonte dos dados:** o frontend pode chamar um endpoint de “pré-condições” (ex.: `GET /api/customer-invoices/preconditions?client_id=...`) que retorna o status de cada item, para não duplicar lógica e manter consistência com o backend.

---

## 4) Onde implementar — backend e frontend

### 4.1 Backend (obrigatório — segurança e consistência)

- **Função de validação (sugestão de nome):** `validateInvoicePreconditions(tenantId: string, clientId: string)`.
  - Retorno sugerido (exemplo):
    - `{ ok: boolean, clientHasCpfCnpj: boolean, gatewayConfigured: boolean, errors?: string[] }`
  - Implementação:
    - **clientHasCpfCnpj:** buscar cliente em `clients` (com filtro por tenant, por exemplo via `clientBelongsToTenant` ou join com `users`), checar se `cpf_cnpj` está preenchido (e opcionalmente se está em formato válido).
    - **gatewayConfigured:** `getActiveConfig('crm', tenantId) != null` (ou equivalente via `getActiveGateway`).
  - Uso em `createManualInvoice`: antes de `createManualCustomerInvoice`, chamar `validateInvoicePreconditions`. Se `ok === false`, lançar erro (ex.: `400`) com mensagens claras (ex.: lista em `errors`), sem criar fatura nem chamar gateway.
- **Endpoint opcional para o frontend:**  
  `GET /api/customer-invoices/preconditions?client_id=...`  
  - Resposta: mesmo formato da função (ex.: `clientHasCpfCnpj`, `gatewayConfigured`, `ok`, e opcionalmente mensagens para exibição).
  - Assim o popup usa sempre a mesma regra que o backend usará na criação.

### 4.2 Frontend (UX)

- Ao abrir o modal de “Nova Fatura” (ou ao selecionar o cliente), chamar `GET .../preconditions?client_id=...` (quando já houver cliente selecionado).
- Exibir o popup de checklist com os resultados; habilitar “Continuar” só quando `ok === true`.
- Se não estiver ok, mostrar as ações sugeridas (editar cliente / configurar gateway) com links para as rotas corretas.

---

## 5) O que corrigir no backend (resumo)

1. **Comportamento quando o gateway não está disponível**
   - Se `getActiveGateway({ billingType: 'crm', tenantId })` retornar `null`, **não** criar a fatura e retornar erro (ex.: 400 ou 422) com mensagem do tipo “Gateway de pagamento não configurado”.
   - Alternativa mais conservadora: criar a fatura mas retornar no payload um aviso/erro indicando que a cobrança não foi gerada por falta de configuração (evitando rollback de fatura já criada). A opção mais limpa para o usuário é **validar antes** (pré-condições) e, se passar, **exigir** gateway na criação; assim evita faturas “órfãs” sem cobrança.

2. **Comportamento quando há erro no gateway**
   - Em vez de apenas `console.error` no `catch`, either:
     - **Rethrow** o erro (após criar a fatura, o que pode deixar fatura “pendente” no sistema), ou
     - **Validar pré-condições antes** (incluindo “gateway configurado”) e, no `createManualInvoice`, tratar falha de `createCharge` como erro da operação (retornar 502/503 ou 400 com mensagem), e opcionalmente marcar a fatura como “failed” ou manter “pending” com flag de “tentativa de cobrança falhou”.
   - Recomendação: **validar pré-condições antes**; se passar, considerar falha em `ensureCustomerForClient` ou `createCharge` como erro da requisição (retornar erro ao cliente e logar detalhes).

3. **CPF/CNPJ do cliente**
   - Migration: adicionar `clients.cpf_cnpj` (TEXT NULL).
   - Incluir checagem de CPF/CNPJ em `validateInvoicePreconditions`.
   - Em `createManualInvoice`, buscar `cpf_cnpj` do cliente e repassar em `ensureCustomerForClient` (no objeto que implementa `CreateCustomerInput`).

4. **Função e endpoint de pré-condições**
   - Implementar `validateInvoicePreconditions(tenantId, clientId)` e usá-la em `createManualInvoice` antes de criar a fatura.
   - Expor `GET /api/customer-invoices/preconditions?client_id=...` para o frontend consumir no popup.

---

## 6) Ordem recomendada de implementação

1. **Migration:** adicionar coluna `cpf_cnpj` em `clients` (se ainda não existir).
2. **Backend — validação:**
   - Implementar `validateInvoicePreconditions(tenantId, clientId)` (checar `clientHasCpfCnpj` e `gatewayConfigured`).
   - Em `createManualInvoice`, chamar essa função **antes** de `createManualCustomerInvoice`; se não estiver ok, retornar erro (ex.: 400) com mensagens adequadas.
3. **Backend — gateway obrigatório e erros:**
   - Se `gateway` for null após `getActiveGateway`, não criar a fatura (ou já ter sido bloqueado pelo passo 2) e retornar erro.
   - No bloco do gateway, em caso de exceção em `ensureCustomerForClient` ou `createCharge`, não apenas logar: retornar erro ao cliente (e opcionalmente marcar fatura como falha se já tiver sido criada em algum fluxo alternativo).
4. **Backend — envio de CPF/CNPJ ao Asaas:**
   - No SELECT do cliente em `createManualInvoice`, incluir `cpf_cnpj` e repassar em `ensureCustomerForClient` como `cpfCnpj`.
5. **Backend — endpoint de pré-condições:**
   - Criar `GET /api/customer-invoices/preconditions?client_id=...` que chama `validateInvoicePreconditions` e retorna o objeto (ok, clientHasCpfCnpj, gatewayConfigured, errors/messages).
6. **Frontend:**
   - No fluxo de “Nova Fatura”, ao abrir o modal (ou ao selecionar cliente), chamar o endpoint de preconditions.
   - Exibir popup/modal de checklist (✔/❌) e ações “Editar cliente” / “Configurar gateway”.
   - Habilitar “Continuar” apenas quando a resposta indicar que tudo está ok.
   - Ao continuar, seguir com o formulário de criação e POST normalmente; o backend já garantirá as validações.

---

## 7) Resultado final (checklist)

- **Diagnóstico:** a cobrança não é criada no Asaas porque (A) o gateway para CRM pode não estar configurado/ativo, (B) o customer no gateway pode não ser obtido/criado (incl. falha em `ensureCustomerForClient`) ou (C) `createCharge` pode falhar; em todos os casos o código atual não retorna erro ao usuário.
- **Plano:** a integração com gateway estava prevista; falhar de forma explícita quando não houver config ou quando o gateway falhar não estava detalhado no plano.
- **Backend:** validar pré-condições (CPF/CNPJ do cliente e gateway configurado), tornar o gateway obrigatório na criação, propagar erros do gateway em vez de só logar, adicionar `clients.cpf_cnpj` e repassar ao Asaas, expor endpoint de preconditions.
- **Frontend:** popup de validação com checklist e botão “Continuar” habilitado só quando todas as pré-condições estiverem ok, usando o endpoint de preconditions e links para “Editar cliente” e “Configurar gateway”.
- **Ordem:** migration → `validateInvoicePreconditions` + uso em `createManualInvoice` → tratamento de gateway null e erros → CPF/CNPJ no Asaas → endpoint GET preconditions → frontend (popup + integração).

Com isso, fica claro por que a cobrança não aparece no Asaas, que o desenho atual “best effort” não era obrigatório pelo plano, e como corrigir e adicionar as validações de forma segura e com boa UX.
