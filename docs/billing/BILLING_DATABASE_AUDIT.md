# Billing Engine 3.0 — Database Audit

**Data:** 2026-06-26  
**Database changes nesta sprint:** Não (read-only)

---

## Tabelas billing core

| Tabela | Papel GA 3.0 |
|--------|--------------|
| `billing_plans` | Fonte de verdade — plano |
| `billing_plan_items` | Fonte de verdade — itens |
| `customer_invoices` | **Output** gerado (não template) |
| `customer_invoice_items` | **Output** gerado |
| `billing_recurring_jobs` | Worker queue |
| `subscription_change_events` | Histórico contrato |

---

## `billing_plans.billing_strategy`

**Migration:** `database/init/280_billing_plans_domain_hardening.sql`

```sql
DEFAULT 'legacy_invoice_copy'
CHECK (billing_strategy IN ('legacy_invoice_copy', 'billing_plan_items', 'mixed', 'future'))
```

| Aspecto | Status |
|---------|--------|
| Valor default SQL | ⚠️ `legacy_invoice_copy` (legado no schema) |
| Valores permitidos CHECK | ⚠️ inclui `legacy_invoice_copy` |
| Código app — novos planos | ✅ `billing_plan_items` (`billingPlanFactory`, `billingPlanRepository`) |
| Código app — leitura rows legadas | ✅ Rejeitado por `deprecatedBillingStrategies` + guards |

**Resultado:** Schema ainda **aceita** estratégia legada; runtime **rejeita**. Migração SQL futura recomendada (fora escopo 3.2A).

---

## Colunas de migração / tooling

| Tabela / coluna | Uso |
|-----------------|-----|
| `billing_shadow_reports` (se existir) | Shadow mode reports |
| Cutover report tables | Via `billingCutoverRepository` |
| Certification JSON columns | Histórico certificação |

Não auditadas linha-a-linha — módulos ainda referenciam repositórios.

---

## `billing_plan_v2`

Não encontrado como valor de coluna ou enum SQL. Apenas env flag e metadata JSON.

---

## Índices / constraints

Nenhuma análise de redundância executada (escopo limitado). Sem evidência de índices órfãos do motor legado.

---

## Valores oficialmente suportados (runtime 3.0)

| Campo | Valores GA |
|-------|------------|
| `billing_strategy` (novos) | `billing_plan_items`, `mixed`, `future` |
| `engine_version` (novos) | `v2` |
| `plan_source` (context) | `persisted_plan` only |

---

## Conclusão

| Critério | Resultado |
|----------|-----------|
| DB bloqueia motor legado em runtime | ✅ (via app guards) |
| DB schema 100% limpo de legado | ❌ (DEFAULT + CHECK) |
| `database_changes: false` respeitado | ✅ |
