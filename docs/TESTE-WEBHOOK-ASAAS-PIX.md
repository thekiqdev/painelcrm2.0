# Teste do webhook Asaas (PIX) — validação do fluxo real

Objetivo: confirmar que o webhook é recebido, o billing é encontrado, `activatePlanFromBilling` é executado e o tenant fica **ACTIVE** após o pagamento PIX.

---

## 1. Endpoint do webhook

- **URL:** `POST /webhooks/asaas`
- **Registro:** Em `packages/backend/src/index.ts`: `app.use('/webhooks/asaas', asaasWebhookRoutes)`.
- **Handler:** `asaasWebhookRoutes` → `router.post('/', asaasWebhookHandler)`.
- **URL completa (local):** `http://localhost:3002/webhooks/asaas` (ou a porta do seu backend).
- **Produção:** Use a URL pública do backend, ex.: `https://seu-dominio.com/webhooks/asaas`.

O webhook **não exige JWT**; é público para o Asaas enviar os eventos.

---

## 2. Configurar a URL no painel Asaas

1. Acesse o painel do Asaas (sandbox ou produção).
2. Vá em **Integrações** → **Webhooks** (ou equivalente).
3. Cadastre a URL do webhook:
   - Desenvolvimento local: use um túnel (ngrok, Cloudflare Tunnel, etc.) apontando para `http://localhost:3002/webhooks/asaas`.
   - Exemplo ngrok: `ngrok http 3002` → use `https://xxxx.ngrok.io/webhooks/asaas`.
4. Marque os eventos que deseja receber (no mínimo **PAYMENT_RECEIVED** e **PAYMENT_CONFIRMED** para PIX).

---

## 3. Logs adicionados (para observar no backend)

### No handler do webhook (`asaasWebhook.ts`)

Ao receber **qualquer** evento, o backend loga:

```
[ASAAS WEBHOOK RECEIVED] {
  timestamp: '...',
  eventType: 'PAYMENT_RECEIVED' | 'PAYMENT_CONFIRMED' | ...,
  paymentId: 'pay_xxxxx',
  eventId: '...',
  externalReference: 'tenant_id (uuid)',
  payload: '{ ... }'  // payload completo do Asaas
}
```

### No serviço Asaas (`asaasService.handlePaymentEvent`)

- **Antes de buscar o billing:** `[ASAAS] buscando billing por paymentId: pay_xxxxx`
- **Se não encontrar:** `[ASAAS] billing NÃO encontrado para paymentId: pay_xxxxx`
- **Se encontrar:** `[ASAAS] billing encontrado: { id, tenant_id, plan_id, status }`
- **Antes de ativar:** `[ASAAS] ativando plano do tenant via billing: <billing_id>`

### No subscriptionService (`activatePlanFromBilling`)

- **Ao ativar:** `[SUBSCRIPTION] ativando plano { tenantId, planId, billingId }`
- **Se billing não existir:** `[SUBSCRIPTION] activatePlanFromBilling: billing não encontrado <id>`
- **Se billing não estiver paid:** `[SUBSCRIPTION] activatePlanFromBilling: billing não está paid { billingId, status }`

---

## 4. Passo a passo para testar

### 4.1 Gerar cobrança PIX

1. No front, acesse o checkout (ex.: pela landing ou por Meu Plano).
2. Preencha os dados da empresa (se não logado).
3. Escolha **PIX** como forma de pagamento.
4. Clique em **Gerar cobrança**.
5. Anote o **tenant_id** e o **billing_id** (ou invoice_number) da resposta, se quiser cruzar depois no banco.

### 4.2 Garantir que o webhook está acessível

- **Local:** Suba um túnel (ngrok, etc.) e configure no Asaas a URL `https://seu-tunel/webhooks/asaas`.
- **Staging/produção:** A URL já deve ser pública; confira no Asaas.

### 4.3 Pagar o PIX

1. Use o QR Code ou o código copia e cola no app do banco.
2. Conclua o pagamento (no sandbox pode haver simulação de pagamento).

### 4.4 Observar os logs do backend

Com o backend rodando no terminal, você deve ver **na ordem**:

1. **Webhook recebido**
   ```
   [ASAAS WEBHOOK RECEIVED] { timestamp, eventType: 'PAYMENT_RECEIVED' ou 'PAYMENT_CONFIRMED', paymentId: 'pay_...', ... }
   ```

2. **Busca do billing**
   ```
   [ASAAS] buscando billing por paymentId: pay_xxxxx
   [ASAAS] billing encontrado: { id: '...', tenant_id: '...', plan_id: '...', status: 'pending' }
   ```

3. **Ativação**
   ```
   [ASAAS] ativando plano do tenant via billing: <billing_id>
   [SUBSCRIPTION] ativando plano { tenantId: '...', planId: '...', billingId: '...' }
   ```

Se aparecer **`[ASAAS] billing NÃO encontrado`**, o `asaas_payment_id` salvo no `tenant_billing` não bate com o `paymentId` do webhook (conferir gateway e ambiente).

### 4.5 Confirmar no banco que o tenant ficou ACTIVE

```sql
-- Troque pelo tenant_id da compra
SELECT id, name, status, plan_id, plan_period_start, plan_period_end, activated_billing_id, max_users_override
FROM tenants
WHERE id = '<tenant_id>';
```

Esperado após o webhook processado:

- `status = 'active'`
- `plan_period_start` e `plan_period_end` preenchidos
- `activated_billing_id` = id da fatura que foi paga

```sql
-- Conferir a fatura
SELECT id, tenant_id, status, paid_at, asaas_payment_id
FROM tenant_billing
WHERE tenant_id = '<tenant_id>'
ORDER BY created_at DESC
LIMIT 1;
```

Esperado:

- `status = 'paid'`
- `paid_at` preenchido
- `asaas_payment_id` igual ao `paymentId` do log do webhook

---

## 5. Checklist de validação

| Item | Como validar |
|------|----------------|
| Webhook chega | Log `[ASAAS WEBHOOK RECEIVED]` com `eventType` e `paymentId` |
| Billing é encontrado | Log `[ASAAS] billing encontrado` com `id`, `tenant_id`, `plan_id` |
| activatePlanFromBilling é executado | Log `[ASAAS] ativando plano do tenant via billing` e `[SUBSCRIPTION] ativando plano` |
| Tenant vira ACTIVE | Query em `tenants`: `status = 'active'`, `plan_period_start`/`plan_period_end` e `activated_billing_id` preenchidos |
| Fatura fica paga | Query em `tenant_billing`: `status = 'paid'`, `paid_at` preenchido |

---

## 6. Problemas comuns

- **Webhook não aparece nos logs:** URL no Asaas errada, túnel caído ou backend inacessível. Teste com `curl -X POST https://sua-url/webhooks/asaas -H "Content-Type: application/json" -d '{"id":"test","event":"PAYMENT_RECEIVED"}'` e veja se o log `[ASAAS WEBHOOK RECEIVED]` aparece (pode retornar 400 por payload inválido, mas o log deve sair).
- **Billing NÃO encontrado:** O pagamento foi criado em outra conta/ambiente do Asaas ou o `asaas_payment_id` não foi salvo no `tenant_billing` (falha entre createCharge e updateInvoiceGatewayData).
- **SUBSCRIPTION não ativa / billing não está paid:** O evento pode não ser RECEIVED/CONFIRMED, ou o billing já estava `paid` (reprocessamento).

---

## 7. Remover logs em produção

Os logs acima são para **diagnóstico**. Em produção, considere removê-los ou trocar por um nível de log (ex.: debug) que possa ser desligado, para não expor dados sensíveis do payload e não poluir o console.
