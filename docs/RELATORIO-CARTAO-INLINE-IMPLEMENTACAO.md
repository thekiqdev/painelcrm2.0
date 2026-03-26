# Relatório — Cartão inline (Desenho A)

## Arquivos alterados

| Área | Arquivo |
|------|---------|
| Contrato gateway | `packages/backend/src/modules/payments/paymentGatewayTypes.ts` |
| Cliente Asaas | `packages/backend/src/modules/gateways/asaas/client/asaasClient.ts` |
| Serviço Asaas | `packages/backend/src/modules/gateways/asaas/services/asaasService.ts` |
| Idempotência | `packages/backend/src/services/publicPayCardIdempotencyService.ts` |
| Orquestração | `packages/backend/src/services/customerBillingService.ts` |
| Controller público | `packages/backend/src/controllers/publicCustomerInvoicesController.ts` |
| Rotas | `packages/backend/src/routes/publicRoutes.ts` |
| Migração | `database/init/83_public_pay_card_idempotency.sql` |
| Migrate | `packages/backend/src/migrate.ts` |
| UI pública | `src/pages/CustomerInvoicePay.tsx` |

## Fluxo implementado

1. Cliente escolhe **Cartão** → `switch-method` cria/reusa tentativa `CREDIT_CARD` e `gateway_reference_id` (comportamento existente).
2. Coluna direita exibe **formulário** quando `active_attempt.payment_method === 'CREDIT_CARD'`.
3. Submit → `POST /api/public/customer-invoices/pay/:token/pay-with-card` com `idempotency_key` (UUID) e dados do cartão/titular.
4. Backend valida token, fatura pagável, tentativa ativa de cartão, chama `gateway.payWithCreditCard` (Asaas: `POST .../payments/{id}/payWithCreditCard`, timeout ~65s, sem retry em 4xx).
5. Atualiza `customer_invoice_payment_attempts` e `customer_invoices`; **webhook/polling** continuam como reconciliação.
6. Idempotência: tabela `public_pay_card_idempotency` (token + chave) + **singleflight** em memória para requisições concorrentes.
7. Rate limit dedicado na rota (IP + token, por minuto, configurável via `RATE_LIMIT_PUBLIC_PAY_CARD_MAX`).

## Riscos

- **PCI / compliance:** tráfego de PAN/CVV pelo backend do PainelCRM — exige HTTPS em produção e parecer formal para escopo de cartão.
- **Sandbox/produção:** Desenho A depende de cobrança `CREDIT_CARD` pendente aceitar `payWithCreditCard`; se o Asaas alterar regras, usar **pivot Desenho B** (mesmo contrato HTTP, orquestração interna `POST /payments` com cartão) documentado na especificação.
- **Migração:** rodar `npm run migrate` (ou equivalente) para criar `public_pay_card_idempotency` — sem tabela, idempotência por DB é ignorada (singleflight ainda ajuda).

## Pontos que dependem de validação real no sandbox/ambiente

- Resposta e códigos HTTP exatos do Asaas em recusa de cartão e em duplicidade.
- Comportamento com **proxy** (`X-Forwarded-For`) para IP do cliente (se o Asaas passar a exigir `remoteIp` no corpo no futuro).
- Limites de **rate limit** adequados ao volume de tráfego.

## Pivot para Desenho B (sem refatorar arquitetura)

Implementar apenas no **adaptador Asaas** / `executePayWithCard`: em vez de `payWithCreditCard`, chamar `POST /v3/payments` com dados do cartão e mesma semântica de atualização de tentativa — mantendo o contrato público `pay-with-card` e o payload do formulário.
