# Mapa técnico: horário de recorrência e notificação por tenant

## Backend — recorrência (core)

- `packages/backend/src/services/recurringBillingJobService.ts`
  - `enqueueRenewalJobs()` — ponto principal para filtro por janela local.
  - `processNextBatch()` — defesa em profundidade para revalidar horário local antes de gerar invoice.
  - `processOneCustomerRenewalJob()` / `processOneRenewalJob()` — criação efetiva de invoice e avanço de ciclo.

- `packages/backend/src/services/billingSubscriptionService.ts`
  - modelo de assinatura (`next_billing_date`, `billing_interval`, etc.).

- `packages/backend/src/services/customerBillingService.ts`
  - `createRecurringManualInvoice()` — criação inicial de recorrência CRM.

- `packages/backend/src/services/customerInvoiceService.ts`
  - `createCustomerInvoice()` e `createChildCustomerInvoice()` chamam `publishInvoiceCreatedNotification`.
  - `updateCustomerInvoiceStatus()` chama `publishInvoicePaidNotification`.

- `packages/backend/src/scripts/runRecurringScheduler.ts`
  - execução de scheduler (cron típico 10–15 min).

- `packages/backend/src/scripts/runRecurringWorker.ts`
  - execução de worker (cron típico 1–2 min / loop).

## Banco — tabelas e migrações relevantes

- `database/init/67_subscriptions.sql`
  - `subscriptions.next_billing_date` (`DATE`) e estado de ciclo.

- `database/init/69_billing_recurring_jobs.sql`
  - fila de jobs (`status`, `scheduled_at`, `retry_at`, `cycle_key`).

- `database/init/34_tenants_config.sql`
  - `tenants.timezone` (já existe).

- `database/init/26_tenants_and_user_tenant.sql`
  - estrutura base de `tenants`.

## Onde mexer para horário por tenant (recorrência)

1. Migração nova para preferências de horário (sugestão em `tenants`):
   - `recurring_generate_time_local TIME`
   - `invoice_notify_same_as_generation BOOLEAN`
   - `invoice_notify_time_local TIME`

2. `enqueueRenewalJobs()`:
   - join com `tenants`.
   - elegibilidade por `timezone + hora local`.

3. `processNextBatch()`:
   - recálculo da janela local antes de processar.
   - se fora da janela: requeue (`retry_at`) em vez de gerar invoice.

---

## Backend — configuração tenant (API)

- `packages/backend/src/routes/myTenantPlanRoutes.ts`
  - local para adicionar rotas de leitura/escrita de preferências de recorrência.

- `packages/backend/src/controllers/myTenantCompanyController.ts`
  - atualmente não expõe timezone/horário de recorrência para tenant.
  - pode permanecer separado (preferível criar controller dedicado de billing preferences).

- `packages/backend/src/controllers/tenantsController.ts`
  - já manipula `timezone` no contexto superadmin.

## Frontend — Configurações

- `src/pages/Settings.tsx`
  - seção `billing` aponta para `BillingSection`.

- `src/components/settings/BillingSection.tsx`
  - hoje é placeholder; ponto ideal para UX “Configurações > Faturas”.

- `src/components/settings/SettingsMenu.tsx`
  - item “Cobrança” no menu.

### Onde incluir UI proposta

- `BillingSection`:
  - timezone da recorrência;
  - horário de geração;
  - toggle para usar mesmo horário na notificação;
  - horário de notificação (quando separado).

---

## Backend — notificações (estado atual)

- `packages/backend/src/services/notificationsEngine/businessTransactionalNotifications.ts`
  - `publishInvoiceCreatedNotification()`
  - `publishInvoicePaidNotification()`
  - hoje publicação imediata no fluxo de negócio.

- `packages/backend/src/services/notificationsEngine/notificationEngineOrchestrator.ts`
  - `runTransactionalNotification()` executa envio transacional imediato.

- `packages/backend/src/services/notificationsEngine/notificationEngineRepository.ts`
  - `notification_outbound_deliveries`
  - suporte atual de retry via `next_retry_at` (não é agendamento inicial de envio).

- `packages/backend/src/services/notificationsEngine/notificationOutboundRetryWorker.ts`
  - processa apenas entregas “due for retry”.

- `packages/backend/src/services/notificationsEngine/notificationInvoiceDigestWorker.ts`
  - digest (`invoice.due_soon`/`invoice.overdue`) em polling por env flag, usando `CURRENT_DATE`.

- `packages/backend/src/index.ts`
  - timers de retry/digest do motor de notificações.

## Onde mexer para horário de notificação por tenant

### Mínimo (fase inicial)
- Nenhuma mudança estrutural: manter notificação junto da geração.

### Evolução (fase separada)
- adicionar campo de agendamento inicial em `notification_outbound_deliveries` (ex.: `dispatch_not_before`).
- ajustar `runTransactionalNotification()` para não despachar antes da janela.
- criar/estender worker para processar entregas “queued and due”.

---

## Timezone — pontos de atenção

- recorrência usa `CURRENT_DATE` no DB hoje (global da sessão), sem localidade por tenant.
- notificações digest também usam `CURRENT_DATE`.
- regra futura deve usar:
  - `now() AT TIME ZONE tenants.timezone` para data/hora local;
  - fallback quando timezone ausente/inválido.

---

## Testes/validação sugeridos no rollout

- Tenant A (`America/Sao_Paulo`) com geração 09:00.
- Tenant B (`America/Manaus`) com geração 08:00 local.
- Alteração de horário com jobs já `pending`.
- Fail/retry sem perda de idempotência (`cycle_key`).
- Garantir que faturas manuais e link público (`payment_token`) não sofrem regressão.

