# Sprint OS-S5 — Fatura a partir da OS — Notas

| Campo | Valor |
|-------|-------|
| **Status** | **FEITO** |
| **Data** | 2026-10-29 |
| **ADR** | [`ADR_OS_S0_DECISOES.md`](./ADR_OS_S0_DECISOES.md) (D4) |

## Entregas

### Migration
- `database/init/362_customer_invoices_service_order_id.sql` — coluna `service_order_id` + unique parcial `uq_customer_invoices_service_order_id` + FK `service_orders.converted_invoice_id`.
- Registada em `migrationOrder.ts` após `361`.

### Backend
- `createManualInvoice` / `createManualCustomerInvoice` aceitam `service_order_id`.
- `serviceOrderInvoiceConversionService.ts` — `convertSignedServiceOrderToInvoice` + `maybeAutoInvoiceAfterServiceOrderSigned`.
- `POST /api/service-orders/:id/convert-to-invoice` (perms: `billing.create_invoice` + `service_orders.generate_invoice` + edit).
- Hook pós-assinatura: se `billing_mode=auto_on_sign`, tenta converter (best-effort; notifica dono se falhar; **não** reverte assinatura).

### Frontend
- Botão **Gerar fatura** + dialog de vencimento no detalhe (status `signed`/`completed`, sem fatura, com cliente, modo ≠ `none`).
- Seção Faturamento + link para `/customer-invoices/:id` quando convertida.
- Seletor `billing_mode` já existia no formulário.

## Regras

| Cenário | Comportamento |
|---------|---------------|
| Manual | Botão após assinatura |
| `auto_on_sign` | Conversão automática ao concluir assinatura do cliente |
| `none` | Conversão bloqueada (400) |
| 2ª conversão | 409 + unique BD |
| Sem cliente / itens | 400 |
| Gateway / CPF | Mesmas pré-condições de fatura manual |

## Critérios de aceite

| Critério | Status |
|----------|--------|
| Manual gera 1 fatura com itens da OS | ✅ |
| Auto só com `auto_on_sign` + assinatura | ✅ |
| Segunda conversão bloqueada | ✅ |
| Preconditions de gateway respeitadas | ✅ |

## Fora deste sprint

- Agenda / Google (S6)
- Hardening / testes API (S7)
