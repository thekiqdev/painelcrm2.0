# Guia de instalação — PIX Recorrente (Pix Automático Asaas)

Documento para ensinar **outro sistema** a implementar o mesmo produto que no PainelCRM chamamos de **PIX Recorrente**.

Na API Asaas o nome oficial é **Pix Automático** (autorização BACEN, **Jornada 3**). Não é “gerar um PIX avulso a cada renovação”. Também **não** é a Assinatura nativa do Asaas (`/subscriptions`) como fonte da verdade do ciclo.

| Conceito no produto | Conceito Asaas |
|---------------------|----------------|
| PIX Recorrente | Pix Automático / Automatic Pix |
| Primeiro pagamento + consentimento | Autorização com QR composto (`immediateQrCode`) |
| Débito dos ciclos seguintes | Cobrança `POST /v3/payments` com `pixAutomaticAuthorizationId` (modo `MANUAL`) |
| PIX avulso (legado) | `POST /v3/payments` **sem** `pixAutomaticAuthorizationId` |

Referências oficiais:

- [Pix Automático](https://docs.asaas.com/docs/pix-automatico)
- [Implementação](https://docs.asaas.com/docs/pix-automatico-implementacao)
- [Criar autorização](https://docs.asaas.com/reference/criar-uma-autorizacao-pix-automatico)
- [FAQ](https://docs.asaas.com/docs/automatic-pix-faq)
- [Criar cobrança](https://docs.asaas.com/reference/criar-nova-cobranca)

---

## 1. Princípio de arquitetura (obrigatório)

O **seu sistema** é o cérebro:

- ciclo, valor, vencimento, fatura, “pago / atrasado / suspenso”;
- quando criar autorização e quando criar instrução do próximo ciclo;
- fallback para PIX avulso se a autorização cair.

O **Asaas** é o executor:

- gera o QR composto;
- processa o débito no banco do pagador;
- dispara webhooks.

**Não** use a Assinatura nativa Asaas (`paymentCreationMode: SUBSCRIPTION`) se o ciclo de negócio já vive no seu banco. O PainelCRM usa **`paymentCreationMode: MANUAL`**: cada ciclo o backend cria a cobrança.

---

## 2. Pré-requisitos da conta Asaas (elegibilidade)

Sem isso a API de autorização falha (404 / produto não habilitado). **Não há endpoint de health** confiável: validar com o gerente Asaas e um `POST` de teste.

A conta recebedora precisa:

1. Ser **pessoa jurídica** (conta PF **não** é elegível).
2. Estar **aprovada**, sem pendência cadastral.
3. CNPJ **ativo** na Receita Federal.
4. CNPJ ativo há **pelo menos 6 meses**.
5. Sem flags de fraude relacionadas a Pix.
6. Pix Automático **liberado** na conta (sandbox e produção são contas diferentes; sandbox pode diferir de produção).

Se a conta deixar de ser elegível, o Asaas cancela autorizações e instruções ativas e envia:

`PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED` com `eligibility.status = INELIGIBLE`.

O sistema deve, nesse caso, cair para PIX avulso / outro método e **não** tentar criar novas instruções.

Ambientes:

| Ambiente | Base URL |
|----------|----------|
| Sandbox | `https://api-sandbox.asaas.com/v3` |
| Produção | `https://api.asaas.com/v3` |

---

## 3. Autenticação HTTP (todas as chamadas)

### Headers obrigatórios nas chamadas à API

| Header | Obrigatório | Valor |
|--------|-------------|--------|
| `access_token` | **Sim** | API Key da conta Asaas |
| `Content-Type` | **Sim** (POST/PUT) | `application/json` |
| `User-Agent` | **Sim (exigência Asaas)** | Identificador da aplicação, ex. `MeuSistema/1.0.0`. Sem User-Agent a API pode recusar a requisição. |

Não envie a API Key no query string. Não commite a chave. Produção e sandbox usam chaves distintas.

Timeouts: chamadas de autorização/cobrança podem demorar; o PainelCRM usa ~40s (e não retenta `POST` de autorização em 4xx, para não duplicar QR).

---

## 4. Cadastro do cliente no Asaas (pré-condição da autorização)

A autorização **exige** `customerId` de um cliente já criado.

```http
POST /v3/customers
```

### Campos do customer

| Campo | Obrigatório na prática | Notas |
|-------|------------------------|--------|
| `name` | **Sim** | Nome do pagador |
| `cpfCnpj` | **Sim** para Pix Automático | Só dígitos. CPF (11) ou CNPJ (14). Sem documento o Asaas / o banco recusa a autorização |
| `email` | Recomendado | O PainelCRM envia |
| `phone` | Recomendado | Só dígitos |
| `postalCode`, `address`, `addressNumber`, `province`, `city`, `state` | Opcional | Útil para cadastro completo |
| `externalReference` | **Fortemente recomendado** | ID interno (fatura, cliente, tenant). Ajuda a reconciliar webhooks |
| `notificationDisabled` | Opcional | `true` se o **seu** sistema notifica o cliente e você não quer e-mail/SMS nativo do Asaas |

Resposta: grave `id` (`cus_…`). Reuse o mesmo customer em todos os ciclos daquela autorização.

O PainelCRM **não oferece** o switch de PIX Recorrente se o cadastro não tiver CPF/CNPJ válido.

---

## 5. Webhook — instalar **antes** do primeiro QR

Sem os eventos `PIX_AUTOMATIC_*`, a autorização nunca muda de `pending` para `active` no seu banco (o pagador pode ter pago no banco e o seu sistema continua “aguardando”).

```http
POST /v3/webhooks
```

### Campos do webhook

| Campo | Obrigatório | Notas |
|-------|-------------|--------|
| `name` | **Sim** | Nome interno, ex. `Pagamentos` |
| `url` | **Sim** | HTTPS público do seu backend. **Não** use localhost |
| `email` | Recomendado | E-mail para alertas de falha do webhook no Asaas |
| `enabled` | **Sim** | `true` |
| `interrupted` | Enviar `false` | |
| `apiVersion` | **Sim** | `3` |
| `authToken` | **Sim** | Segredo que o Asaas reenvia no header `asaas-access-token`. Compare no seu endpoint |
| `sendType` | Recomendado | `SEQUENTIALLY` |
| `events` | **Sim** | Lista abaixo — **não omitir** os de Pix Automático |

### Eventos `PAYMENT_*` (liquidação da cobrança)

Mantenha os que você já usa. Mínimo para PIX Recorrente:

- `PAYMENT_CREATED`
- `PAYMENT_UPDATED`
- `PAYMENT_CONFIRMED`
- `PAYMENT_RECEIVED`
- `PAYMENT_OVERDUE`
- `PAYMENT_DELETED`
- `PAYMENT_REFUNDED`
- `PAYMENT_RESTORED`
- `PAYMENT_REFUND_IN_PROGRESS`
- `PAYMENT_CHARGEBACK_REQUESTED`
- `PAYMENT_CHARGEBACK_DISPUTE`
- `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`

### Eventos Pix Automático (**todos obrigatórios** se for oferecer o produto)

Autorização:

- `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED`
- `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED`
- `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED`
- `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED`
- `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED`

Instrução de pagamento:

- `PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CREATED`
- `PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED`
- `PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED`
- `PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CANCELLED`

Conta:

- `PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED`

**Armadilha:** reutilizar um webhook já existente **pela mesma URL** no Asaas **não atualiza** a lista de `events`. Tenants/contas antigas precisam **recriar** o webhook (ou editar no painel Asaas e marcar os eventos novos). Sem isso, PIX Recorrente “está no código” mas os eventos nunca chegam.

### Payload genérico do webhook

O body é JSON. Sempre extraia:

| Campo | Obrigatório no envelope | Uso |
|-------|-------------------------|-----|
| `id` | **Sim** | Idempotência (`event_id`) |
| `event` | **Sim** | Tipo do evento |
| `payment` | Presente nos `PAYMENT_*` | Cobrança |
| `authorization` **ou** `pixAutomaticRecurringAuthorization` **ou** `pixAutomaticAuthorization` | Presente nos eventos de auth | O Asaas já enviou nomes diferentes. Aceite os três |
| `pixAutomaticRecurringPaymentInstruction` **ou** `paymentInstruction` | Eventos de instrução | |
| `eligibility` | Evento de elegibilidade | |

Autenticação do POST no **seu** servidor: header `asaas-access-token` = `authToken` cadastrado. Responda **200** rápido após persistir o evento; processe de forma idempotente.

---

## 6. Fluxo ponta a ponta

```
1. Cliente no Asaas (cpfCnpj)
2. POST /pix/automatic/authorizations  → QR composto
3. Mostrar payload / encodedImage ao pagador
4. Pagador paga no app do banco (1ª cobrança + autoriza recorrência)
5. Webhook AUTHORIZATION_ACTIVATED  (+ PAYMENT_RECEIVED de cobrança NOVA)
6. Seu sistema marca fatura PAGA e auth ACTIVE
7. Próximos ciclos: POST /payments com pixAutomaticAuthorizationId
   somente entre 2 e 10 dias úteis antes do vencimento
8. Liquidação dos ciclos seguintes: PAYMENT_CONFIRMED / PAYMENT_RECEIVED
```

A criação da autorização **não** deixa a autorização `ACTIVE`. Só o pagamento do QR composto + consentimento no banco faz isso.

---

## 7. Criar autorização (Jornada 3) — campos obrigatórios

```http
POST /v3/pix/automatic/authorizations
```

### 7.1 Corpo — campos obrigatórios da API Asaas

O schema oficial marca como **required** no root:

| Campo | Tipo | Obrigatório | Regras |
|-------|------|-------------|--------|
| `customerId` | string | **Sim** | `cus_…` existente |
| `frequency` | enum | **Sim** | `WEEKLY` \| `MONTHLY` \| `QUARTERLY` \| `SEMIANNUALLY` \| `ANNUALLY` |
| `contractId` | string | **Sim** | Identificador do contrato no **seu** sistema. **Máx. 35 caracteres** |
| `startDate` | date `YYYY-MM-DD` | **Sim** | Início da vigência / pagamentos |
| `immediateQrCode` | objeto | **Sim** | Primeira cobrança + consentimento |

Dentro de `immediateQrCode`, o schema oficial marca como **required**:

| Campo | Tipo | Obrigatório | Regras |
|-------|------|-------------|--------|
| `expirationSeconds` | integer | **Sim** | Validade do QR da 1ª cobrança em segundos. Sem isso a API rejeita. PainelCRM usa `3600` (1 hora) se não houver outro valor |
| `originalValue` | number | **Sim** | Valor da **primeira** cobrança (reais, não centavos). Ex.: `99.90` |

### 7.2 Campos fortemente recomendados (o PainelCRM envia)

| Campo | Obrigatório API? | Por que enviar |
|-------|------------------|----------------|
| `paymentCreationMode` | Default `MANUAL` | Envie **`MANUAL`** explicitamente se o seu sistema cria cada ciclo. Se usar `SUBSCRIPTION`, **`value` no root passa a ser obrigatório** e o Asaas gera as cobranças sozinho (você perde o controle do ciclo) |
| `retryPolicy` | Default `NOT_ALLOWED` | `NOT_ALLOWED` ou `ALLOW_THREE_IN_SEVEN_DAYS` (até 3 retentativas nos 7 dias após o vencimento). Decida e envie; não deixe implícito se a operação comercial depende disso. PainelCRM usa `NOT_ALLOWED` |
| `value` (root) | Condicional | Valor **fixo** das cobranças periódicas. Se enviar, **não poderá alterar o valor nas instruções seguintes** na mesma autorização. Se omitir, cada ciclo pode ter valor diferente. Se `paymentCreationMode = SUBSCRIPTION`, **obrigatório**. PainelCRM envia o valor da fatura atual |
| `description` | Não | **Máx. 35 caracteres** |
| `finishDate` | Não | `YYYY-MM-DD`. Omitir = prazo indeterminado. Envie se a assinatura tem número máximo de ciclos |
| `minLimitValue` | Não | Piso se o pagador definir teto. **Proibido** se `value` (valor fixo) estiver preenchido |

`immediateQrCode` — campos extras que o PainelCRM envia (úteis na prática; o schema mínimo oficial não os lista como required):

| Campo | PainelCRM | Notas |
|-------|-----------|--------|
| `value` | igual a `originalValue` | Algumas versões da API aceitam os dois |
| `dueDate` | vencimento da 1ª fatura `YYYY-MM-DD` | |
| `description` | texto da 1ª cobrança, máx. 35 | |
| `pixKey` | não enviado | Opcional: chave Pix da 1ª cobrança; em geral a conta Asaas já tem chave |

### 7.3 Exemplo mínimo válido (oficial)

```json
{
  "customerId": "cus_000005735721",
  "frequency": "MONTHLY",
  "contractId": "CONTRACT-123",
  "startDate": "2026-10-01",
  "immediateQrCode": {
    "expirationSeconds": 3600,
    "originalValue": 99.9
  }
}
```

### 7.4 Exemplo alinhado ao PainelCRM (recomendado para outro sistema)

```json
{
  "customerId": "cus_000005735721",
  "frequency": "MONTHLY",
  "contractId": "saas-a1b2c3d4e5f6g7h8i9j0k1l2m3n",
  "startDate": "2026-10-15",
  "finishDate": "2027-10-15",
  "value": 99.9,
  "description": "Assinatura Plano Pro",
  "paymentCreationMode": "MANUAL",
  "retryPolicy": "NOT_ALLOWED",
  "immediateQrCode": {
    "originalValue": 99.9,
    "value": 99.9,
    "dueDate": "2026-10-15",
    "description": "1a cobranca",
    "expirationSeconds": 3600
  }
}
```

`contractId` e `description`: truncar em 35 caracteres **antes** de enviar.

Mapa de frequência (intervalo do seu produto → Asaas):

| Seu intervalo | `frequency` |
|---------------|-------------|
| semanal | `WEEKLY` |
| mensal | `MONTHLY` |
| trimestral | `QUARTERLY` |
| semestral | `SEMIANNUALLY` |
| anual | `ANNUALLY` |

### 7.5 O que persistir na resposta

Grave no **seu** banco (não só no Asaas):

| Dado | Onde vem | Uso |
|------|----------|-----|
| `id` da autorização | root `id` | **Obrigatório** para ciclos futuros e webhooks |
| `status` | root (`CREATED` → trate como pending; `ACTIVE`; `CANCELLED`; `REFUSED`; `EXPIRED`) | Switch / elegibilidade de instrução |
| `payload` (copia e cola) | root e/ou `immediateQrCode.payload` | UX do checkout |
| `encodedImage` | root e/ou `immediateQrCode.encodedImage` | QR; pode vir base64 **sem** prefixo `data:image/png;base64,` — acrescente se for usar em `<img src>` |
| `immediateQrCode.conciliationIdentifier` | resposta da auth | Conciliar o 1º pagamento (veja §9) |
| `contractId` | eco | Auditoria |

Status local sugerido: `pending` \| `active` \| `cancelled` \| `expired` \| `refused` \| `cleared` (opt-out do usuário no seu produto).

---

## 8. UX do primeiro pagamento

1. Mostre o QR / copia-e-cola do **payload da autorização**, não o PIX avulso antigo (se houver).
2. Explique: o pagador autoriza **uma vez** no banco; os ciclos seguintes debitam sozinhos.
3. Enquanto `status != ACTIVE`, não crie instrução recorrente.
4. Se o usuário desligar o switch: `DELETE /v3/pix/automatic/authorizations/{id}` e volte a exibir PIX avulso.

Consultar autorização:

```http
GET /v3/pix/automatic/authorizations/{authorizationId}
```

Cancelar:

```http
DELETE /v3/pix/automatic/authorizations/{authorizationId}
```

---

## 9. Liquidar o 1º pagamento — não pule esta seção

Este é o ponto que mais quebra implementação nova.

### O que o Asaas faz

O pagador paga o QR composto. O Asaas gera uma **cobrança nova**, muitas vezes com:

- `payment.id` **diferente** de qualquer PIX avulso que você tenha criado antes;
- `externalReference` **nulo**;
- descrição do tipo “Cobrança gerada automaticamente a partir de Pix recebido.”;
- `conciliationIdentifier` **às vezes ausente** no webhook;
- `pixQrCodeId` presente (ex.: sufixo `…ASA`) — **o mesmo valor** que `immediateQrCode.conciliationIdentifier` da autorização.

Se o seu handler de `PAYMENT_RECEIVED` só busca fatura por `payment.id` = id da cobrança avulsa, a fatura **fica pendente** mesmo com dinheiro no Asaas.

### Regras obrigatórias (dupla via)

**Via A — PAYMENT_RECEIVED / PAYMENT_CONFIRMED**

Resolver a fatura aberta por, nesta ordem:

1. `payment.id` = `gateway_reference_id` da fatura (se você já tiver gravado o id da cobrança automática);
2. `payment.conciliationIdentifier` = `conciliationIdentifier` gravado na autorização/fatura;
3. se (2) vier vazio: `payment.pixQrCodeId` como chave de conciliação.

**Via B — PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED**

Por definição da Jornada 3, se a autorização ficou `ACTIVE` o 1º Pix **já liquidou**. Ache a fatura aberta pela `authorization.id` e marque **paga**. Não dependa só da Via A.

### Idempotência ≠ recuperação

Se o webhook chegou, você respondeu 200 e marcou o `event.id` como processado **sem** achar a fatura, **reenviar o mesmo evento no painel Asaas não corrige**. Precisa de job/script de conciliação com o `paymentId` novo + `pixQrCodeId`.

Exemplo de envelope de ativação (oficial):

```json
{
  "id": "evt_...",
  "event": "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",
  "authorization": {
    "id": "d51008fa-e28e-4823-82b4-4b1fcf485229",
    "status": "ACTIVE",
    "customerId": "cus_000006869125",
    "frequency": "MONTHLY",
    "value": 2.00,
    "startDate": "2025-08-01",
    "finishDate": "2028-01-01",
    "immediateQrCode": {
      "conciliationIdentifier": "ASAAS000000000000000000000000550ASA",
      "expirationDate": "2025-07-24 18:00:20"
    }
  }
}
```

**Critério de aceite:** Asaas mostra pagamento RECEIVED **e** autorização ACTIVE **e** a fatura **no seu sistema** está paga. Se só o Asaas estiver pago → implementação incompleta.

---

## 10. Ciclos seguintes — criar instrução (modo MANUAL)

Só com autorização **ACTIVE**.

```http
POST /v3/payments
```

### Campos obrigatórios da cobrança + Pix Automático

| Campo | Obrigatório | Notas |
|-------|-------------|--------|
| `customer` | **Sim** | Mesmo `cus_…` da autorização |
| `billingType` | **Sim** | **`PIX`** |
| `value` | **Sim** | Reais. Se a autorização foi criada **com** `value` fixo, este valor precisa ser **o mesmo**. Se a autorização foi criada **sem** `value`, pode variar |
| `dueDate` | **Sim** | `YYYY-MM-DD` |
| `pixAutomaticAuthorizationId` | **Sim para ser recorrente** | `id` da autorização. **Sem este campo a cobrança vira PIX convencional** |

Recomendados:

| Campo | Motivo |
|-------|--------|
| `description` | Extrato / fatura |
| `externalReference` | Seu ID de fatura/cliente — **crítico** para o webhook achar a entidade nos ciclos seguintes |
| `notificationEnabled` | `false` se o seu sistema notifica |

Exemplo:

```json
{
  "customer": "cus_000005219613",
  "billingType": "PIX",
  "value": 99.9,
  "dueDate": "2026-11-15",
  "description": "Renovação novembro",
  "externalReference": "invoice-uuid-ou-id-interno",
  "notificationEnabled": false,
  "pixAutomaticAuthorizationId": "d51008fa-e28e-4823-82b4-4b1fcf485229"
}
```

Grave o `id` da cobrança retornada (`pay_…`) na fatura (`gateway_reference_id`). A liquidação deste ciclo **é** `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` — os eventos `PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_*` informam o **ciclo da instrução**, não substituem o “pago”.

`POST /payments` **não** devolve o QR. Para PIX avulso você busca `GET /v3/payments/{id}/pixQrCode`. Na instrução automática o débito é no banco; QR extra é opcional.

### Janela BACEN / Asaas (obrigatória)

Crie a instrução **entre 2 e 10 dias úteis** antes do `dueDate`. Fora da janela a API recusa.

- Conte **dias úteis** (segunda a sexta). Feriados nacionais o Asaas pode considerar; o PainelCRM conta seg–sex em UTC, **sem** feriados.
- Se o worker gera a fatura **no dia do vencimento**, a instrução falha. Antecipe a geração (`dueDate` no futuro, 2–10 úteis à frente).
- Se estiver fora da janela: gere **PIX avulso** (sem `pixAutomaticAuthorizationId`) para não perder a cobrança.

Algoritmo equivalente ao PainelCRM (`countBusinessDaysUntil`): a partir de amanhã até o vencimento, some dias cujo `getUTCDay()` não é 0 nem 6; aceite se o total está em `[2, 10]`.

### Split

Split **não** é suportado na **criação da autorização**. Nas cobranças seguintes da mesma autorização, split pela API de cobrança é permitido (FAQ Asaas).

### Saldo insuficiente no vencimento

A instrução expira; a cobrança vai para `OVERDUE` e chega `PAYMENT_OVERDUE`. Retentativa no mesmo dia (intraday BACEN) depende do banco; política `ALLOW_THREE_IN_SEVEN_DAYS` cobre dias seguintes se você habilitou na autorização.

---

## 11. Cancelar cobranças duplicadas do ciclo

Quando a fatura interna for liquidada (1º pagamento ou ciclo):

- Cancele no Asaas (`DELETE /v3/payments/{id}`) outras cobranças **abertas daquela fatura** (PIX avulso antigo, instrução duplicada), **exceto** o payment vencedor.
- **Não** cancele a **autorização** só porque o ciclo pagou. A autorização serve o próximo ciclo.
- Cancele a autorização só se: usuário desligar o débito automático, cancelar o plano, ou auth recusada/expirada.

---

## 12. O que persistir no seu banco (mínimo)

Não use o Asaas como SSOT do produto.

| Dado | Persistência |
|------|----------------|
| `pix_automatic_authorization_id` | Na **assinatura** (não só na fatura) |
| `pix_automatic_auth_status` | pending / active / cancelled / expired / refused / cleared |
| `pix_automatic_conciliation_id` | Autorização + metadata da fatura do 1º pagamento |
| QR pending | payload + imagem; **apagar** quando status virar `active` |
| Preferência do usuário (switch) | Na assinatura. Se gravar só no front ou só na fatura, o próximo ciclo quebra |
| `gateway_reference_id` | Payment id da cobrança **atual** do ciclo |
| `externalReference` enviado ao Asaas | Mesmo ID que você consegue achar no webhook |

A fatura de checkout precisa existir **ligada a uma assinatura** **antes** de `POST …/authorizations`. Sem `subscription_id` (ou equivalente) não há onde guardar a auth entre o 1º pagamento e a renovação.

---

## 13. Fallback e recusas

| Evento / situação | Ação no seu sistema |
|-------------------|---------------------|
| Auth `REFUSED` / `CANCELLED` / `EXPIRED` | Status local; próximo ciclo = PIX avulso até nova autorização |
| `PAYMENT_INSTRUCTION_REFUSED` / `CANCELLED` | Fallback PIX avulso se a política comercial pedir |
| Fora da janela 2–10 úteis | PIX avulso |
| Conta `INELIGIBLE` | Parar instruções; PIX avulso / outro método |
| Flag de produto OFF | Fluxo legado (só PIX avulso); colunas de auth podem ficar inertes |

---

## 14. Feature flags (como o PainelCRM isolou o risco)

Não ligue Pix Automático em produção sem piloto.

No PainelCRM:

| Flag | Default | Escopo |
|------|---------|--------|
| `billing2.pix_automatic` | OFF | Cobrança SaaS (plano da plataforma) |
| `crm.pix_automatic` | OFF | Cobrança CRM (faturas dos clientes do tenant) |
| Policy `pix_automatic_enabled` | OFF | Só emite ação de instrução se a flag também estiver ON |

Dois produtos, duas flags. Não unificar.

---

## 15. Checklist de instalação (copiar para o outro sistema)

### Conta e ops

- [ ] Conta Asaas PJ, aprovada, CNPJ ≥ 6 meses, Pix Automático liberado (sandbox **e** produção, cada um)
- [ ] API Key no cofre / env, nunca no git
- [ ] `User-Agent` em todas as requests
- [ ] URL pública HTTPS do webhook (não localhost)

### Webhook

- [ ] Webhook `apiVersion: 3` com `authToken`
- [ ] Todos os `PAYMENT_*` necessários
- [ ] Todos os `PIX_AUTOMATIC_RECURRING_*` (auth + instruction + eligibility)
- [ ] Contas antigas: **recreate** webhook (reuso por URL não atualiza events)
- [ ] Handler valida `asaas-access-token`
- [ ] Idempotência por `id` do evento
- [ ] Parser aceita `authorization` **e** `pixAutomaticRecurringAuthorization`
- [ ] Parser de pagamento usa `conciliationIdentifier` **ou** `pixQrCodeId`

### Cliente

- [ ] `POST /customers` com `name` + `cpfCnpj` (dígitos)
- [ ] `externalReference` interno
- [ ] UI bloqueia PIX Recorrente sem CPF/CNPJ válido

### Autorização (1º pagamento)

- [ ] Envia **todos** os required: `customerId`, `frequency`, `contractId` (≤35), `startDate`, `immediateQrCode.expirationSeconds`, `immediateQrCode.originalValue`
- [ ] `paymentCreationMode: MANUAL` (se o ciclo é seu)
- [ ] `retryPolicy` explícita
- [ ] Persiste `id`, QR, `conciliationIdentifier`
- [ ] Assinatura/ciclo interno já existe **antes** do POST
- [ ] Via A (PAYMENT_*) **e** Via B (AUTHORIZATION_ACTIVATED) liquidam a fatura
- [ ] Smoke: Asaas RECEIVED + auth ACTIVE **e** fatura interna `paid`

### Instruções

- [ ] Só se auth `ACTIVE`
- [ ] `POST /payments` com `customer`, `billingType: PIX`, `value`, `dueDate`, **`pixAutomaticAuthorizationId`**
- [ ] `externalReference` da fatura do ciclo
- [ ] Janela 2–10 dias úteis
- [ ] Worker antecipa geração da fatura (não gerar só no dia do vencimento)
- [ ] Sem `pixAutomaticAuthorizationId` = PIX avulso (fallback consciente)

### Anti-duplicidade e cancelamento

- [ ] Ao pagar: cancelar payments abertos do **mesmo ciclo**, não a autorização
- [ ] Switch OFF / cancelar plano: `DELETE` da autorização
- [ ] Valor fixo na auth: não tentar mudar `value` nas instruções; senão cancele a auth e crie outra

### Aceite piloto (GO / NO-GO)

| # | Critério | GO se |
|---|----------|--------|
| 1 | Flag OFF | PIX avulso legado sem regressão |
| 2 | Flag ON + webhook recriado | Eventos `PIX_AUTOMATIC_*` chegam |
| 3 | Checkout | Switch + QR composto |
| 4 | Opt-out | OFF cancela auth e restaura PIX avulso |
| 5 | **1º pagamento** | Auth ACTIVE **e** fatura interna paga |
| 6 | Renovação staging | Instrução com `pixAutomaticAuthorizationId` na janela |
| 7 | Órfão simulado | Script/conciliação recupera; reenvio do mesmo webhook **não** é o plano de recovery |

**NO-GO** se o item 5 falhar.

---

## 16. Endpoints Asaas usados nesta instalação

| Método | Path | Quando |
|--------|------|--------|
| `POST` | `/v3/customers` | Garantir pagador |
| `GET`/`PUT` | `/v3/customers/{id}` | Atualizar documento |
| `POST` | `/v3/webhooks` | Provisionar eventos |
| `GET` | `/v3/webhooks` | Listar / detectar webhook antigo sem eventos novos |
| `POST` | `/v3/pix/automatic/authorizations` | QR composto |
| `GET` | `/v3/pix/automatic/authorizations/{id}` | Poll / suporte |
| `DELETE` | `/v3/pix/automatic/authorizations/{id}` | Opt-out / cancelar plano |
| `POST` | `/v3/payments` | Instrução do ciclo (com `pixAutomaticAuthorizationId`) ou PIX avulso |
| `GET` | `/v3/payments/{id}` | Status |
| `GET` | `/v3/payments/{id}/pixQrCode` | QR do PIX avulso |
| `DELETE` | `/v3/payments/{id}` | Cancelar cobrança aberta do ciclo |

---

## 17. Onde isto vive no PainelCRM (referência de implementação)

Para conferir payloads reais no código:

- Cliente HTTP e `createPixAutomaticAuthorization`: `packages/backend/src/modules/gateways/asaas/client/asaasClient.ts`
- Mapper da cobrança (`pixAutomaticAuthorizationId`): `packages/backend/src/modules/gateways/asaas/mappers/asaasMapper.ts`
- Eventos de webhook: `packages/backend/src/modules/gateways/asaas/asaasEvents.ts`
- Lista provisionada no connect: `packages/backend/src/services/asaasIntegrationService.ts`
- Jornada SaaS: `packages/backend/src/services/billing2/billingPixAutomaticService.ts`
- Jornada CRM: `packages/backend/src/services/crm/crmPixAutomaticService.ts`
- Janela 2–10 úteis: `packages/backend/src/services/billing2/billingPixAutomaticStore.ts`
- Parser `pixQrCodeId` → conciliação: `packages/backend/src/modules/gateways/asaas/webhooks/asaasWebhookParser.ts`
- Lição do 1º pagamento órfão: `docs/architecture/commercial/crm-pix-automatic/LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md`

---

## 18. Erros comuns

| Sintoma | Causa típica |
|---------|----------------|
| 401 na API | `access_token` errado ou ambiente sandbox/prod invertido |
| Recusa sem User-Agent | Header `User-Agent` ausente |
| 400 na autorização | Faltou `expirationSeconds` ou `originalValue` no `immediateQrCode`; `contractId`/`description` > 35 |
| 404 / produto não habilitado | Conta inelegível ou Pix Automático não liberado |
| Auth nunca fica ACTIVE no seu banco | Webhook sem eventos `PIX_AUTOMATIC_*` (webhook reutilizado) |
| Asaas pago, fatura pendente | Lookup só por `payment.id` antigo; falta Via B no `AUTHORIZATION_ACTIVATED` |
| Instrução recusada | Fora da janela 2–10 úteis; auth não ACTIVE; `value` diferente do valor fixo da auth |
| Cobrança gerada mas cliente precisa pagar QR de novo | Esqueceu `pixAutomaticAuthorizationId` |
| Valor da renovação não muda | Auth criada com `value` fixo — precisa cancelar e autorizar de novo |
| Reenvio de webhook não conserta fatura | Evento já idempotente como processado — usar conciliação manual |
