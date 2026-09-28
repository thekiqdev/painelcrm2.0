# Billing Golden Dataset — Sprint 5.0-10A

Conjunto **permanente e versionado** de fixtures oficiais do Billing CRM. Toda sprint futura do Billing 5.0 deve validar alterações contra exatamente estes cenários antes de ser considerada concluída.

**Escopo desta sprint:** apenas testes e documentação. Nenhuma regra de negócio, backend, engine, scheduler, worker ou API foi alterada.

## Localização

```
tests/billing/golden-dataset/
├── types.ts          # GoldenScenario, tags, today default
├── factory.ts        # buildGoldenDetail, timelineRow, jobRow, …
├── scenarios.ts      # Catálogo oficial (40 cenários)
└── index.ts          # Re-exports
```

## Referência de hoje

`GOLDEN_TODAY_DEFAULT = '2026-06-30'` — data fixa para projeções e comparação determinística de snapshots.

## Dimensões cobertas

| Dimensão | Valores no catálogo |
|----------|---------------------|
| `subscription_states` | active, paused, cancelled, trial, pending_activation, expired |
| `cycle_status` | pending, failed, skipped, cancelled (+ generated via invoice) |
| `invoice_states` | paid, due/overdue, gateway_failed, manual, refunded, deleted |
| `job_states` | pending, processing, failed, retrying (via `recent_jobs`) |
| `projection_states` | real_cycle, projected, invoice_only, lifecycle_event |

## Cenários obrigatórios (IDs estáveis)

| ID | Título |
|----|--------|
| `first-charge-paid` | Primeira cobrança |
| `subscription-newly-created` | Assinatura recém criada |
| `subscription-paused` | Assinatura pausada |
| `subscription-resumed` | Assinatura retomada |
| `subscription-reactivated` | Assinatura reativada |
| `subscription-cancelled` | Assinatura cancelada |
| `charge-paid` | Cobrança paga |
| `charge-overdue` | Cobrança vencida |
| `charge-future` | Cobrança futura |
| `charge-manual` | Cobrança manual |
| `charge-early-generated` | Cobrança gerada antecipadamente |
| `generate-jul-before-aug` | Gerar julho antes de agosto |
| `generate-oct-skip-sep` | Gerar outubro pulando setembro |
| `generate-retroactive-months` | Gerar meses retroativos |
| `generate-multiple-future-months` | Gerar múltiplos meses futuros |
| `retry-after-failure` | Retry após falha |
| `gateway-failed` | Gateway failed |
| `cycle-skipped` | Skipped |
| `cancelled-official` | Cancelled oficial |
| `cancelled-legacy` | Cancelled legado |
| `invoice-deleted` | Invoice deleted |
| `invoice-refund` | Invoice refund |
| `invoice-only` | Invoice_only |
| `projection-only` | Projection |
| `timeline-without-cycle` | Timeline sem ciclo |
| `timeline-with-cycle` | Timeline com ciclo |
| `next-billing-date-changed` | Mudança de next_billing_date |
| `contract-interval-change` | Contrato alterando intervalo |
| `anchor-change` | Mudança de anchor |
| `month-gap` | Mês inexistente (gap) |
| `gap-filled` | Gap preenchido |
| `reschedule` | Reschedule |
| `job-mismatch` | Job mismatch |
| `job-reenqueue` | Job reenqueue |
| `manual-renew` | Manual Renew (fixture) |
| `worker-renewal` | Worker Renewal (fixture) |
| `scheduler-renewal` | Scheduler Renewal (fixture) |
| `subscription-trial` | Assinatura trial |
| `subscription-pending-activation` | Pending activation |
| `subscription-expired` | Assinatura expired |

## Como adicionar um cenário

1. Adicionar entrada em `scenarios.ts` com `id` kebab-case estável.
2. Referenciar auditorias em `auditRefs` (ex.: `['4.2L', '4.2M']`).
3. Usar `buildGoldenDetail()` — nunca mutar produção.
4. Regenerar snapshot: `npm run test:billing:update-snapshots`.
5. Confirmar suite verde: `npm run test:billing`.

## Payload de entrada

Cada cenário produz um `CrmSubscriptionDetailPayload` — o aggregate implícito atual (Sprint 4.2Q). A certificação exercita:

- `createFinancialEventStore(detail, today)`
- `getHistoryRows()`, `getCalendarEvents()`, `getSidebarSummary()`
- `resolveNextChargePresentationFromStore(store)`
- `buildFinancialAlerts(detail, today)`

## Auditorias fonte

Cenários e regressões derivam das auditorias **4.2K–4.2Q** e da constituição **4.2R** (`BILLING_ARCHITECTURE_SPECIFICATION.md`).
