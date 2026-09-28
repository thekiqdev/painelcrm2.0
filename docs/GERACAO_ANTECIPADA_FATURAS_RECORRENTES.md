# Geração antecipada de faturas recorrentes

## Regra de produto

- **`subscriptions.next_billing_date`**: continua a ser a data de **vencimento do ciclo** (próxima cobrança / competência). **Não** é antecipada.
- **`generation_date`**: primeiro dia civil em que o tenant pode **enfileirar** o job de renovação, no fuso configurado:

  `generation_date = next_billing_date − recurring_invoice_generate_days_before_due`

  (subtração em dias civis, equivalente a `date - integer` no PostgreSQL.)

- **Fatura gerada**: `due_date` e `period_start` do ciclo permanecem alinhados ao **vencimento** (`cycle_key` = `next_billing_date` canónico). A data real de criação (`created_at`) reflete quando o worker executou.

- **Default `0`**: comportamento anterior — primeiro dia de geração = dia do vencimento (com horário local Fase 2).

## Persistência

| Campo | Tabela | Tipo | Default |
|--------|--------|------|---------|
| `recurring_invoice_generate_days_before_due` | `tenants` | `INTEGER NOT NULL` | `0` |
| Constraint | `tenants` | CHECK | `0` … `60` |

API: `GET` / `PUT` `/api/me/tenant/billing-preferences` incluem o campo.

## Scheduler

1. **Filtro SQL (grosseiro, calendário da sessão PostgreSQL):**

   `(subscriptions.next_billing_date - COALESCE(tenants.recurring_invoice_generate_days_before_due, 0)) <= CURRENT_DATE`

2. **Janela Fase 2** (`buildBillingWindowDiagnostic`):

   - Compara `local_now_ymd` (fuso efetivo do tenant) com `generation_date_ymd`.
   - No **primeiro** dia de geração, exige `local_now_hhmm >= recurring_generate_time_local`.
   - Nos dias seguintes até ao vencimento (e após, se atraso), considera o dia inteiro elegível (mesmo padrão já documentado para “ciclo no passado”).

`cycle_key` do job e `subscription_cycles.cycle_date` continuam a ser o **vencimento do ciclo**, não a `generation_date`.

## Worker

- Usa a **mesma** janela local (com dias de antecipação).
- **Removido** o cancelamento por `next_billing_date > CURRENT_DATE` do PostgreSQL, que impedia processar jobs enfileirados antes do vencimento quando a antecipação > 0.
- Idempotência: `UNIQUE (subscription_id, cycle_key)` + mesma lógica de invoice por `period_start` = ciclo.

## `subscription_cycles`

No upsert pós-scheduler, `metadata` pode incluir (JSON fundido):

- `generation_date`
- `generate_days_before_due`
- `cycle_due_date`

## Exemplos

| Vencimento (ciclo) | Antecipação (dias) | Geração (primeiro dia) | Fatura `due_date` |
|--------------------|--------------------|-------------------------|-------------------|
| 2026-05-25 | 0 | 2026-05-25 (após horário) | 2026-05-25 |
| 2026-05-25 | 5 | 2026-05-20 (após horário no 20) | 2026-05-25 |

## Riscos

- **Filtro SQL vs. fuso**: o `WHERE` usa `CURRENT_DATE` da sessão PostgreSQL; a decisão final continua a ser a janela **local do tenant**, evitando gerar fora do dia civil correto na maioria dos casos.
- **Antecipação alta**: janela longa entre geração e vencimento — comunicação ao cliente final pode ser necessária (fora do âmbito deste motor).

## UI (PainelCRM)

- **Assinatura CRM** (`/crm-subscriptions/:id`): no resumo, a **data em destaque** é a de **geração** (1.º dia elegível); o **vencimento da cobrança** (ciclo / `due_date`) aparece em seguida, explicitando que não é o dia em que o worker gera quando há antecipação.
- **Fatura com recorrência** (`InvoiceRecurrenceBlock`): mesma ordem e mensagem — primeiro **Geração prevista**, depois **Vencimento da cobrança**; dados em `GET .../recurrence-insight` (`tenant_recurring_generation`).

## Checklist de testes

1. **Dias = 0**: geração apenas no dia do vencimento (com horário), `due_date` = vencimento.
2. **Dias = 5**: dia anterior à geração não enfileira; no primeiro dia de geração após o horário, enfileira; `due_date` = vencimento.
3. **Idempotência**: várias execuções do scheduler entre geração e vencimento não duplicam job nem fatura.
4. **Timezone**: tenant `America/Sao_Paulo` — validar com `buildBillingWindowDiagnostic` / logs Fase 2.
5. **UI**: gravar 0–60, recarregar, mensagens de ajuda legíveis; ver detalhe de assinatura e fatura com textos de vencimento vs geração prevista.

## Referências de código

- `packages/backend/src/utils/billingGenerationDate.ts`
- `packages/backend/src/services/billingTimeWindowObservability.ts`
- `packages/backend/src/services/recurringBillingJobService.ts`
- `packages/backend/src/services/crmSubscriptionsService.ts` (prefs no detalhe da assinatura)
- `packages/backend/src/services/customerInvoiceRecurrenceInsightService.ts` (`tenant_recurring_generation`)
- `packages/backend/src/services/tenantBillingPreferencesService.ts`
- `src/pages/SubscriptionDetail.tsx` · `src/components/invoices/InvoiceRecurrenceBlock.tsx` · `src/lib/recurringGenerationPreview.ts`
- `database/init/148_tenants_recurring_invoice_generate_days_before_due.sql`
