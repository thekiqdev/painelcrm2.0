# Correção definitiva — troca de método na fatura pública

## Causa estrutural da duplicidade (antes)

- Vários caminhos no `switchPaymentMethodByToken` podiam chegar a `createCharge` sem uma política única de “uma tentativa aberta por método”.
- A chave de idempotência em tentativas canceladas podia bloquear ou confundir novos inserts; não havia **garantia de banco** de no máximo uma linha **reutilizável** por `(invoice_id, payment_method)`.

## Regra final aplicada

- **Fonte de verdade:** `customer_invoice_payment_attempts`.
- **Aberta reutilizável:** `status IN ('pending','waiting_payment','processing','overdue')` e `gateway_reference_id IS NOT NULL` (alinhado a `findReusableInvoicePaymentAttempt`).
- **No máximo uma** dessas linhas por `(invoice_id, payment_method)` — **trava no PostgreSQL**.

## Trava no banco

Arquivo: `database/init/84_invoice_attempts_one_open_per_method.sql`

1. **Deduplicação:** para grupos com mais de uma tentativa “aberta” com referência, mantém a mais recente (`created_at DESC`); as demais passam a `cancelled` com metadata de superseded.
2. **Índice único parcial:**

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci_attempts_one_open_reusable_per_invoice_method
  ON public.customer_invoice_payment_attempts (invoice_id, payment_method)
  WHERE status IN ('pending', 'waiting_payment', 'processing', 'overdue')
    AND gateway_reference_id IS NOT NULL;
```

## Service único de reuso

Arquivo: `packages/backend/src/services/invoicePaymentAttemptReuseService.ts`

- **`ensureReusablePaymentAttemptForSwitch`:** único fluxo para o link público:
  1. idempotência (chave estável da UI, só se status reutilizável);
  2. `findReusableInvoicePaymentAttempt` + `isAttemptChargeStillUsable`;
  3. se inválida no gateway → `markAttemptCancelledSuperseded` (libera slot + `idempotency_key` NULL);
  4. só então `createCharge` + `createInvoicePaymentAttempt`;
  5. em **23505** (corrida): reusa a linha vencedora e tenta `cancelPayment` na cobrança órfã se necessário.
- Helpers exportados: `resolveCrmGatewayForTenantInvoice`, `isAttemptChargeStillUsable`, `PaymentUrls`, `OPEN_REUSABLE_ATTEMPT_STATUSES`.

## Fluxo do controller

- `switchPaymentMethodByToken` em `customerBillingService.ts` apenas valida token/fatura/método permitido e delega a **`ensureReusablePaymentAttemptForSwitch`**.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `database/init/84_invoice_attempts_one_open_per_method.sql` | Novo: dedupe + índice único parcial |
| `packages/backend/src/migrate.ts` | Inclusão do `84_...sql` |
| `packages/backend/src/services/invoicePaymentAttemptReuseService.ts` | Novo: lógica centralizada |
| `packages/backend/src/services/customerBillingService.ts` | Switch delega ao service; `PaymentUrls` reexportado do reuse |
| `packages/backend/src/services/customerInvoicePaymentAttemptsService.ts` | (já tinha `idempotency_key = NULL` no cancel; mantido) |

## Validação manual sugerida

- PIX → BOLETO → PIX: deve reusar o mesmo `gateway_reference_id` da tentativa PIX (quando ainda válida no gateway).
- PIX → CARTÃO → PIX: idem.
- BOLETO → CARTÃO → BOLETO: idem.

**Nova cobrança no gateway** só deve aparecer na **primeira** vez que não existir tentativa aberta válida daquele método para a fatura.

## Verificação no banco (migração aplicada?)

No PostgreSQL:

```sql
-- Tabela de tentativas (migração 82)
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'customer_invoice_payment_attempts'
);

-- Índice único parcial (migração 84)
SELECT indexname FROM pg_indexes
WHERE tablename = 'customer_invoice_payment_attempts'
  AND indexname = 'idx_ci_attempts_one_open_reusable_per_invoice_method';
```

Se a tabela não existir, rode `npm run migrate` na raiz (ou `cd packages/backend && npx tsx src/migrate.ts`) com `POSTGRES_*` apontando para o mesmo banco do backend.

## Ajuste 2025-03: `getPayment` retornando null

Se o Asaas respondesse 404 ou vazio em `GET /payments/:id` durante o reuso, `isAttemptChargeStillUsable` tratava como inválido, **cancelava** a tentativa e na próxima troca gerava **nova** cobrança. O comportamento foi alinhado ao de erro de rede: **resposta ausente não invalida** a tentativa (evita duplicidade).

Se a tabela **não** existir, o fluxo agora **falha com mensagem explícita** em vez de criar cobrança após cobrança sem persistir tentativas.
