# BILLING_SQL_AUDIT_REPORT

**Sprint:** 4.0A.1  
**Escopo:** `billing_plans`, `billing_plan_items`, `subscriptions`, `clients`

## Schema confirmado (PostgreSQL)

### `billing_plans`
- `tenant_id UUID NOT NULL` — coluna válida
- Índice único parcial: 1 plano `active` por `subscription_id`
- Colunas de domínio: `plan_number`, `plan_revision`, `plan_state`, `engine_version`, `billing_strategy`

### `billing_plan_items`
- `tenant_id UUID NOT NULL`
- Versionamento: `(billing_plan_id, sequence, item_revision)` UNIQUE
- Efetividade: `effective_from`, `effective_until`

### `subscriptions`
- `tenant_id UUID NOT NULL` + RLS `subscriptions_tenant_policy`
- `metadata JSONB` para contrato CRM

### `clients` — **sem `tenant_id`**
- Isolamento: `user_id → users.tenant_id`
- Padrão correto:
```sql
FROM clients c
INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2::uuid
WHERE c.id = $1::uuid
```

## Queries auditadas

| Módulo | Tabela | `tenant_id` | Status |
|--------|--------|-------------|--------|
| `billingPlanRepository` | `billing_plans` | Na própria tabela | ✅ |
| `billingPlanItemRepository` | `billing_plan_items` | Na própria tabela | ✅ |
| `billingPlanProvisionService` | `subscriptions` | `FOR UPDATE` com RLS context | ✅ |
| `planItemResolver` | `billing_plans` / items | Filtro por tenant | ✅ |
| `billingExecutionContextBuilder` | `clients` | Via JOIN `users` | ✅ (corrigido) |
| `customerBillingService` rollback | `subscriptions` | `id` + `tenant_id` | ✅ |

## Achado crítico (corrigido)

- **Arquivo:** `packages/backend/src/billingExecutionContext/billingExecutionContextBuilder.ts`
- **Linha:** ~47 (função `loadCustomer`)
- **Query inválida:** `FROM clients WHERE ... AND tenant_id = $2`
- **Tabela real:** `clients` (sem coluna `tenant_id`)
- **Coluna correta:** `users.tenant_id` via JOIN
