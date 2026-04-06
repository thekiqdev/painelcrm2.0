# H1 — Pagamento público (Fase 6 / consolidação Fase 8)

Documento de referência para a página pública de pagamento (`/pay/:token`), alinhado ao que está implementado e às decisões de produto (sem cartão embutido no PainelCRM).

---

## 1. Escopo implementado (resumo)

| Tema | Comportamento |
|------|----------------|
| **PIX (G2)** | QR e/ou “copia e cola” quando `gateway_metadata` (via `createCharge`) expõe `pixQrCode` / `pixCopyPaste`. |
| **Outras formas (G1)** | Links `invoiceUrl` / `bankSlipUrl` como fallback, rotulados como site do provedor. |
| **Confirmação de pagamento** | **Webhook** do gateway atualiza `customer_invoices` no backend. A UI pública faz **polling** do `GET` público enquanto o status for “pagável”, para exibir “Pago” sem recarregar. |
| **Cartão** | Somente **redirect / checkout hospedado** do provedor (decisão arquitetural §7.1); sem PAN na aplicação. |

---

## 2. Matriz por gateway (vigente)

Provedor **primário** hoje: **Asaas** (integração CRM). Outros gateways seguem o mesmo princípio de “hosted checkout” até haver implementação específica.

| Gateway | PIX (inline / QR) | Boleto | Cartão | Fonte de “pago” na fatura |
|---------|-------------------|--------|--------|---------------------------|
| **Asaas** | Sim, se metadados retornarem PIX | Link `bankSlipUrl` se disponível | Redirect `invoiceUrl` / fluxo hospedado | Webhook → atualização de status; UI confirma via polling |
| **Outros (futuro)** | Conforme contrato do adapter | Conforme contrato | Redirect obrigatório (H2) | Webhook + mesmo modelo de referência (`gateway_reference_id` / payment id) |

**Nota:** A matriz detalhada por segundo gateway deve ser estendida quando um novo adapter for **ativado** em produção (copiar linha + testes de webhook).

---

## 3. Fluxo webhook (visão H1/H3)

1. `createCharge` (ou fluxo equivalente) gera cobrança no provedor e persiste `gateway_reference_id` / metadados na fatura.
2. Cliente paga no provedor (PIX, boleto, cartão hospedado).
3. Provedor envia **webhook** ao PainelCRM (rota configurada no painel do gateway).
4. Handler valida assinatura / tenant e atualiza `customer_invoices.status` (e eventos auxiliares conforme serviço).
5. A página pública **não** depende só do polling para a verdade contábil — o polling apenas melhora UX até o webhook processar.

Diagrama lógico: **Gateway → Webhook → DB** (autoritativo); **Browser → GET público** (leitura + polling).

---

## 4. Impacto em recorrência (ligação com H4)

- A página **pública** trata **uma** fatura (token). Renovações geram **novas** faturas/itens via jobs de assinatura e E2.
- Mudanças no contrato de webhook que alterem `externalReference` / `paymentId` afetam **tanto** pagamento único quanto reconciliação de assinaturas — ver `docs/H2-H3-H4-FASE8-STUBS.md` §H4.

---

## 5. O que não está neste documento

- **G3** (multi-gateway na mesma fatura) — fora do escopo Fase 6/8 atual.
- Detalhes de implementação Asaas linha a linha — ver código em `customerBillingService`, `publicCustomerInvoicesController`, `CustomerInvoicePay.tsx`.

---

## 6. Referências de código

- Frontend: `src/pages/CustomerInvoicePay.tsx`
- API pública: `packages/backend/src/controllers/publicCustomerInvoicesController.ts`, `publicPayPayloadMeta.ts`
- Cobrança / token: `completePaymentByToken` em `packages/backend/src/services/customerBillingService.ts`
- Evolução adicional: `docs/FASE10-PAGAMENTO-PUBLICO-AVANCADO.md`
