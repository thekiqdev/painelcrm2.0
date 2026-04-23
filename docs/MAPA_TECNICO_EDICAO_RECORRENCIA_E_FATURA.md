# Mapa técnico: edição de recorrência e fatura (CRM)

Mapa de ficheiros e pontos de extensão para a investigação em `docs/INVESTIGACAO_EDICAO_FATURAS_RECORRENTES.md`.

---

## 1. Fluxo de dados (referência rápida)

```
createRecurringManualInvoice
  → createSubscription (subscriptions)
  → createManualInvoice (customer_invoices, origin manual)
  → updateCustomerInvoiceSubscriptionLink (origin=subscription, invoice_type=recurring)

Scheduler: enqueueRenewalJobs
  → billing_recurring_jobs (cycle_key = next_billing_date)

Worker: processNextBatch
  → processOneCustomerRenewalJob (type=customer)
      → findCustomerInvoiceBySubscriptionAndPeriod(prev)
      → getCustomerInvoiceItems → filtra is_recurring + regras de data
      → createCustomerInvoice (origin subscription)
      → gateway.createCharge + updateCustomerInvoiceGatewayData
      → updateSubscriptionAfterRenewal
```

---

## 2. Backend — serviços

| Ficheiro | Responsabilidade relevante |
|----------|------------------------------|
| `packages/backend/src/services/customerBillingService.ts` | `createRecurringManualInvoice`, `createManualInvoice`, gateway na criação |
| `packages/backend/src/services/customerInvoiceService.ts` | `createCustomerInvoice`, `updateCustomerInvoiceSubscriptionLink`, `replaceManualInvoiceLineItems`, `getCustomerInvoiceItems`, `findCustomerInvoiceByGatewayReference` |
| `packages/backend/src/services/customerInvoiceAdminService.ts` | **`patchCustomerInvoiceWithGateway`** (status editáveis, bloqueio `items`+`subscription`, `updateCharge`), **`deleteCustomerInvoiceWithGateway`** (bloqueio subscription) |
| `packages/backend/src/services/recurringBillingJobService.ts` | **`enqueueRenewalJobs`**, **`processNextBatch`**, **`processOneCustomerRenewalJob`**, cancelamento de job se `next_billing_date > dbToday` |
| `packages/backend/src/services/billingSubscriptionService.ts` | `createSubscription`, **`updateSubscriptionAfterRenewal`**, `getSubscriptionById`, `cancelSubscription` |
| `packages/backend/src/services/recurringCustomerRenewalItemDueAnchor.ts` | Regras de vencimento por item (E2 / filhos) — impacto se editar `scheduled_due_date` |
| `packages/backend/src/services/invoicePaymentAttemptReuseService.ts` | `resolveCrmGatewayForTenantInvoice` usado no patch |

---

## 3. Backend — gateway Asaas

| Ficheiro | Nota |
|----------|------|
| `packages/backend/src/modules/gateways/asaas/services/asaasService.ts` | `updateCharge` → `asaasClient.updatePayment` |
| `packages/backend/src/modules/gateways/asaas/mappers/asaasMapper.ts` | `toAsaasPaymentUpdate` → `value`, `dueDate`, `description` |
| `packages/backend/src/modules/payments/gatewayProvider.ts` | Resolução do adapter ativo (`getActiveGateway`) |

---

## 4. Backend — controllers e rotas

| Ficheiro | Rotas / funções |
|----------|-----------------|
| `packages/backend/src/controllers/customerInvoicesController.ts` | `POST` criação (incl. `recurring` + `billing_interval`), **`patchBodySchema`**, **`updateCustomerInvoice`** → `patchCustomerInvoiceWithGateway`, `DELETE`, `GET .../recurrence-insight`, `GET .../recurrence-history` |
| Rotas (índice) | Procurar registo de `customerInvoices` em `packages/backend/src/index.ts` ou ficheiro de rotas do domínio |

---

## 5. Schemas / base de dados

| Artefacto | Conteúdo relevante |
|-----------|-------------------|
| `database/init/75_payment_status_check_multi_gateway.sql` | CHECK de `customer_invoices.status` (8 valores) |
| `database/init/69_billing_recurring_jobs.sql` | Jobs de recorrência; status; `cycle_key` |
| `database/init/67_subscriptions.sql` | `subscriptions` (evoluir com migrações posteriores) |
| Tabelas runtime | `customer_invoices`, `customer_invoice_items`, `subscriptions`, `billing_recurring_jobs` |

---

## 6. Frontend

| Ficheiro | Comportamento |
|----------|----------------|
| `src/pages/CustomerInvoiceNew.tsx` | Modo edição: **`inv.origin === 'subscription'`** → toast + **redirect** (bloqueio total da edição) |
| `src/pages/CustomerInvoiceDetail.tsx` | Botão **Editar** se `INVOICE_ACTIONABLE` — **não** filtra `origin` |
| `src/lib/customerInvoiceActions.ts` | `INVOICE_ACTIONABLE`, `canDeleteCustomerInvoice` (`origin !== 'subscription'`) |
| `src/services/customerInvoices.ts` | `update`, tipos `UpdateCustomerInvoiceBody` |
| `src/App.tsx` | Rota `/customer-invoices/:id/edit` |

---

## 7. Pontos exatos de bloqueio (citação de linhas)

**Bloqueio de itens em fatura subscription + status editável:**

```69:77:packages/backend/src/services/customerInvoiceAdminService.ts
  if (!EDITABLE_STATUSES.has(inv.status)) {
    throw new Error('Só é possível editar fatura pendente ou em cobrança');
  }

  if (body.items !== undefined && inv.origin === 'subscription') {
    throw new Error(
      'Faturas geradas pela assinatura recorrente não permitem alterar itens por esta rota; cancele e crie uma nova se necessário.'
    );
  }
```

**Bloqueio da UI ao editar:**

```232:236:src/pages/CustomerInvoiceNew.tsx
        if (inv.origin === "subscription") {
          toast.error("Faturas geradas pela assinatura não podem ser editadas nesta tela.");
          navigate(`/customer-invoices/${editInvoiceId}`);
          return;
        }
```

**Cancelamento de job se `next_billing_date` foi adiada além de hoje (DB):**

```362:370:packages/backend/src/services/recurringBillingJobService.ts
        if (subscription.next_billing_date > dbToday) {
          await cancelBillingRecurringJob(
            client,
            job.id,
            BILLING_RECURRING_JOB_OUTCOME.CANCELLED_NEXT_BILLING_AFTER_DB_TODAY,
            JSON.stringify({ next_billing_date: subscription.next_billing_date, db_today: dbToday })
          );
          result.cancelled++;
          continue;
        }
```

**Origem da próxima fatura e cópia de itens:**

```644:656:packages/backend/src/services/recurringBillingJobService.ts
  // Para manter o modelo simples (sem nova tabela de template), usamos a fatura anterior
  // do mesmo subscription_id como fonte dos itens.
  const prevPeriodStart = subscription.current_period_start;
  if (!prevPeriodStart) {
    throw new Error('Subscription current_period_start ausente para recorrência por item');
  }

  const prevInvoice = await findCustomerInvoiceBySubscriptionAndPeriod(subscription.id, prevPeriodStart);
  if (!prevInvoice) {
    throw new Error('Fatura anterior (para copiar itens) não encontrada no subscription');
  }
```

---

## 8. Extensões futuras (sem implementar agora)

- Novo handler ou ramo em `patchCustomerInvoiceWithGateway` para `origin === 'subscription'` com testes de regressão no worker.
- Novo endpoint dedicado a `subscriptions` (tipo `customer`) para `next_billing_date`, com auditoria.
- Ajustes em `CustomerInvoiceDetail` / `CustomerInvoiceNew` para separar **“Editar cobrança atual”** vs **“Alterar próxima renovação”**.

---

## 9. Cruzamento com documentação já existente

Se existirem no repositório `docs/MAPA_TECNICO_FATURAS_RECORRENTES.md`, `docs/INVESTIGACAO_FATURAS_RECORRENTES_E_LINK_PUBLICO.md` ou `docs/ETAPA_*_CORRECAO_FATURAS_RECORRENTES.md`, usar como contexto histórico; **este** mapa foca especificamente em **edição** + **subscription** + **Asaas**.
