# Payment Confirmation Dialog — Sprint 4.1M

## Objetivo

Confirmar pagamento manual **na tela da assinatura**, sem redirecionar para `/customer-invoices/:id?action=register_payment`.

## Componente

`src/components/subscriptions/financial/ConfirmPaymentDialog.tsx`

### Campos

| Campo | Comportamento |
|-------|----------------|
| Valor recebido | Pré-preenchido com o valor da cobrança; editável |
| Data do pagamento | Padrão = hoje no fuso da conta (`tenant_billing.timezone`) |
| Forma de pagamento | PIX, Boleto, Cartão, Transferência (+ gateway se houver) |
| Banco / instituição | Lista `financialService.listAccounts({ account_scope: 'business' })` |
| Observações | Opcional |

### Botões

- **Confirmar pagamento** → `POST /api/customer-invoices/:id/confirm-manual-payment`
- **Cancelar** → fecha o dialog

### Banco recebedor

- Carrega contas ativas do financeiro unificado.
- Se existir **apenas uma** conta, seleciona automaticamente.
- Opção **Não lançar no financeiro** mantida.

## Integração

| Superfície | Entrada |
|------------|---------|
| Histórico (`FinancialHistoryRow`) | `InvoiceDirectActions` → dialog |
| Calendário (`FinancialCalendarPopover`) | `InvoiceDirectActions` → dialog |
| Menu de ações (`InvoiceActionsMenu`) | dialog inline |

Após sucesso: `onPaymentConfirmed` → `SubscriptionDetail.load()` recarrega o payload e o `FinancialEventStoreProvider` reconstrói Histórico, KPIs, Calendário, Sidebar e Próxima cobrança **sem F5**.

## API (corpo estendido)

```json
{
  "financial_account_id": "uuid | null",
  "payment_date": "YYYY-MM-DD",
  "payment_method": "pix",
  "notes": "opcional",
  "amount_received_cents": 11000
}
```

Metadados gravados em `financial_transactions.metadata` quando há conta selecionada.
