# Execução Sandbox — Desenho A (roteiro prático)

**Base:** `docs/VALIDACAO-SANDBOX-DESENHO-A-CARTAO.md`  
**Ambiente:** `https://api-sandbox.asaas.com/v3`  
**Autenticação Asaas (igual ao cliente do projeto):** header HTTP `access_token` com o valor da chave de API do sandbox.

---

## Variáveis (preencher uma vez)

| Variável | Exemplo | Uso |
|----------|---------|-----|
| `ASAAS_API_KEY` | (sua chave sandbox) | Todas as chamadas |
| `CUSTOMER_ID` | `cus_...` | Passo 1 |
| `PAYMENT_ID` | `pay_...` | Passos 2–3 (copiar do Passo 1) |

**Bash / Git Bash:**

```bash
export ASAAS_API_KEY="cole_a_chave_aqui"
export CUSTOMER_ID="cus_xxxxxxxx"
```

**PowerShell:**

```powershell
$env:ASAAS_API_KEY = "cole_a_chave_aqui"
$env:CUSTOMER_ID = "cus_xxxxxxxx"
```

**Postman:** criar variáveis de coleção `asaas_api_key`, `base_url` = `https://api-sandbox.asaas.com/v3`, `customer_id`, `payment_id`. Header em todas as requests: `access_token` = `{{asaas_api_key}}`.

---

## Passo 0 — Cliente Asaas (só se ainda não tiver `cus_...`)

**Request**

```http
POST /v3/customers
```

**curl**

```bash
curl -sS -X POST "https://api-sandbox.asaas.com/v3/customers" \
  -H "Content-Type: application/json" \
  -H "access_token: $ASAAS_API_KEY" \
  -d '{
    "name": "Cliente Teste Desenho A",
    "email": "teste.desenhoa@example.com",
    "cpfCnpj": "24971563792",
    "phone": "4738010919"
  }'
```

Copiar o `id` retornado para `CUSTOMER_ID`.

---

## Passo 1 — Criar cobrança `CREDIT_CARD` **sem** dados de cartão

**Request exato**

```http
POST /v3/payments
```

**Corpo (JSON)** — ajuste `dueDate` para uma data **futura** (formato `AAAA-MM-DD`).

```json
{
  "customer": "{{CUSTOMER_ID}}",
  "billingType": "CREDIT_CARD",
  "value": 10.5,
  "dueDate": "2026-12-31",
  "description": "Execucao sandbox Desenho A - PainelCRM"
}
```

**curl**

```bash
curl -sS -w "\nHTTP_CODE:%{http_code}\n" -X POST "https://api-sandbox.asaas.com/v3/payments" \
  -H "Content-Type: application/json" \
  -H "access_token: $ASAAS_API_KEY" \
  -d "{
    \"customer\": \"$CUSTOMER_ID\",
    \"billingType\": \"CREDIT_CARD\",
    \"value\": 10.5,
    \"dueDate\": \"2026-12-31\",
    \"description\": \"Execucao sandbox Desenho A - PainelCRM\"
  }"
```

**Checklist — resultado esperado**

| Item | Esperado para seguir Desenho A |
|------|--------------------------------|
| HTTP | `200` |
| Corpo contém `id` | Sim — anotar como `PAYMENT_ID` |
| Corpo contém `billingType` | `CREDIT_CARD` |
| `status` | Estado **pendente** de pagamento (ex.: aguardando ação — o nome exato vem do JSON) |

**Se falhar:** anotar HTTP + JSON de erro. Se o Asaas **exigir** cartão já na criação → **critério de abort** (ver § decisão final).

---

## Passo 2 — Pagar com `payWithCreditCard`

**Request exato**

```http
POST /v3/payments/{id}/payWithCreditCard
```

Substituir `{id}` por `PAYMENT_ID` do Passo 1.

**Corpo (JSON)** — exemplo alinhado à [documentação Asaas](https://docs.asaas.com/docs/payments-via-credit-card) (cartão de **teste** sandbox; titular deve ser coerente com o cartão de teste usado na doc oficial).

```json
{
  "creditCard": {
    "holderName": "marcelo h almeida",
    "number": "5162306219378829",
    "expiryMonth": "05",
    "expiryYear": "2028",
    "ccv": "318"
  },
  "creditCardHolderInfo": {
    "name": "Marcelo Henrique Almeida",
    "email": "marcelo.almeida@gmail.com",
    "cpfCnpj": "24971563792",
    "postalCode": "89223005",
    "addressNumber": "277",
    "addressComplement": null,
    "phone": "4738010919",
    "mobilePhone": "47998781877"
  }
}
```

**curl** (definir `PAYMENT_ID` antes)

```bash
export PAYMENT_ID="pay_cole_o_id_do_passo_1"

curl -sS -w "\nHTTP_CODE:%{http_code}\n" -X POST \
  "https://api-sandbox.asaas.com/v3/payments/${PAYMENT_ID}/payWithCreditCard" \
  -H "Content-Type: application/json" \
  -H "access_token: $ASAAS_API_KEY" \
  -d '{
  "creditCard": {
    "holderName": "marcelo h almeida",
    "number": "5162306219378829",
    "expiryMonth": "05",
    "expiryYear": "2028",
    "ccv": "318"
  },
  "creditCardHolderInfo": {
    "name": "Marcelo Henrique Almeida",
    "email": "marcelo.almeida@gmail.com",
    "cpfCnpj": "24971563792",
    "postalCode": "89223005",
    "addressNumber": "277",
    "addressComplement": null,
    "phone": "4738010919",
    "mobilePhone": "47998781877"
  }
}'
```

**Checklist — resultado esperado**

| Item | Esperado |
|------|----------|
| HTTP | `200` |
| `id` no corpo | Igual a `PAYMENT_ID` |
| `status` | Indica **pago/confirmado** (valor exato conforme resposta) |

**Teste opcional de recusa:** repetir o Passo 1 com novo `PAYMENT_ID`, depois chamar `payWithCreditCard` com **número de cartão inválido** ou CVV errado; esperar `400` com `errors[]` — anotar código genérico para UX.

---

## Passo 3 — Repetir o mesmo `payWithCreditCard` (idempotência)

Reenviar **exatamente** o mesmo request do Passo 2 (mesmo `PAYMENT_ID` já pago e mesmo JSON).

**curl:** repetir o comando do Passo 2 sem alterar variáveis.

**Checklist — registrar o que ocorrer**

| Possível comportamento | Anotar qual ocorreu |
|------------------------|---------------------|
| `200` com pagamento já confirmado | |
| `400` informando que não é possível pagar novamente / já pago | |
| Outro | HTTP: ___ corpo resumido: ___ |

---

## Passo 4 — (Opcional) Consulta ao pagamento

```bash
curl -sS -H "access_token: $ASAAS_API_KEY" \
  "https://api-sandbox.asaas.com/v3/payments/${PAYMENT_ID}"
```

Confirmar `status` final coerente com o Passo 2.

---

## Decisão final

### Seguir com **Desenho A** quando **todos** forem verdadeiros

1. Passo 1 retorna **200** e um `id` de pagamento **sem** enviar cartão no corpo.
2. Passo 2 retorna **200** e o pagamento fica **capturado/confirmado** no sandbox.
3. O `id` usado no Passo 2 é **o mesmo** do Passo 1.
4. Passo 3 tem comportamento **previsível** (documentado na coluna que você preencheu) — não exige segunda cobrança líquida.

→ Atualizar `docs/VALIDACAO-SANDBOX-DESENHO-A-CARTAO.md` §7 como **viável** e seguir para implementação 3B/3C conforme especificação.

### Abortar Desenho A e preparar **Desenho B** quando **qualquer** um ocorrer

1. Passo 1 retorna **4xx** dizendo que cartão é obrigatório na criação **ou** não cria cobrança pendente utilizável.
2. Passo 2 retorna **404** no `payWithCreditCard` para um `id` recém-criado no Passo 1.
3. Passo 2 **nunca** retorna sucesso com cartões de teste oficiais (após conferir dados e CPF/cartão da documentação de testes).

→ Registrar em `VALIDACAO-SANDBOX-DESENHO-A-CARTAO.md` §8 os motivos; implementar **Desenho B** (`POST /v3/payments` com captura no mesmo request), mantendo o contrato público da Fase 3A quando for o caso.

---

## Registro rápido (copiar e colar após executar)

```
Data:
Operador:

Passo 1 HTTP: ___  payment_id: ___  status inicial: ___

Passo 2 HTTP: ___  status final: ___

Passo 3 HTTP: ___  comportamento: ___

Decisão: [ ] Desenho A  [ ] Desenho B
```
