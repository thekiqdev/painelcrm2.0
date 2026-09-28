# Fase 10 — Pagamento público avançado

**Escopo entregue (sem G3):** melhorar **previsibilidade** e **observabilidade** do fluxo `/pay/:token` já existente (Fase 6), sem múltiplos gateways na mesma fatura.

## API pública

- **`GET /api/public/customer-invoices/pay/:token`** e **`POST .../complete`** passam a incluir:
  - `has_payment_payload` — `true` se houver PIX (QR ou copia e cola) ou URL de cobrança/boleto em `payment_urls`.
  - `payment_options_summary` — `none` | `pix` | `hosted` | `pix_and_hosted` (critério alinhado a `buildPublicPayPayloadMeta` no backend).

Implementação: `packages/backend/src/services/publicPayPayloadMeta.ts`.

## Telemetria opcional (backend)

| Variável | Efeito |
|----------|--------|
| `PUBLIC_PAY_TELEMETRY_LOG=true` | Emite `[BILLING]` `public_pay_get` / `public_pay_complete` com `tenantId`, `has_payment_payload`, `payment_options_summary`, `status` / `needs_customer`. **Sem** token nem ID de fatura no log. |

Ver `docs/ENV-BILLING.md`.

## Frontend (`CustomerInvoicePay`)

- Polling **mais rápido** (~3,5s) enquanto `has_payment_payload` é falso e o status ainda é “pagável”; volta a ~5s quando o payload existe.
- **Alerta** “Cobrança em preparação” com instruções e contato do tenant quando não há PIX/link.
- Texto do indicador de atualização automática distingue “buscando payload” vs “verificando pagamento”.

## Fora de escopo (G3)

- Escolha de **vários gateways** ou **várias cobranças** na mesma fatura permanece pendente de decisão de produto (§7.1 #4).

## Referências

- `docs/H1-FASE6-PAGAMENTO-PUBLICO.md` (base Fase 6)
- `packages/backend/src/controllers/publicCustomerInvoicesController.ts`
