# Sprint H — Billing Lifecycle Integration (Shadow Mode)

**Data:** 2026-06-05  
**Status:** Implementado — observação apenas; Kanban inalterado

---

## 1. Objetivo

Conectar eventos reais de **billing, trial e subscription** ao Lifecycle Router (Sprint G), em **shadow mode**: resolve rotas teóricas, registra logs e métricas em memória, **sem mover cards**.

```text
Billing Event (real)
      ↓
observeBillingLifecycleEvent()
      ↓
resolveLifecycleRoute()
      ↓
Expansão / Novo Cliente (exemplo — não aplicado)
```

---

## 2. Módulo novo

`packages/backend/src/lifecycle/lifecycleBillingObserver.ts`

| Função | Uso |
|--------|-----|
| `observeBillingLifecycleEvent(eventType, context, options?)` | Observação sync + log `[lifecycle_billing_observe]` |
| `observeBillingLifecycleEventWithKanbanActual(...)` | Enriquece com lead + coluna Kanban atual (read-only) |
| `observeFutureBillingLifecycleEvent(...)` | Eventos futuros (renewed, overdue, upgraded, downgraded) |
| `collectLifecycleObservationMetrics()` | Buffer em memória (máx. 500) para Sprint I |
| `resetLifecycleObservationMetrics()` | Testes |

---

## 3. Eventos conectados (produção real)

| Evento | Ponto de integração | Arquivo |
|--------|---------------------|---------|
| `trial.started` | `schedulePublishPlatformTrialStarted` | `platformBusinessNotifications.ts` |
| `trial.started` | Provision trial (`observeTrialActivationShadow` → billing) | `acquisitionProvisioningService.ts` |
| `trial.expired` | `expireTrialsPastDue` (por tenant suspenso) | `subscriptionService.ts` |
| `subscription.activated` | `activatePlanFromBilling` (após pagamento plano) | `subscriptionService.ts` |
| `subscription.cancelled` | `cancelSubscription` (immediate) | `billingSubscriptionService.ts` |
| `subscription.cancelled` | `expireCancelledSubscriptions` | `billingSubscriptionService.ts` |

### Eventos futuros (shadow + fallback)

| Evento | Ponto | Arquivo |
|--------|-------|---------|
| `subscription.renewed` | Nova fatura de renovação SaaS | `recurringBillingJobService.ts` |
| `subscription.overdue` | `tenant_billing` → overdue | `billingOverdueStatusService.ts` |
| `subscription.upgraded` | `billing_reason=plan_upgrade` pago | `subscriptionService.ts` |
| `subscription.downgraded` | *(reservado — sem publisher ainda)* | — |

Todos marcados com comentário `// lifecycle shadow observation` no código.

---

## 4. Contexto mínimo

```ts
type BillingLifecycleContext = {
  tenantId?: string | null;
  acquisitionLeadId?: string | null;
  subscriptionId?: string | null;
  invoiceId?: string | null;   // tenant_billing.id
  correlationId?: string | null;
};
```

`observeBillingLifecycleEventWithKanbanActual` resolve `acquisitionLeadId` via `acquisition_leads.tenant_id` quando ausente.

---

## 5. Resoluções esperadas (rotas Sprint G)

| Evento | Board resolvido | Coluna resolvida |
|--------|-----------------|------------------|
| `trial.started` | Aquisição | Trial iniciado |
| `trial.expired` | Reativação | Trial expirado |
| `subscription.activated` | Expansão | Novo Cliente |
| `subscription.cancelled` | Reativação | Cancelado |

Eventos futuros → **fallback** `Aquisição / Novo lead` até Sprint I definir rotas.

---

## 6. Logs

Prefixo: **`[lifecycle_billing_observe]`**

Exemplo:

```json
{
  "event": "subscription.activated",
  "tenantId": "uuid",
  "invoiceId": "billing-uuid",
  "subscriptionId": "sub-uuid",
  "resolvedBoard": "Expansão",
  "resolvedColumn": "Novo Cliente",
  "actualBoard": "Aquisição",
  "actualColumn": "Trial iniciado",
  "source": "activatePlanFromBilling"
}
```

---

## 7. Métricas shadow

`collectLifecycleObservationMetrics()` retorna entradas com:

- `event`, `resolvedBoard`, `resolvedColumn`
- `actualBoard`, `actualColumn` (Kanban legado hoje = só Aquisição)
- `matched`, `fallback`, `source`, `observedAt`

**Uso Sprint I:** comparar divergências (ex.: `subscription.activated` resolve Expansão mas card permanece em Trial iniciado).

---

## 8. Exemplos

```ts
import { observeBillingLifecycleEvent, simulateLifecycleRoute } from '../lifecycle/index.js';

observeBillingLifecycleEvent('trial.expired', { tenantId: '...' }, { source: 'manual_test' });
// → Reativação / Trial expirado

simulateLifecycleRoute('subscription.activated', { tenantId: '...' });
// → Expansão / Novo Cliente (simulação pura)
```

---

## 9. Critérios de aceite

| # | Critério | Status |
|---|----------|--------|
| 1 | Sem migrations | OK |
| 2 | Sem movimentação de cards | OK |
| 3 | Billing produz observações | OK |
| 4 | Logs `lifecycle_billing_observe` | OK |
| 5 | Testes `lifecycleBillingObserver.test.ts` | OK |
| 6 | Comportamento Kanban idêntico | OK |

---

## 10. Fora do escopo (Sprint I+)

- `applyLifecycleRoute` / `promoteCard`
- Movimentação entre boards
- Automações Day 1/3/7
- WhatsApp / e-mail de lifecycle

---

## 11. Próximos passos — Sprint I

1. Aplicar rotas resolvidas quando `resolvedBoard !== actualBoard`.
2. `promoteOpsLeadCard(boardId, columnId)`.
3. Rotas para `subscription.renewed`, `subscription.overdue`, etc.

---

## 12. Referências

- [SPRINT_G_LIFECYCLE_ROUTER_FOUNDATION.md](./SPRINT_G_LIFECYCLE_ROUTER_FOUNDATION.md)
- [LIFECYCLE_ROUTER_FOUNDATION_AUDIT.md](../automation/LIFECYCLE_ROUTER_FOUNDATION_AUDIT.md)
