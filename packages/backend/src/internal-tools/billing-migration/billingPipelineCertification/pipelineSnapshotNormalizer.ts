/**
 * Billing Engine V2 — Sprint 3.0E: normaliza capturas V1/V2 para comparação operacional.
 */
import type { BillingRenewalResult } from '../../../services/billingRenewalEngine/types.js';
import type { BillingExecutionStageResult } from '../../../billingExecution/types.js';
import type { CustomerInvoiceDraft } from '../../../billingEngine/types.js';
import type {
  LegacyPipelineCapture,
  PipelineBillingJobSnapshot,
  PipelineBillingResultSnapshot,
  PipelineGatewaySnapshot,
  PipelineHistorySnapshot,
  PipelineIdempotencySnapshot,
  PipelineInvoiceItemSnapshot,
  PipelineInvoiceSnapshot,
  PipelineNotificationSnapshot,
  PipelineOperationalSnapshot,
  PipelineRollbackSnapshot,
  PipelineSubscriptionSnapshot,
  PipelineTimelineSnapshot,
  V2PipelineCapture,
} from './types.js';

function mapRenewalToBillingResult(renewal: BillingRenewalResult): PipelineBillingResultSnapshot {
  return {
    success: renewal.success,
    invoice_id_present: Boolean(renewal.invoiceId),
    gateway_status: renewal.gatewayStatus,
    notification_status: renewal.notificationStatus,
    timeline_status: renewal.timelineStatus,
    history_status: renewal.historyStatus,
    subscription_advanced: renewal.subscriptionAdvanced,
    completion_outcome: renewal.completionOutcome,
  };
}

function mapStageRenewalToBillingResult(
  stage: BillingExecutionStageResult
): PipelineBillingResultSnapshot {
  return mapRenewalToBillingResult(stage.renewal);
}

function defaultSubscription(advanced: boolean): PipelineSubscriptionSnapshot {
  return {
    advanced,
    current_period_start: advanced ? '2026-07-01' : '2026-06-01',
    current_period_end: advanced ? '2026-08-01' : '2026-07-01',
    next_billing_date: advanced ? '2026-08-01' : '2026-07-01',
  };
}

export function invoiceSnapshotFromDraft(draft: CustomerInvoiceDraft): PipelineInvoiceSnapshot {
  return {
    period_start: draft.period_start,
    period_end: draft.period_end,
    amount_cents: draft.amount_cents,
    due_date: draft.due_date,
    gateway: draft.gateway,
    currency: draft.currency,
    subtotal_cents: draft.subtotal_cents ?? draft.amount_cents,
    discounts_cents: draft.discounts_cents ?? 0,
    taxes_cents: draft.taxes_cents ?? 0,
    status: 'pending',
  };
}

export function itemsSnapshotFromEngineItems(
  items: Array<{
    sequence: number;
    description: string;
    quantity: number;
    unit_price_cents: number;
    discount_cents: number;
    tax_cents: number;
    total_cents: number;
    is_recurring: boolean;
  }>
): PipelineInvoiceItemSnapshot[] {
  return items.map((it) => ({
    sequence: it.sequence,
    description: it.description,
    quantity: it.quantity,
    unit_price_cents: it.unit_price_cents,
    discount_cents: it.discount_cents,
    tax_cents: it.tax_cents,
    total_cents: it.total_cents,
    is_recurring: it.is_recurring,
  }));
}

export function gatewaySnapshotFromOutcome(params: {
  amount_cents: number;
  due_date: string;
  payment_method: string | null;
  subscription_id: string;
  period_start: string;
  status: string | null;
  failed: boolean;
}): PipelineGatewaySnapshot {
  return {
    amount_cents: params.amount_cents,
    due_date: params.due_date,
    payment_method: params.payment_method,
    idempotency_key_prefix: `customer_renew_${params.subscription_id}_${params.period_start}`,
    status: params.status,
    failed: params.failed,
  };
}

export function snapshotFromLegacyCapture(capture: LegacyPipelineCapture): PipelineOperationalSnapshot {
  const renewal = capture.renewal;
  const idempotent =
    renewal.completionOutcome === 'completed_idempotent_customer' ||
    Boolean(capture.idempotency?.reused_existing);

  return {
    scenario_id: capture.scenario_id,
    invoice: capture.invoice ?? null,
    invoice_items: capture.invoice_items ?? [],
    gateway: capture.gateway ?? null,
    notification: {
      status: renewal.notificationStatus,
      queued: renewal.notificationStatus === 'queued' || renewal.notificationStatus === 'sent',
    },
    timeline: {
      status: renewal.timelineStatus,
      event_types: renewal.timelineStatus === 'ok' ? ['renewal_completed'] : [],
      events_recorded: renewal.timelineStatus === 'ok' ? 1 : 0,
    },
    history: {
      status: renewal.historyStatus,
      result_outcome: renewal.completionOutcome,
    },
    subscription: {
      ...defaultSubscription(renewal.subscriptionAdvanced),
      ...capture.subscription,
    },
    billing_job: {
      completion_outcome: renewal.completionOutcome,
      idempotent,
    },
    billing_result: mapRenewalToBillingResult(renewal),
    error: capture.error ?? null,
    idempotency: {
      reused_existing: idempotent,
      engine_skipped: capture.idempotency?.engine_skipped ?? idempotent,
    },
    rollback: {
      triggered: capture.rollback?.triggered ?? false,
      invoice_deleted: capture.rollback?.invoice_deleted ?? false,
    },
  };
}

export function snapshotFromV2Capture(capture: V2PipelineCapture): PipelineOperationalSnapshot {
  const { stage } = capture;
  const renewal = stage.renewal;
  const engine = stage.engine;
  const idempotent = stage.persisted.idempotentReuse;

  const invoice =
    capture.invoice !== undefined
      ? capture.invoice
      : engine
        ? invoiceSnapshotFromDraft(engine.invoice)
        : null;

  const invoice_items =
    capture.invoice_items !== undefined
      ? capture.invoice_items
      : engine
        ? itemsSnapshotFromEngineItems(engine.items)
        : [];

  const gateway =
    capture.gateway !== undefined
      ? capture.gateway
      : engine
        ? gatewaySnapshotFromOutcome({
            amount_cents: engine.invoice.amount_cents,
            due_date: engine.invoice.due_date,
            payment_method: 'boleto',
            subscription_id: engine.invoice.subscription_id ?? '',
            period_start: engine.invoice.period_start,
            status: stage.gateway.status,
            failed: stage.gateway.failed,
          })
        : null;

  return {
    scenario_id: capture.scenario_id,
    invoice,
    invoice_items,
    gateway,
    notification: {
      status: stage.notification.status,
      queued: stage.notification.status === 'queued' || stage.notification.status === 'sent',
    },
    timeline: {
      status: stage.timeline.status,
      event_types:
        stage.timeline.status === 'ok'
          ? (engine?.timeline.map((e) => e.event) ?? ['renewal_completed'])
          : [],
      events_recorded: stage.timeline.eventsRecorded,
    },
    history: {
      status: stage.history.status,
      result_outcome: renewal.completionOutcome,
    },
    subscription: {
      ...defaultSubscription(stage.subscription.advanced),
      ...capture.subscription,
    },
    billing_job: {
      completion_outcome: renewal.completionOutcome,
      idempotent,
    },
    billing_result: mapStageRenewalToBillingResult(stage),
    error: capture.error ?? null,
    idempotency: {
      reused_existing: idempotent,
      engine_skipped: capture.idempotency?.engine_skipped ?? idempotent,
    },
    rollback: {
      triggered: capture.rollback?.triggered ?? false,
      invoice_deleted: capture.rollback?.invoice_deleted ?? false,
    },
  };
}

export function renewalResultFieldsForParity(renewal: BillingRenewalResult): string[] {
  return [
    String(renewal.success),
    String(renewal.invoiceId ?? ''),
    String(renewal.gatewayStatus ?? ''),
    renewal.notificationStatus,
    renewal.timelineStatus,
    renewal.historyStatus,
    String(renewal.subscriptionAdvanced),
    String(renewal.completionOutcome ?? ''),
  ];
}
