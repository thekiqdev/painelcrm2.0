# Gateway de cobrança ↔ Conta financeira: sincronização de recebimentos

## Gateways disponíveis na ligação conta–recebimentos

A lista **não** é hardcoded no frontend. A origem da verdade é o backend:

- Configuração: `packages/backend/src/config/financialAvailableGateways.ts`
- Env: `FINANCIAL_GATEWAY_MERCADO_PAGO_ENABLED` — se não for `1` / `true` / `yes` / `on`, o Mercado Pago **não** aparece.
- API: `GET /api/financial/gateways/available` — devolve `JSON` array `[{ key, label, enabled: true }, …]` (hoje `key` e `id` lógico em minúsculas, ex.: `asaas`, `mercado_pago`).

A persistência de vínculos valida a chave com `assertFinancialGatewayKeyAvailable` (impede guardar um gateway inexistente no ambiente). Chaves de entrada no `PUT` de vínculo são normalizadas (lowercase, espaços/hífens) via Zod no `financialController`.

## Diagnóstico (SQL)

Sugeridas para suporte/operadores após relatos de “fatura paga e sem entrada”:

**Ligação conta–gateway**

```sql
SELECT
  l.id,
  l.tenant_id,
  l.financial_account_id,
  a.name AS account_name,
  l.gateway,
  l.is_enabled,
  l.is_default_receivables,
  l.created_at,
  l.updated_at
FROM financial_account_gateway_links l
JOIN financial_accounts a ON a.id = l.financial_account_id
ORDER BY l.created_at DESC;
```

Confirmar: `gateway = 'asaas'`, `is_enabled` e (se aplicável) `is_default_receivables` coerentes com a conta esperada.

**Faturas pagas (amostra)**

```sql
SELECT
  id, tenant_id, invoice_number, status, paid_at, amount_cents,
  gateway, gateway_reference_id, gateway_status, asaas_payment_id, created_at
FROM customer_invoices
WHERE status IN ('paid', 'pago')
ORDER BY paid_at DESC NULLS LAST, created_at DESC
LIMIT 100;
```

**Movimentos de gateway já criados**

```sql
SELECT
  id, tenant_id, account_id, type, status, amount_cents,
  entry_source, reference_type, reference_id,
  gateway_provider, gateway_reference_id,
  transaction_date, description, created_at
FROM financial_transactions
WHERE entry_source = 'gateway_payment'
ORDER BY created_at DESC
LIMIT 100;
```

> Nota: a coluna em BD pode ser `entry_source` (nomenclatura usada no código) em vez de `source`.

## Causa típica (histórica)

- O serviço `syncCustomerInvoicePaymentToFinancialAccount` (alias `syncPaidCustomerInvoiceToGatewayAccount`) estava a ser invocado em `updateCustomerInvoiceStatus` **apenas** na transição *devia-se tornar* pago (`becamePaid`). Faturas **já** `paid` que recebiam webhook ou actualizações de `gateway_status` de novo **não** re-disparavam a sincronização, ficando entradas em falta.  
- Correcção: o sync passa a correr sempre que o estado pedido for “marcar como pago” (`markingPaid`), com **idempotência** no serviço (já existente) para não duplicar `financial_transactions`.

## Fluxo: pagamento novo (Asaas / webhooks / checkout)

1. Código (webhook, `paymentDomainService`, `public` checkout) chama `updateCustomerInvoiceStatus(invoiceId, 'paid', …)`.
2. A fatura fica com `status = 'paid'`.
3. O sync é chamado de forma idempotente; se ainda não existir `financial_transaction` com `entry_source = 'gateway_payment'` e `reference_id =` id da fatura, cria a entrada (Asaas) na conta vinculada a esse gateway.
4. Falha no sync **não** anula o pagamento (apenas `console`/logs JSON estruturados; pode reprocessar com o backfill ou repetindo a validação de estado).

**Resolução de gateway** (resumo): `customer_invoices.gateway` normalizado, tentativas `customer_invoice_payment_attempts`, `asaas_payment_id` como fallback Asaas, conta via `financial_account_gateway_links` com `is_enabled = true` (e preferência por padrão de recebíveis no resolve).

## Fluxo: faturas antigas (backfill)

- `POST /api/financial/gateway-receivables/sync-paid-invoices` com `from`, `to` (`YYYY-MM-DD`), `account_id`, `gateway`, `dry_run`.
- UI: separador *Gateway* na configuração da conta — **Simular** (dry run) e **Confirmar sincronização** (só deveria ser usada após uma simulação; o cliente exige `syncPreview` da simulação).
- O batch filtra faturas pagas no intervalo, resolve o mesmo `gateway` que a integração, ignora as que já têm transação de gateway para essa fatura.

## Idempotência

- `financial_transactions` com `entry_source = 'gateway_payment'`, `reference_type = 'customer_invoice'`, `reference_id =` UUID da fatura, **ou** duplicados por `gateway_provider` + `gateway_reference_id` (quando a referência existe).
- A segunda correr o sync para a mesma fatura devolve *skipped* com motivo *existing* (sem duplicar linhas).

## Teste manual sugerido

1. Só `asaas` na lista: `GET /api/financial/gateways/available` sem `FINANCIAL_GATEWAY_MERCADO_PAGO_ENABLED`.
2. Vincular a conta a Asaas, pagar uma fatura de teste, verificar entrada no extrato (badge *Gateway*).
3. *Simular* backfill num período com faturas já pagas, depois *Confirmar*; repetir — contagens de criados devem ser 0, *skipped_existing* a subir.
4. `FINANCIAL_GATEWAY_MERCADO_PAGO_ENABLED=1` (em ambiente de teste) — o Mercado Pago volta a aparecer na API e no select.

## Resumo financeiro e duplicados

- O cálculo de resumo (quando houver) deve **excluir** receita dupla: faturas com transação de gateway (`entry_source = 'gateway_payment'`, `reference_type = 'customer_invoice'`) não entram ainda como *fallback* por `customer_invoices` a solo — ver `financialSummaryService` e criteriamente ajustes na mesma linha.

## Extrato (UI)

- Linhas com `entry_source === 'gateway_payment'` exibem o badge **Gateway** no extrato da conta.
