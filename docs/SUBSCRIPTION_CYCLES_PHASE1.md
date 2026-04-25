# Etapa 1 — `subscription_cycles` (implementado)

Referência: [PLANO_DEFINITIVO_FATURAS_RECORRENTES_COM_CICLOS.md](./PLANO_DEFINITIVO_FATURAS_RECORRENTES_COM_CICLOS.md).

## O que esta etapa faz

- Cria a tabela `public.subscription_cycles` com constraints, índices e **RLS** por `tenant_id` (política alinhada a `subscriptions` / `billing_recurring_jobs`).
- Regista **feature flags globais** em `superadmin_settings`:
  - `subscription_cycles_read` — default **`true`** (novas instalações; migração **143** alinha ambientes que já tinham `false`)
  - `subscription_cycles_write` — default **`true`** (o Super Admin pode desligar no painel)
  As Etapas 2+ consomem estas chaves; o controlo operacional é **Super Admin → Configurações → Ciclos de assinatura** (`/superadmin/subscription-cycles`), sem SQL manual.
- Executa **backfill idempotente** na mesma migração (`141_subscription_cycles_phase1.sql`), por ordem:
  1. **`customer_invoices`** → ciclos `invoiced` com `invoice_id`, `cycle_date = period_start`.
  2. **`billing_recurring_jobs`** (último job por `subscription_id` + `cycle_key`) → faz **merge** de `job_id`, estado derivado do job e, se aplicável, `invoice_id`.
  3. **`subscriptions`** ativas → um ciclo **`pending`** para `next_billing_date` **só se** ainda não existir linha para esse par `(subscription_id, cycle_date)`.

## O que esta etapa **não** faz

- Não altera scheduler, worker nem geração de faturas.
- Não expõe UI de tenant; as flags globais são geridas no painel Super Admin (API `GET/PUT /api/superadmin/billing/subscription-cycles-flags`).

## Regras de backfill importantes

- **Reexecução do script:** o ficheiro usa `DROP TRIGGER IF EXISTS` antes do trigger de `updated_at` para o runner `migrate.ts` não abortar o restante SQL ao encontrar “already exists”. Voltar a correr `migrate` reaplica os `INSERT … ON CONFLICT` (idempotente).
- **Unicidade:** `UNIQUE (subscription_id, cycle_date)` — não duplica ciclos; `ON CONFLICT` faz merge controlado (ex.: enriquecer `job_id` vindo dos jobs).
- **Faturas manuais / sem assinatura:** linhas em `customer_invoices` com `subscription_id IS NULL` (migração 71) **não** entram no backfill de ciclos — não há ciclo de assinatura associado.
- **`invoice_id`:** FK apenas para `customer_invoices`. Jobs SaaS com `result_invoice_type = 'tenant_billing'` **não** preenchem `invoice_id`; o id fica em `metadata.tenant_billing_invoice_id` e o status do ciclo é `skipped` com motivo documentado (sem violar FK).
- **Pendentes:** ciclos `pending` sem fatura são esperados para `next_billing_date` atual das assinaturas ativas.

## Ficheiros

| Ficheiro | Função |
|----------|--------|
| `database/init/141_subscription_cycles_phase1.sql` | DDL, RLS, flags, backfill |
| `database/init/143_subscription_cycles_superadmin_defaults.sql` | Defaults ativos para instalações legadas (141 com `ON CONFLICT DO NOTHING`) |
| `packages/backend/src/migrate.ts` | Ordem de execução das migrações |
| `packages/backend/src/services/subscriptionCyclesSuperadminSettingsService.ts` | Leitura/escrita das flags pelo painel |
| `src/pages/superadmin/SuperAdminSubscriptionCyclesSettings.tsx` | UI Super Admin |
| `packages/backend/src/utils/tenantSecurity.ts` | Lista `subscription_cycles` como tabela tenant-scoped |

## Próximos passos (Etapa 2+)

- **Etapa 2 (implementada):** leitura no insight — ver [SUBSCRIPTION_CYCLES_PHASE2.md](./SUBSCRIPTION_CYCLES_PHASE2.md).
- **Etapa 3:** dual-write — [SUBSCRIPTION_CYCLES_PHASE3.md](./SUBSCRIPTION_CYCLES_PHASE3.md).
- **Etapa 4:** reconciliação read-only — [SUBSCRIPTION_CYCLES_PHASE4.md](./SUBSCRIPTION_CYCLES_PHASE4.md).

## Migração 143 (defaults ativos em instalações antigas)

- O ficheiro `143_subscription_cycles_superadmin_defaults.sql` faz `INSERT … ON CONFLICT DO UPDATE` para `subscription_cycles_read` e `subscription_cycles_write` com **`true`**, alinhando bases que tinham ficado com `false` por causa do `ON CONFLICT DO NOTHING` da 141.
- Se num ambiente as flags deviam permanecer desligadas, após correr `migrate` use o painel **Super Admin → Ciclos de assinatura** para desativar (sem SQL).

## Verificação manual sugerida (pós-migrate)

```sql
-- Sem duplicados lógicos
SELECT subscription_id, cycle_date, COUNT(*) FROM subscription_cycles GROUP BY 1,2 HAVING COUNT(*) > 1;

-- Invoiced com fatura
SELECT COUNT(*) FROM subscription_cycles WHERE status = 'invoiced' AND invoice_id IS NULL;
-- Esperado: 0 (exceto se dados legados inconsistentes; investigar linha a linha)

-- Flags
SELECT key, value FROM superadmin_settings WHERE key LIKE 'subscription_cycles%';
```
