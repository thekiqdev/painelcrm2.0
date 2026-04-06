# Implementação — Etapa 2 RLS em tabelas sensíveis

## 1. Objetivo

Adicionar **Row Level Security (RLS)** no PostgreSQL para cinco tabelas que continham dados multi-tenant sem segunda barreira no banco, alinhadas ao padrão já usado em `customer_charges` e `customer_invoices` (`app_tenant_visible` / `app_current_tenant_id`).

Garantir que **workers de billing** continuem operando via **`SET LOCAL app.bypass_rls = '1'`** explícito em conexão dedicada, e que **rotas públicas** que leem itens de fatura por token usem **`app.current_tenant_id`** derivado da fatura.

## 2. Tabelas cobertas

| Tabela | Coluna / relação de escopo |
|--------|----------------------------|
| `client_timeline_events` | `tenant_id` NOT NULL |
| `subscriptions` | `tenant_id` NOT NULL |
| `payment_customers` | `tenant_id` NOT NULL |
| `billing_recurring_jobs` | `tenant_id` NOT NULL |
| `customer_invoice_items` | `invoice_id` → `customer_invoices.tenant_id` |

## 3. Políticas RLS criadas

Todas em `database/init/89_rls_sensitive_tables.sql`.

### `client_timeline_events`

- **Nome:** `client_timeline_events_tenant_policy`
- **USING:** `app_tenant_visible(tenant_id)`
- **WITH CHECK:** `app_can_bypass_rls() OR tenant_id = app_current_tenant_id()`

### `subscriptions`

- **Nome:** `subscriptions_tenant_policy`
- **USING / WITH CHECK:** idem ao padrão direto por `tenant_id` (igual `customer_charges`).

### `payment_customers`

- **Nome:** `payment_customers_tenant_policy`
- **USING / WITH CHECK:** idem por `tenant_id`.

### `billing_recurring_jobs`

- **Nome:** `billing_recurring_jobs_tenant_policy`
- **USING / WITH CHECK:** idem por `tenant_id`.

### `customer_invoice_items`

- **Nome:** `customer_invoice_items_tenant_policy`
- **USING:** `app_can_bypass_rls()` **OU** `EXISTS` em `customer_invoices ci` com `ci.id = invoice_id` e `app_tenant_visible(ci.tenant_id)`.
- **WITH CHECK:** bypass **OU** existe fatura pai com `ci.tenant_id = app_current_tenant_id()` (e `tenant_id` NOT NULL na fatura).

## 4. Impacto em rotas HTTP

| Área | Middleware / contexto | Efeito |
|------|------------------------|--------|
| Rotas com `tenantAuth` (`setRequestDb`) | `app.current_tenant_id` + `app.bypass_rls` se superadmin | Listagens/CRUD de CRM, faturas, timeline seguem com isolamento reforçado. |
| Superadmin (`superadminAuth`) | `bypass_rls` | `GET /api/superadmin/billing/subscriptions` e jobs list continuam enxergando todos os tenants. |
| **Página pública de pagamento** (`getByPaymentToken`) | **Sem** `setRequestDb` na rota | Antes da correção, `getCustomerInvoiceItems` usaria pool sem sessão → RLS bloquearia itens. **Correção:** `withTenantRlsContext(tenant_id, () => getCustomerInvoiceItems(...))` após resolver `tenant_id` pelo token. |

Serviços que já filtram por `tenant_id` na query continuam corretos; a RLS atua como **defesa em profundidade**.

## 5. Impacto em workers/jobs

| Fluxo | Problema sem ajuste |
|-------|---------------------|
| `enqueueRenewalJobs` | `SELECT` em `subscriptions` e `INSERT` em `billing_recurring_jobs` sem `app.current_tenant_id` → **zero linhas** / falha em `WITH CHECK`. |
| `processNextBatch` | `SELECT` jobs, updates, e cadeia `pool.query` (assinaturas, faturas, **customer_invoice_items**) sem contexto → falha. |
| `processChildItemDueInvoices` | `SELECT`/`INSERT`/`UPDATE` em `customer_invoice_items` + leituras relacionadas → falha. |

## 6. Ajustes necessários em workers

**Abordagem:** `withBillingWorkerRlsBypass` em `packages/backend/src/utils/db.ts`:

1. `pool.connect()`
2. `SET LOCAL app.bypass_rls = '1'`
3. `dbRequestStorage.run({ client }, work)` — todo `pool.query` dentro de `work` usa o **mesmo** client (comportamento já existente do pool wrapper).

**Arquivo:** `packages/backend/src/services/recurringBillingJobService.ts`

- `enqueueRenewalJobs` — corpo envolvido em `withBillingWorkerRlsBypass`.
- `processNextBatch` — idem; `client` obtido de `dbRequestStorage.getStore().client` (não `pool.connect()` solto + `release` manual).
- `processChildItemDueInvoices` — idem.

**Documentação de segurança:** bypass é **apenas** para jobs técnicos que precisam enfileirar/processar **todos** os tenants; o código do worker já restringe por `subscription_id` / `tenant_id` nas linhas processadas.

**Rota pública — itens de fatura:**

- **Arquivo:** `packages/backend/src/services/customerInvoiceService.ts` — `getByPaymentToken` chama `withTenantRlsContext(row.tenant_id, () => getCustomerInvoiceItems(row.invoice_id))`.

## 7. Migrations criadas

- `database/init/89_rls_sensitive_tables.sql` — `ENABLE ROW LEVEL SECURITY` + políticas listadas na §3.
- Registrada em `packages/backend/src/migrate.ts` após `88_chat_instances_external_name_index.sql`.

## 8. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `database/init/89_rls_sensitive_tables.sql` | **Novo** — políticas RLS. |
| `packages/backend/src/migrate.ts` | Inclusão do `89`. |
| `packages/backend/src/utils/db.ts` | `escapeSetLocalAppValue`, `withBillingWorkerRlsBypass`, `withTenantRlsContext`. |
| `packages/backend/src/services/recurringBillingJobService.ts` | Três funções envolvidas no bypass do worker. |
| `packages/backend/src/services/customerInvoiceService.ts` | `getByPaymentToken` + contexto tenant para itens. |
| `packages/backend/src/utils/tenantSecurity.ts` | Cinco tabelas adicionadas a `TENANT_SCOPED_TABLES` (alertas em dev). |

## 9. Como validar manualmente

### HTTP / tenant normal

1. Login tenant A: timeline do cliente, lista/detalhe de fatura com itens, criação de fatura manual com linhas.
2. Login tenant B: confirmar que não há vazamento de dados de A nas mesmas telas.
3. Superadmin: listar assinaturas/jobs de billing (deve continuar funcionando).

### Workers / jobs

1. Rodar `runRecurringScheduler.ts` (ou cron equivalente): deve enfileirar jobs sem erro.
2. Rodar `runRecurringWorker.ts`: processar batch sem erro 500; logs de billing sem falha de RLS.
3. Com `BILLING_CHILD_ITEM_INVOICES_ENABLED=true` (se usado): `processChildItemDueInvoices` completa sem erro.

### Página pública de pagamento

1. Abrir link com `payment_token` válido: deve exibir **itens** da fatura como antes.
2. Token inválido: comportamento inalterado (null / 404 conforme rota).

### Não regressão

- Smoke: criar cliente, evento de timeline, assinatura customer, fatura recorrente (ambiente de staging).
- Monitorar logs por `permission denied` / `new row violates row-level security policy`.

## 10. Riscos remanescentes

1. **Papel no PostgreSQL:** se o usuário da aplicação for **dono** das tabelas ou superuser, pode **ignorar RLS** no Postgres; a política ainda protege quando o role não é bypass/owner.
2. **Outros scripts/crons** fora do repo que usem `pool` direto nas tabelas acima precisam de `withBillingWorkerRlsBypass` ou `withTenantRlsContext` equivalente.
3. **Webhooks de gateway de pagamento** que consultam `customer_invoices` / itens sem contexto: se o role **não** bypassar RLS em `customer_invoices` (já existente antes desta etapa), isso é tema separado; esta etapa não altera essas rotas, mas **customer_invoice_items** agora exige tenant ou bypass para leitura.
4. **Aninhamento de contexto:** evitar `withTenantRlsContext` dentro de `withBillingWorkerRlsBypass` sem necessidade (substituição temporária do `AsyncLocalStorage`).

---

## Critérios de aceite (Etapa 2)

1. Todas as tabelas-alvo com RLS ativo após migration `89`.
2. Workers ajustados (`recurringBillingJobService` + helpers em `db.ts`).
3. `getByPaymentToken` carrega itens com `withTenantRlsContext`.
4. Staging validado conforme §9.
5. Documentação deste arquivo atualizada com qualquer exceção operacional da implantação real.
