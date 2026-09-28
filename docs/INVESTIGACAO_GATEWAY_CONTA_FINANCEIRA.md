# Investigação: gateway de pagamento ↔ conta financeira

## Contexto

Recebimentos confirmados (`customer_invoices.status = paid`) devem criar uma linha em `financial_transactions` (`entry_source = gateway_payment`, conta vinculada em `financial_account_gateway_links`), para atualizar saldo e extrato.

---

## Achados principais (causas típicas)

1. **Status da fatura não reconhecido como transição para `paid`**  
   Se algum fluxo chamava `updateCustomerInvoiceStatus(invoiceId, 'PAID', …)` ou variações, `status === 'paid'` falhava e **não** gravava `'paid'` nem disparava sincronização.  
   **Correção:** normalização (`toLowerCase`) para detectar quando a fatura **passa** a paga e persistência canónica `'paid'` na BD.

2. **`transaction_date` anterior ao `initial_balance_date` da conta**  
   O saldo usa só movimentos com `transaction_date >= financial_accounts.initial_balance_date`. Pagamentos antigos (`paid_at` antes dessa data) ficavam **fora do cálculo de saldo**, embora a linha existisse.  
   **Correção:** ao criar entrada automática, `transaction_date = max(data do pagamento, initial_balance_date da conta)`, com metadata `invoice_paid_at_date` quando há ajuste.

3. **Nome do gateway diferente entre fatura e vínculo**  
   Valores como `Mercado Pago`, `ASAAS`, `gateway_asaas` devem mapear para chaves internas (`asaas`, `mercado_pago`).  
   **Correção:** `normalizeGatewayKey` aceita prefixo `gateway_`, casing e variantes compactas.

4. **Fallback `asaas_payment_id`**  
   Colunas legadas são lidas quando existem na tabela (detecção via `information_schema`).

5. **Idempotência**  
   Índices únicos parciais em `(tenant_id, reference_type, reference_id)` e `(tenant_id, gateway_provider, gateway_reference_id)` evitam duplicar o mesmo pagamento.

---

## Fluxo corrigido

| Momento | Comportamento |
|--------|----------------|
| Qualquer caminho que chama `updateCustomerInvoiceStatus` e a fatura **passa** a `paid` | `syncCustomerInvoicePaymentToFinancialAccount(invoiceId)` |
| Backfill | `POST /api/financial/gateway-receivables/sync-paid-invoices` com `account_id` + `gateway` + período |

Integrações conhecidas que usam `updateCustomerInvoiceStatus`:

- `paymentDomainService` (webhook / fluxo aggregate)
- `customerBillingService` (checkout / cartão)
- `publicCustomerInvoicesController` (polling público)

---

## Queries SQL de diagnóstico

Substituir `:tenant_id`, `:account_id`, `:gateway`, datas conforme necessário.

### 1. Vínculos conta ↔ gateway

```sql
SELECT fa.id AS financial_account_id, fa.name, fa.tenant_id,
       l.gateway, l.is_enabled, l.is_default_receivables
FROM financial_accounts fa
LEFT JOIN financial_account_gateway_links l
  ON l.financial_account_id = fa.id AND l.tenant_id = fa.tenant_id
WHERE fa.tenant_id = :tenant_id::uuid
ORDER BY fa.name;
```

### 2. Faturas pagas recentes com gateway

```sql
SELECT id, invoice_number, status, paid_at::date, amount_cents,
       gateway, gateway_reference_id, gateway_status
FROM customer_invoices
WHERE tenant_id = :tenant_id::uuid
  AND status = 'paid'
ORDER BY paid_at DESC NULLS LAST
LIMIT 50;
```

### 3. Transações automáticas de gateway (CRM)

```sql
SELECT id, account_id, transaction_date, amount_cents, status,
       entry_source, reference_type, reference_id,
       gateway_provider, gateway_reference_id
FROM financial_transactions
WHERE tenant_id = :tenant_id::uuid
  AND entry_source = 'gateway_payment'
  AND reference_type = 'customer_invoice'
ORDER BY transaction_date DESC
LIMIT 50;
```

### 4. Faturas pagas sem entrada financeira gateway (linha única por fatura)

```sql
SELECT ci.id, ci.invoice_number, ci.paid_at::date, ci.amount_cents,
       ci.gateway, ci.gateway_reference_id
FROM customer_invoices ci
WHERE ci.tenant_id = :tenant_id::uuid
  AND ci.status = 'paid'
  AND ci.paid_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM financial_transactions ft
    WHERE ft.tenant_id = ci.tenant_id
      AND ft.entry_source = 'gateway_payment'
      AND ft.reference_type = 'customer_invoice'
      AND ft.reference_id = ci.id
  )
ORDER BY ci.paid_at DESC
LIMIT 100;
```

### 5. Saldo esperado vs componentes (uma conta)

```sql
WITH acc AS (
  SELECT id, tenant_id, initial_balance_cents, initial_balance_date::text AS d
  FROM financial_accounts
  WHERE id = :account_id::uuid AND tenant_id = :tenant_id::uuid
)
SELECT
  acc.initial_balance_cents,
  COALESCE(SUM(CASE WHEN t.type = 'income' AND t.status = 'completed'
      AND t.transaction_date >= acc.d::date THEN t.amount_cents END), 0) AS income_sum,
  COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.status = 'completed'
      AND t.transaction_date >= acc.d::date THEN t.amount_cents END), 0) AS expense_sum,
  acc.initial_balance_cents
    + COALESCE(SUM(CASE WHEN t.type = 'income' AND t.status = 'completed'
        AND t.transaction_date >= acc.d::date THEN t.amount_cents END), 0)
    - COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.status = 'completed'
        AND t.transaction_date >= acc.d::date THEN t.amount_cents END), 0)
    AS balance_cents
FROM acc
LEFT JOIN financial_transactions t ON t.account_id = acc.id AND t.tenant_id = acc.tenant_id;
```

---

## Logs estruturados (backend)

Eventos JSON (`console.log`): `gateway_receivable_sync_invoice_loaded`, `gateway_receivable_sync_link_lookup`, `gateway_receivable_sync_created`, `gateway_receivable_sync_skipped_existing`, `gateway_receivable_sync_skipped_no_gateway`, `gateway_receivable_sync_skipped_no_linked_account`, `gateway_receivable_sync_error`.

Campos típicos: `tenant_id`, `invoice_id`, `invoice_number`, `gateway`, `gateway_reference_id`, `account_id`, `outcome`.

---

## Testes manuais sugeridos

1. Conta nova com vínculo Asaas na criação.
2. Nova fatura → pagamento → confirmar linha em `financial_transactions`, saldo na conta e badge Gateway no extrato.
3. `POST …/gateway-receivables/sync-paid-invoices` com `dry_run: true` → contagens coerentes.
4. Mesmo POST com `dry_run: false` → criadas; segundo run → `skipped_existing_count` alto.
5. Webhook repetido → sem segunda linha para a mesma fatura.

---

## Duplicidade e relatórios

- **Extrato:** mesma regra idempotente impede segunda linha por `reference_id` ou por `(gateway_provider, gateway_reference_id)` quando preenchido.
- **Resumo financeiro (`getFinancialSummary`):** receita de fallback em `customer_invoices` **exclui** faturas que já têm transação `gateway_payment` ligada pelo `reference_id`, evitando dupla contagem.
