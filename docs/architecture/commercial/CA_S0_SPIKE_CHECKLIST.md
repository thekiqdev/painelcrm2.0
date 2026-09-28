# CA S0 — Spike + checklist (Cartão → Assinatura Asaas)

| Campo | Valor |
|-------|-------|
| **Sprint** | CA S0 |
| **Data** | 2026-09-28 |
| **Tipo** | Discovery / ops |
| **Plano-mãe** | [PLAN_SPRINTS_CA_CARTAO_ASSINATURA_ASAAS.md](./PLAN_SPRINTS_CA_CARTAO_ASSINATURA_ASAAS.md) |
| **Status eng** | **S0–S5 feitos** — este doc é o gate **ops** antes de produção |

---

## 1. Auditoria de código (eng — histórico S0; estado atual)

| Achado | Situação atual (pós S1–S5) |
|--------|----------------------------|
| Cliente HTTP Assinatura | **S1** — `create/update/cancel/get` + `listSubscriptionPayments` |
| Timeout cartão | ≥65s, sem retry na criação |
| Capability `asaasSubscription` | **S1** no catálogo Asaas |
| Coluna `asaas_subscription_id` | **S2** — migração `337_…` |
| Checkout cartão → Assinatura | **S2** |
| Webhook `pay_` da Assinatura → `plan_renewal` | **S3** |
| Sync valor/ciclo + cancel | **S4** |
| Job skip charge se `asaas_subscription_id` | **S5** + flag `asaas_subscription_owns_card_renewal` |
| PIX Recorrente | Continua **fora** de `/subscriptions` (D-CA.2) |

Endpoint webhook app: `POST /api/webhooks/asaas`.

---

## 2. Checklist ops (preencher humano)

Sandbox e produção são contas **diferentes**. Marque **OK** só com evidência (painel Asaas / log).

| # | Item | Sandbox | Produção | Quem | Data | OK? |
|---|------|---------|----------|------|------|-----|
| 1 | Conta aprovada + cartão de crédito liberado | | | | | |
| 2 | Tokenização liberada (sandbox: doc Asaas; **prod: gerente**) | Doc: sim | | | | |
| 3 | App de checkout em **HTTPS** (domínio real) | | | | | |
| 4 | Webhook **Cobranças** (`PAYMENT_*`) → URL PainelCRM + token auth | | | | | |
| 5 | Webhook **Assinaturas** (`SUBSCRIPTION_*`) → **mesma** URL | | | | | |
| 6 | Token webhook **≠** API Key | | | | | |
| 7 | Cartão sandbox **aprovação** | | N/A | | | |
| 8 | Cartão sandbox **recusa** | | N/A | | | |
| 9 | Após criar `sub_…`: log/evento Assinatura chega no app | | | | | |
| 10 | `PAYMENT_*` da sub traz `payment.subscription` | | | | | |
| 11 | Flag S5 ON (`asaas_subscription_owns_card_renewal`) no ambiente | | | | | |

**Gates**

| Gate | Exige |
|------|--------|
| **Sandbox E2E (recomendado agora)** | 1, 3–11 sandbox + spike §3 |
| **Produção cartão Assinatura** | 1–6 + 2 (tokenização) + 11 produção + spike sandbox OK |
| **S4 prod (trocar valor/cartão sem PAN)** | item **2 produção** obrigatório |

### Eventos a marcar no painel Asaas

**Assinaturas** (`ASAAS_SUBSCRIPTION_WEBHOOK_EVENT_NAMES`):

- `SUBSCRIPTION_CREATED`
- `SUBSCRIPTION_UPDATED`
- `SUBSCRIPTION_INACTIVATED`
- `SUBSCRIPTION_DELETED`
- (+ split só se usar)

**Cobranças** (já usados + CA):

- `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`
- `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED`, …
- `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` (se a UI listar)

URL típica: `https://<seu-domínio>/api/webhooks/asaas`  
Header: `asaas-access-token` = token configurado em `payment_gateway_configs` (não a API Key).

---

## 3. Procedimento spike sandbox (manual)

Pré: API Key **sandbox**, customer `cus_…`, webhook público (ou tunnel) apontando para o ambiente.

### 3.1 Criar assinatura (cartão de teste Asaas)

```http
POST https://api-sandbox.asaas.com/v3/subscriptions
access_token: $ASAAS_API_KEY
Content-Type: application/json
User-Agent: PainelCRM-CA-S0/1.0
```

```json
{
  "customer": "cus_XXXX",
  "billingType": "CREDIT_CARD",
  "nextDueDate": "YYYY-MM-DD",
  "value": 59.9,
  "cycle": "MONTHLY",
  "description": "CA S0 spike",
  "externalReference": "ca-s0-spike",
  "creditCard": {
    "holderName": "TESTE NOME",
    "number": "5162306219378829",
    "expiryMonth": "05",
    "expiryYear": "2030",
    "ccv": "318"
  },
  "creditCardHolderInfo": {
    "name": "NOME TITULAR",
    "email": "teste@exemplo.com",
    "cpfCnpj": "24971563792",
    "postalCode": "89223005",
    "addressNumber": "277",
    "phone": "4738010919",
    "mobilePhone": "47998781877"
  },
  "remoteIp": "203.0.113.10"
}
```

- `nextDueDate` = **hoje** (força 1ª cobrança).
- Timeout cliente ≥ **60s**.
- Cartões: [Testando pagamento com cartão](https://docs.asaas.com/docs/testando-pagamento-com-cartao-de-credito).

### 3.2 Validar no PainelCRM

1. Response Asaas: `id` = `sub_…`, status ativo.
2. Logs / `asaas_webhook_events`: `SUBSCRIPTION_*` e `PAYMENT_*`.
3. `PAYMENT_CONFIRMED` com `payment.subscription = sub_…`.
4. (Opcional pós S2+) fluxo real: checkout Meu Plano / plan-purchase cartão → `asaas_subscription_id` na `subscriptions`.

### 3.3 Resultado do spike (preencher)

| Campo | Valor |
|-------|-------|
| Ambiente | sandbox / prod |
| Data | |
| `sub_…` | |
| 1º `pay_…` | |
| Sequência de eventos | |
| `payment.subscription` presente? | sim / não |
| Webhook Assinatura OK? | sim / não |
| Bloqueios / erros | |

---

## 4. Aceite S0

### Feito (eng)

- [x] Auditoria + instrumentação S0
- [x] S1–S5 implementação (ver plano-mãe)

### Pendente ops (humano)

- [ ] Checklist §2 preenchido (sandbox mínimo)
- [ ] Spike §3 executado e anotado
- [ ] Tokenização **produção** confirmada com gerente (gate prod S4)

---

## 5. Depois do checklist

1. Preencher §2 sandbox + §3.3.  
2. Rodar um E2E real (checkout cartão → renovação sem charge dupla).  
3. Só então liberar produção com S5 flag ON.
