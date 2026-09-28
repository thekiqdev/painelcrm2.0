# Validação Sandbox — Desenho A Cartão Inline

**Desenho A:** cobrança já criada no Asaas (`gateway_reference_id` = `payment id`) + **`POST /v3/payments/{id}/payWithCreditCard`** no momento do submit com dados do cartão.

**Relacionado:** `docs/ESPECIFICACAO-FASE-3A-CARTAO-INLINE.md`.

**Sobre este documento:** a **pré-validação documental** (§§3–4 inferidas da API oficial) foi preenchida com base na referência Asaas. Os **resultados observados no sandbox** (mesmo ambiente que produção de testes) devem ser **registrados pelo time** nas tabelas indicadas — **esta sessão não executou chamadas autenticadas** ao `api-sandbox.asaas.com`.

---

## 1. Objetivo

Comprovar **antes da Fase 3B/3C** se o Desenho A é **tecnicamente sustentável**:

1. O fluxo atual (ou equivalente mínimo) consegue criar uma cobrança **`CREDIT_CARD`** no Asaas **sem** capturar o cartão no `POST` inicial, obtendo um **`paymentId`** persistível como `gateway_reference_id`.
2. Esse **`paymentId`** aceita **`payWithCreditCard`** com payload válido.
3. Os **status** e **erros** retornados são compatíveis com o modelo de **tentativa ativa**, **fatura agregada**, **polling** e **webhook** já usados no PainelCRM.

Critério de sucesso: após preencher o sandbox, as seções **§7** e **§8** ficam com conclusão **“viável”** ou **“viável com ajustes listados”** — não **“bloqueado”** sem plano B (Desenho B da especificação).

---

## 2. Cenário testado

### 2.1 Pré-requisitos

- Conta **Sandbox** Asaas com chave de API (`$access_token`) e permissão **`PAYMENT:WRITE`** (e demais necessárias para criar pagamento e cliente).
- **Customer** Asaas existente (`cus_...`) ou criado via API.
- Ferramenta: Postman, Insomnia ou `curl` com TLS.

### 2.2 Passo A — Criar cobrança cartão **sem** dados de cartão no corpo

Objetivo: reproduzir o que `createCharge` com `CREDIT_CARD` faz hoje no mapper (`billingType: CREDIT_CARD`, valor, vencimento, cliente).

**Request (modelo):**

```http
POST https://api-sandbox.asaas.com/v3/payments
Authorization: $access_token
Content-Type: application/json
```

```json
{
  "customer": "cus_xxxxxxxx",
  "billingType": "CREDIT_CARD",
  "value": 10.5,
  "dueDate": "2025-12-31",
  "description": "Validacao Desenho A - PainelCRM"
}
```

**Registrar:**

| Campo | Valor observado |
|-------|-----------------|
| HTTP status | |
| `id` (paymentId) | |
| `status` | |
| `invoiceUrl` (se houver) | |
| `billingType` | |

### 2.3 Passo B — `payWithCreditCard` no mesmo `id`

**Request (modelo)** — conferir campos exatos na [referência oficial](https://docs.asaas.com/reference/pay-a-charge-with-credit-card):

```http
POST https://api-sandbox.asaas.com/v3/payments/{id}/payWithCreditCard
Authorization: $access_token
Content-Type: application/json
```

Corpo: objeto com `creditCard` e `creditCardHolderInfo` (e opcionalmente `creditCardToken` em fluxos futuros), conforme schemas `CreditCardRequestDTO` / `CreditCardHolderInfoRequestDTO` da documentação.

Use **cartões de teste** oficiais do Asaas (documentação *How to test* / cartão de crédito).

**Registrar:**

| Campo | Valor observado |
|-------|-----------------|
| HTTP status | |
| `id` (deve ser o mesmo payment) | |
| `status` após sucesso | |
| Corpo de erro em caso de recusa intencional | |

### 2.4 Passo C — Idempotência / segundo submit

Repetir **uma vez** o mesmo `payWithCreditCard` com **os mesmos dados** (ou apenas reenviar) e registrar se o Asaas retorna **200** com pagamento já confirmado, **400** específico, ou outro comportamento.

### 2.5 Passo D — Webhook (opcional nesta etapa)

Se o ambiente tiver URL de webhook configurada para Sandbox, registrar se o evento de **pagamento confirmado** chega após o Passo B e com qual atraso.

---

## 3. Resultado da criação da tentativa

### 3.1 Pré-validação (documentação + código atual)

| Ponto | Evidência |
|-------|-----------|
| O código atual envia `CREDIT_CARD` via `toAsaasPayment` sem `creditCard` no JSON | `packages/backend/src/modules/gateways/asaas/mappers/asaasMapper.ts` — corpo mínimo `customer`, `billingType`, `value`, `dueDate`, etc. |
| A API Asaas expõe criação de pagamento e, em fluxo separado, **`payWithCreditCard`** | `POST /v3/payments/{id}/payWithCreditCard`, permissão `PAYMENT:WRITE`, resposta `200` com `PaymentGetResponseDTO` |

### 3.2 Resultado sandbox — criação (preencher após Passo A)

| Pergunta | Resposta |
|----------|----------|
| O `POST /v3/payments` com apenas `CREDIT_CARD` + valor + vencimento foi **aceito** (2xx)? | |
| O `paymentId` retornado é **estável** para uso posterior? | |
| O `status` inicial é compatível com “aguardando pagamento” / pendente de captura? | |
| Há erro **impeditivo** (ex.: obrigatoriedade de cartão já na criação)? | |

**Interpretação:** Se a criação for recusada sem dados de cartão, o Desenho A **não** se sustenta como está; será necessário **Desenho B** (captura no mesmo `POST` que cria) ou ajuste na criação (conforme `ESPECIFICACAO-FASE-3A`), **sem** mudar este documento até nova rodada de testes.

---

## 4. Resultado do payWithCreditCard

### 4.1 Pré-validação (documentação oficial)

Conforme OpenAPI publicada pelo Asaas:

| Item | Detalhe |
|------|---------|
| Método | `POST /v3/payments/{id}/payWithCreditCard` |
| Permissão | `PAYMENT:WRITE` |
| Corpo | `creditCard` + `creditCardHolderInfo` **ou** `creditCardToken` (token substitui obrigatoriedade dos demais) |
| Resposta sucesso | `200`, schema alinhado a **pagamento** (`PaymentGetResponseDTO`) |
| Erros documentados | `400`, `401`, `404` |

**Nota:** O DTO **`PaymentPayWithCreditCardRequestDTO`** na referência **não** lista `remoteIp`; o `remoteIp` é destacado na documentação de **criação** de pagamento com cartão no mesmo request. Na implementação (Fase 3C), confirmar se o Asaas exige `remoteIp` em outro mecanismo ou apenas na criação — **não bloqueia** a validação do fluxo A em si.

### 4.2 Resultado sandbox — captura (preencher após Passo B)

| Pergunta | Resposta |
|----------|----------|
| `payWithCreditCard` com cartão de **teste válido** retornou **200**? | |
| O `status` do pagamento passou a **confirmado/pago** (valor exato do enum Asaas)? | |
| Cartão de teste **recusado** retornou **400** com `errors[]` previsível? | |
| O **mesmo** `{id}` do Passo A foi utilizado? | |

### 4.3 Erros observados (ampliar na execução)

| Situação | HTTP | Código / mensagem (sem dados sensíveis) |
|----------|------|----------------------------------------|
| ID inexistente | | |
| Cobrança já paga | | |
| Validação de titular/cartão | | |
| Limite / antifraude (se aparecer em sandbox) | | |

---

## 5. Estados observados

Preencher com os valores **reais** retornados pelo Asaas no sandbox (podem diferir ligeiramente de produção).

### 5.1 Antes do `payWithCreditCard`

| Entidade | Estado esperado (hipótese) |
|----------|----------------------------|
| Pagamento Asaas | Pendente / aguardando ação do portador (conforme `status` do Passo A) |
| `gateway_reference_id` no nosso modelo | = `payment id` |

**Observado:**

| Campo | Valor |
|-------|-------|
| `status` (Asaas) | |

### 5.2 Submit com sucesso

| Campo | Valor |
|-------|-------|
| HTTP | |
| `status` (Asaas) | |

### 5.3 Submit recusado

| Campo | Valor |
|-------|-------|
| HTTP | |
| Código de erro genérico (para UX) | |

### 5.4 Timeout (simular com proxy ou timeout agressivo apenas em teste)

| Campo | Valor |
|-------|-------|
| Comportamento do cliente HTTP | |
| Estado do pagamento ao consultar `GET /v3/payments/{id}` após timeout | |

### 5.5 Webhook posterior

| Campo | Valor |
|-------|-------|
| Evento recebido (tipo/nome) | |
| Atraso aproximado | |

---

## 6. Compatibilidade com a arquitetura atual

### 6.1 Tentativa ativa

| Requisito | Compatível? |
|-----------|-------------|
| Uma linha em `customer_invoice_payment_attempts` com `payment_method = CREDIT_CARD` e `gateway_reference_id = pay_...` | Sim, **se** o Passo A criar pagamento pendente com esse id. |
| Após `payWithCreditCard`, atualizar `gateway_status` / status normalizado na mesma linha | Sim, alinhado ao fluxo já usado após eventos de gateway. |

### 6.2 `customer_invoices` como agregado

| Requisito | Compatível? |
|-----------|-------------|
| Status da fatura continua derivado de regras já existentes (pago / aguardando) | Sim, desde que a normalização de status Asaas → interno seja aplicada igual ao webhook. |
| `gateway_metadata` pode deixar de priorizar `invoiceUrl` para UX de cartão | Sim, decisão de produto; metadados podem manter `invoiceUrl` só como fallback. |

### 6.3 Polling

| Requisito | Compatível? |
|-----------|-------------|
| Cliente público continua fazendo GET periódico até `paid` | Sim; após submit síncrono bem-sucedido, o GET deve refletir sucesso; se HTTP falhar, polling + webhook cobrem. |

### 6.4 Webhook posterior

| Requisito | Compatível? |
|-----------|-------------|
| Webhook permanece fonte de verdade para divergências | Sim; **não** alterar pipeline de webhook para este teste. |
| `payment_events` | Sem necessidade de mudança para validar Desenho A no sandbox. |

---

## 7. Viabilidade final

Preencher **após** completar §§3–5 no sandbox.

| Critério | Atendido? | Observação |
|----------|-----------|------------|
| Criação de cobrança `CREDIT_CARD` sem cartão no `POST` inicial | ☐ Sim ☐ Não | |
| `payWithCreditCard` no mesmo `id` conclui o pagamento com cartão de teste | ☐ Sim ☐ Não | |
| Estados e erros são mapeáveis para tentativa/fatura | ☐ Sim ☐ Não | |
| Segundo envio não gera segunda cobrança indevida (comportamento claro) | ☐ Sim ☐ Não | |

**Conclusão (marcar uma):**

- ☐ **Desenho A viável:** prosseguir com implementação conforme `ESPECIFICACAO-FASE-3A-CARTAO-INLINE.md` (Fases 3B/3C).
- ☐ **Desenho A viável com ajustes:** listar em §8.
- ☐ **Desenho A inviável no sandbox:** acionar **Desenho B** (mesmo contrato público; backend altera orquestração) conforme §9 da especificação.

**Texto livre:**

---

## 8. Ajustes necessários antes de implementar 3B/3C

Listar apenas o que for **obrigatório** após os testes (ex.: campo extra no `payWithCreditCard`, mudança na criação da cobrança, confirmação de `remoteIp`, limites de valor no sandbox).

| # | Ajuste | Impacto |
|---|--------|---------|
| 1 | | |
| 2 | | |

---

## Referências

- [Pay a charge with a credit card](https://docs.asaas.com/reference/pay-a-charge-with-credit-card) — Asaas API.
- [Credit Card Charges](https://docs.asaas.com/docs/payments-via-credit-card) — fluxo criação + `invoiceUrl` vs cartão no mesmo request.
- `docs/ESPECIFICACAO-FASE-3A-CARTAO-INLINE.md` — contrato público e matriz de estados.
