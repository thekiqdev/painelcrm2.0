# Investigação: PIX não gerado no fluxo de compra de plano

**Data:** 2026-03  
**Contexto:** POST /api/plan-purchase retorna sucesso, mas não aparece cobrança no Asaas, não retorna QR Code PIX nem invoice_url funcional.

---

## 1. Resolução do gateway Asaas

### Onde é resolvido
- **Arquivo:** `packages/backend/src/modules/payments/gatewayResolver.ts`
- **Função:** `resolvePaymentGateway(context)`
- **Chamado por:** `getActiveGateway({ billingType: 'saas', tenantId })` em `subscriptionService.subscribePlan`.

### Comportamento
- Para `billingType === 'saas'` (plano SaaS), **não** usa `tenantId` na busca da config.
- Busca config ativa com `getActiveConfig('saas')` → **escopo global** (`scope = 'global'`, `is_active = true`, `status = 'active'`).
- **Fonte da API Key:** tabela `payment_gateway_configs`, registro **global** (Super Admin), **não** da empresa/tenant.
- Se existir config com `gateway_key === 'asaas'` e `credentials.api_key` preenchido, monta o gateway com `buildGateway('asaas', config)`.
- **Fallback:** se não houver config no banco, usa `getAsaasGateway()` sem argumentos → API Key e ambiente vêm de **variáveis de ambiente** (`ASAAS_API_KEY`, `ASAAS_ENV`).

### Ambiente (Sandbox vs Produção)
- No **gatewayRegistry** (`packages/backend/src/modules/payments/gatewayRegistry.ts`), as credentials do banco são convertidas com:
  - `env === 'production'` → produção; caso contrário → **sandbox**.
- No **asaasClient**, a base URL é definida por `config.env`: `production` → `https://api.asaas.com/v3`, senão → `https://api-sandbox.asaas.com/v3`.

### Conclusão 1
- Gateway usado no plan-purchase é o **global (Super Admin)**.
- API Key e ambiente vêm da config global em `payment_gateway_configs` (ou env se não houver config).
- **Logs adicionados:** `[DIAG gatewayResolver]` com `hasConfig`, `gateway_key`, `env`, `hasApiKey` (sem expor a chave).

---

## 2. Criação da cobrança no Asaas

### Fluxo
1. `subscribePlan` chama `gateway.ensureCustomer(tenantId)` → retorna `customerId`.
2. Chama `gateway.createCharge({ customerId, amountCents, dueDate, paymentMethod, description, idempotencyKey, externalReference })`.

### Payload enviado ao Asaas (asaasMapper + asaasClient)
- **POST /v3/payments** com:
  - `customer`: ID do cliente no Asaas
  - `billingType`: `'PIX'` | `'BOLETO'` | `'CREDIT_CARD'` (mapeado do `paymentMethod`)
  - `value`: valor em reais (`amountCents / 100`)
  - `dueDate`: data de vencimento (YYYY-MM-DD)
  - `description`: invoice_number interno
  - `externalReference`: `tenant_id`

### Resposta do POST /v3/payments
- A API Asaas retorna: `id`, `status`, `invoiceUrl`, `bankSlipUrl`, `invoiceNumber`, etc.
- **Para PIX:** a documentação Asaas indica que o **QR Code PIX não vem** na resposta do POST. O endpoint retorna o `id` do pagamento; o QR Code e o payload “copia e cola” devem ser obtidos em **chamada separada**: **GET /v3/payments/{id}/pixQrCode**.

### Conclusão 2
- A cobrança **é criada** no Asaas (POST /payments) quando o gateway está configurado e `createCharge` é chamado.
- **Problema identificado:** o código esperava `pixQrCode` e `pixCopyPaste` na **resposta do POST**; como a API não devolve esses campos para PIX, eles ficavam `undefined` e não eram retornados ao front.

---

## 3. Obtenção do QR Code PIX (correção aplicada)

### Documentação Asaas
- **GET /v3/payments/{id}/pixQrCode** retorna:
  - `encodedImage`: imagem do QR Code em Base64
  - `payload`: código PIX copia e cola
  - `expirationDate`: validade do QR Code

### O que estava faltando
- Após `createPayment`, **não** havia chamada a `GET /payments/{id}/pixQrCode` quando o método era PIX.
- Por isso `pix_qr_code` e `pix_copy_paste` nunca eram preenchidos na resposta do plan-purchase.

### Correção implementada
- Em `packages/backend/src/modules/gateways/asaas/client/asaasClient.ts`:
  - Criada função `getPixQrCode(paymentId, config)` que chama **GET /v3/payments/{id}/pixQrCode**.
- Em `packages/backend/src/modules/gateways/asaas/services/asaasService.ts` (dentro de `createCharge`):
  - Após `createPayment`, se `body.billingType === 'PIX'`:
    - Chama `asaasClient.getPixQrCode(res.id, config)`.
    - Define `pixCopyPaste` = `payload` e `pixQrCode` = data URL da imagem (`data:image/png;base64,{encodedImage}`).
  - Esses valores são retornados em `CreateChargeResult` e repassados até o controller.

---

## 4. Retorno do endpoint /api/plan-purchase

### Controller
- **Arquivo:** `packages/backend/src/controllers/planPurchaseController.ts`
- Monta o JSON com: `billing_id`, `invoice_number`, `amount_cents`, `status`, `tenant_id`, `payment_method`.
- Inclui no response, **quando existirem** em `result.paymentUrls`:
  - `invoice_url` ← `result.paymentUrls.invoiceUrl`
  - `bank_slip_url` ← `result.paymentUrls.bankSlipUrl`
  - `pix_qr_code` ← `result.paymentUrls.pixQrCode`
  - `pix_copy_paste` ← `result.paymentUrls.pixCopyPaste`

### Onde falhava
- `invoiceUrl` e `bankSlipUrl` vêm da **resposta do POST /payments** do Asaas; se a API retornar, o backend já repassava.
- `pixQrCode` e `pixCopyPaste` vinham como `undefined` porque não eram buscados via GET pixQrCode; com a correção acima, passam a ser preenchidos para PIX.

---

## 5. Logs de diagnóstico adicionados

Foram adicionados logs **temporários** (prefixo `[DIAG]`) para facilitar futuras investigações:

| Local | Log | O que mostra |
|-------|-----|--------------|
| **gatewayResolver** | `[DIAG gatewayResolver]` | `billingType`, `tenantId`, se há config, `gateway_key`, `env`, se tem API Key |
| **subscriptionService** | `[DIAG subscriptionService]` | Se gateway existe, `paymentMethod`, `invoice_number` |
| **subscriptionService** | `[DIAG subscriptionService] createCharge payload` | `customerId`, `amountCents`, `dueDate`, `paymentMethod`, `description` |
| **subscriptionService** | `[DIAG subscriptionService] createCharge result` | `paymentId`, `status`, flags `hasInvoiceUrl`, `hasBankSlipUrl`, `hasPixQrCode`, `hasPixCopyPaste` |
| **asaasService** | `[DIAG asaasService] createPayment payload` | Payload enviado ao Asaas (customer, billingType, value, dueDate, externalReference) |
| **asaasService** | `[DIAG asaasService] createPayment response` | Resposta do POST (id, status, invoiceUrl, bankSlipUrl, pixQrCodeId) |
| **asaasService** | `[DIAG asaasService] getPixQrCode result` | Se veio payload e encodedImage do GET pixQrCode |

Para diagnóstico, rodar um plan-purchase com PIX e verificar no console do backend a sequência desses logs e em qual etapa algo falha (ex.: gateway null, createPayment erro, getPixQrCode null).

---

## Resumo

| Ponto | Status |
|-------|--------|
| 1. Gateway resolvido (config global, API Key, ambiente) | OK; config global Super Admin; logs adicionados |
| 2. Cobrança criada no Asaas (POST /payments com customer, billingType PIX, value, dueDate, externalReference) | OK; payload correto; resposta logada |
| 3. QR Code PIX (GET /payments/{id}/pixQrCode) | **Corrigido:** implementada chamada após createPayment quando billingType === 'PIX' |
| 4. Retorno plan-purchase (pix_qr_code, pix_copy_paste, invoice_url) | OK no controller; passam a ser preenchidos com a correção do item 3 |
| 5. Logs de diagnóstico | Implementados nos pontos listados acima |

**Causa raiz:** Para pagamentos PIX, o Asaas não retorna QR Code nem payload na resposta do POST /payments; é obrigatório chamar **GET /v3/payments/{id}/pixQrCode** após criar o pagamento. Essa chamada não existia e foi implementada.

**Recomendação:** Após validar em ambiente de testes, remover ou reduzir os logs `[DIAG ...]` se não forem mais necessários para produção.
