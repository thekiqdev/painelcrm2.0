# Fase 1 — Persistência e API de configuração de recorrência por tenant

## Objetivo da fase

Persistir e expor configuração de horário da recorrência por tenant, sem alterar ainda o comportamento real do motor.

## O que foi entregue

## 1) Migration de persistência

Arquivo:

- `database/init/137_tenant_billing_recurrence_preferences.sql`

Colunas adicionadas em `tenants`:

- `recurring_generate_time_local TIME NOT NULL DEFAULT '09:00'`
- `invoice_notify_same_as_generation BOOLEAN NOT NULL DEFAULT true`
- `invoice_notify_time_local TIME NULL`

Constraint de consistência:

- `tenants_invoice_notify_time_consistency_chk`
  - exige `invoice_notify_time_local` quando `invoice_notify_same_as_generation=false`.

Backfill seguro:

- linhas existentes recebem defaults para geração (`09:00`) e `same_as_generation=true`.

## 2) Registro da migration

Arquivo:

- `packages/backend/src/migrate.ts`

Adicionado:

- `'137_tenant_billing_recurrence_preferences.sql'`

## 3) API self-service do tenant

Rota:

- `GET /api/me/tenant/billing-preferences`
- `PUT /api/me/tenant/billing-preferences`

Arquivos:

- `packages/backend/src/controllers/myTenantBillingPreferencesController.ts` (novo)
- `packages/backend/src/routes/myTenantPlanRoutes.ts` (rota adicionada)

Escopo:

- tenant autenticado (self-service), sem usar rota superadmin.
- `PUT` protegido por permissão `settings.edit`.

## 4) Regras de validação no backend

No `PUT`:

- `timezone`: aceita `null` ou string IANA válida.
- `recurring_generate_time_local`: obrigatório, formato `HH:mm`, valor válido 00:00–23:59.
- `invoice_notify_same_as_generation`: obrigatório.
- `invoice_notify_time_local`:
  - se `same_as_generation=true`: pode ser `null` (será ignorado/persistido como `null`);
  - se `same_as_generation=false`: obrigatório e válido (`HH:mm`).

## 5) Helper central de resolução de preferências

Arquivo:

- `packages/backend/src/services/tenantBillingPreferencesService.ts` (novo)

Responsabilidades:

- normalizar horário (`HH:mm`);
- validar timezone IANA;
- resolver preferências efetivas com fallback:
  - timezone default: `America/Sao_Paulo`
  - geração default: `09:00`
  - notificação default: mesma da geração (`same=true`)
- funções de leitura/atualização no tenant:
  - `getTenantBillingPreferences()`
  - `updateTenantBillingPreferences()`
  - `resolveTenantBillingPreferences()`

## 6) Integração com observabilidade da Fase 0

Arquivo ajustado:

- `packages/backend/src/services/billingTimeWindowObservability.ts`

Mudança:

- o diagnóstico da Fase 0 agora usa o helper central de resolução;
- quando houver dados persistidos, logs passam a refletir:
  - timezone/horário reais do tenant;
  - origem (`tenant` ou `fallback_default`).

Arquivo ajustado:

- `packages/backend/src/services/recurringBillingJobService.ts`

Mudança:

- scheduler/worker passaram a carregar também os novos campos do tenant para diagnóstico;
- **somente diagnóstico**, sem alterar enqueue/processamento.

## Defaults finais desta fase

- `timezone` efetiva de fallback (resolução): `America/Sao_Paulo`
- `recurring_generate_time_local`: `09:00`
- `invoice_notify_same_as_generation`: `true`
- `invoice_notify_time_local`: `null` persistido quando `same=true`; efetivo derivado da geração no resolved helper.

## O que NÃO muda nesta fase

- scheduler ainda não filtra por janela local;
- worker ainda não faz requeue por horário local;
- `next_billing_date` continua regra real do motor;
- sem UI em Configurações > Faturas;
- sem agendamento separado no motor outbound de notificações.

## O que entra na Fase 2

- ativar filtro real de janela local no scheduler;
- revalidação/requeue por janela no worker;
- manter idempotência e compatibilidade atual.

