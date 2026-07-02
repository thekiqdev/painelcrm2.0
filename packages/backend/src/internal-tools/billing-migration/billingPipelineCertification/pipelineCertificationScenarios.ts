/**
 * Billing Engine V2 — Sprint 3.0E: cenários golden de certificação operacional.
 */
import { BILLING_RECURRING_JOB_OUTCOME } from '../../../services/billingRecurringJobPersistence.js';
import type { BillingRenewalResult } from '../../../services/billingRenewalEngine/types.js';
import type { BillingExecutionStageResult } from '../../../billingExecution/types.js';
import type {
  LegacyPipelineCapture,
  PipelineCertificationScenarioDef,
  PipelineCertificationScenarioId,
  PipelineInvoiceItemSnapshot,
  PipelineInvoiceSnapshot,
  V2PipelineCapture,
} from './types.js';
import { gatewaySnapshotFromOutcome } from './pipelineSnapshotNormalizer.js';

export const PIPELINE_CERTIFICATION_SCENARIOS: PipelineCertificationScenarioDef[] = [
  { id: 'simple_renewal', name: 'Renovação simples', description: 'Ciclo padrão mensal', tags: ['core'] },
  { id: 'monthly', name: 'Mensal', description: 'Intervalo mensal', tags: ['recurrence'] },
  { id: 'annual', name: 'Anual', description: 'Intervalo anual', tags: ['recurrence'] },
  { id: 'trial', name: 'Trial', description: 'Assinatura em trial', tags: ['functional'] },
  { id: 'discount', name: 'Desconto', description: 'Item com desconto', tags: ['financial'] },
  { id: 'taxes', name: 'Impostos', description: 'Item com impostos', tags: ['financial'] },
  { id: 'gateway_approved', name: 'Gateway aprovado', description: 'Cobrança PENDING', tags: ['gateway'] },
  { id: 'gateway_refused', name: 'Gateway recusado', description: 'Falha no gateway', tags: ['gateway'] },
  { id: 'notification_failure', name: 'Notification failure', description: 'Status unknown', tags: ['notifications'] },
  { id: 'timeline_failure', name: 'Timeline failure', description: 'Timeline failed', tags: ['timeline'] },
  { id: 'history_failure', name: 'History failure', description: 'History failed', tags: ['history'] },
  { id: 'rollback', name: 'Rollback', description: 'Rollback transacional', tags: ['operational'] },
  { id: 'idempotency', name: 'Idempotência', description: 'Invoice existente', tags: ['operational'] },
  { id: 'concurrency', name: 'Concorrência', description: 'Dupla execução idempotente', tags: ['operational'] },
  { id: 'retry', name: 'Retry', description: 'Retry após falha gateway', tags: ['worker'] },
  { id: 'subscription_advance', name: 'Subscription advance', description: 'Avanço de ciclo', tags: ['subscription'] },
  { id: 'billing_result_parity', name: 'BillingRenewalResult parity', description: 'Shape completo', tags: ['result'] },
];

function baseInvoice(overrides: Partial<PipelineInvoiceSnapshot> = {}): PipelineInvoiceSnapshot {
  return {
    period_start: '2026-06-01',
    period_end: '2026-07-01',
    amount_cents: 9900,
    due_date: '2026-06-01',
    gateway: 'asaas',
    currency: 'BRL',
    subtotal_cents: 9900,
    discounts_cents: 0,
    taxes_cents: 0,
    status: 'pending',
    ...overrides,
  };
}

function baseItems(overrides?: Partial<PipelineInvoiceItemSnapshot>): PipelineInvoiceItemSnapshot[] {
  return [
    {
      sequence: 1,
      description: 'MRR',
      quantity: 1,
      unit_price_cents: 9900,
      discount_cents: 0,
      tax_cents: 0,
      total_cents: 9900,
      is_recurring: true,
      ...overrides,
    },
  ];
}

function baseRenewal(overrides: Partial<BillingRenewalResult> = {}): BillingRenewalResult {
  return {
    success: true,
    invoiceId: 'inv-cert-1',
    invoiceNumber: 'CINV-CERT',
    gatewayStatus: 'PENDING',
    notificationStatus: 'queued',
    timelineStatus: 'ok',
    historyStatus: 'ok',
    subscriptionAdvanced: true,
    completionOutcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_INVOICE_CUSTOMER,
    executionTime: 12,
    logs: ['customer_renewal_complete'],
    cycleKey: '2026-06-01',
    executionMode: 'automatic',
    correlationId: 'cert-corr',
    ...overrides,
  };
}

function baseStage(overrides: Partial<BillingExecutionStageResult> = {}): BillingExecutionStageResult {
  const renewal = baseRenewal();
  return {
    engine: {
      approved: true,
      invoice: {
        tenant_id: 't1',
        client_id: 'c1',
        subscription_id: 'sub-1',
        period_start: '2026-06-01',
        period_end: '2026-07-01',
        amount_cents: 9900,
        due_date: '2026-06-01',
        gateway: 'asaas',
        currency: 'BRL',
        cycle_key: '2026-06-01',
        billing_plan_id: 'p1',
        billing_plan_version: 1,
        billing_plan_revision: 1,
        subtotal_cents: 9900,
        discounts_cents: 0,
        taxes_cents: 0,
        fees_cents: 0,
        origin: 'subscription',
        invoice_type: 'subscription',
      },
      items: [
        {
          billing_plan_item_id: 'item-1',
          sequence: 1,
          description: 'MRR',
          quantity: 1,
          unit_price_cents: 9900,
          discount_cents: 0,
          tax_cents: 0,
          total_cents: 9900,
          is_recurring: true,
          recurring_interval: 'monthly',
          definition_hash: 'h1',
          item_revision: 1,
        },
      ],
      gateway: null,
      notifications: [],
      timeline: [{ event: 'renewal_completed', order: 1 }],
      history: [{ change: 'subscription_cycle_advanced', audit: {} }],
      diagnostics: {} as never,
    },
    persisted: {
      invoice: { id: 'inv-cert-1', invoice_number: 'CINV-CERT' } as never,
      itemCount: 1,
      idempotentReuse: false,
    },
    gateway: { status: 'PENDING', paymentId: 'pay-1', failed: false },
    notification: { status: 'queued' },
    timeline: { status: 'ok', eventsRecorded: 1 },
    history: { status: 'ok' },
    subscription: { advanced: true },
    renewal,
    ...overrides,
  };
}

type ScenarioPair = {
  legacy: LegacyPipelineCapture;
  v2: V2PipelineCapture;
};

function buildScenarioPair(
  id: PipelineCertificationScenarioId,
  customize: (base: { legacy: LegacyPipelineCapture; v2: V2PipelineCapture }) => void
): ScenarioPair {
  const invoice = baseInvoice();
  const items = baseItems();
  const gateway = gatewaySnapshotFromOutcome({
    amount_cents: invoice.amount_cents,
    due_date: invoice.due_date,
    payment_method: 'boleto',
    subscription_id: 'sub-1',
    period_start: invoice.period_start,
    status: 'PENDING',
    failed: false,
  });

  const legacy: LegacyPipelineCapture = {
    scenario_id: id,
    renewal: baseRenewal(),
    invoice,
    invoice_items: items,
    gateway,
    subscription: {
      advanced: true,
      current_period_start: '2026-07-01',
      current_period_end: '2026-08-01',
      next_billing_date: '2026-08-01',
    },
  };

  const v2: V2PipelineCapture = {
    scenario_id: id,
    stage: baseStage(),
    invoice,
    invoice_items: items,
    gateway,
    subscription: legacy.subscription,
  };

  customize({ legacy, v2 });
  return { legacy, v2 };
}

const SCENARIO_BUILDERS: Record<PipelineCertificationScenarioId, () => ScenarioPair> = {
  simple_renewal: () => buildScenarioPair('simple_renewal', () => {}),
  monthly: () => buildScenarioPair('monthly', () => {}),
  annual: () =>
    buildScenarioPair('annual', ({ legacy, v2 }) => {
      const inv = baseInvoice({
        period_start: '2026-01-01',
        period_end: '2027-01-01',
        due_date: '2026-01-01',
      });
      legacy.invoice = inv;
      v2.invoice = inv;
      legacy.renewal.cycleKey = '2026-01-01';
      v2.stage.renewal.cycleKey = '2026-01-01';
    }),
  trial: () =>
    buildScenarioPair('trial', ({ legacy, v2 }) => {
      const inv = baseInvoice({ amount_cents: 0, subtotal_cents: 0 });
      legacy.invoice = inv;
      v2.invoice = inv;
      legacy.invoice_items = baseItems({
        unit_price_cents: 0,
        total_cents: 0,
        description: 'Trial',
      });
      v2.invoice_items = legacy.invoice_items;
    }),
  discount: () =>
    buildScenarioPair('discount', ({ legacy, v2 }) => {
      const inv = baseInvoice({ amount_cents: 8910, discounts_cents: 990 });
      const items = baseItems({ discount_cents: 990, total_cents: 8910 });
      legacy.invoice = inv;
      v2.invoice = inv;
      legacy.invoice_items = items;
      v2.invoice_items = items;
    }),
  taxes: () =>
    buildScenarioPair('taxes', ({ legacy, v2 }) => {
      const inv = baseInvoice({ amount_cents: 10890, taxes_cents: 990, subtotal_cents: 9900 });
      const items = baseItems({ tax_cents: 990, total_cents: 10890 });
      legacy.invoice = inv;
      v2.invoice = inv;
      legacy.invoice_items = items;
      v2.invoice_items = items;
    }),
  gateway_approved: () => buildScenarioPair('gateway_approved', () => {}),
  gateway_refused: () =>
    buildScenarioPair('gateway_refused', ({ legacy, v2 }) => {
      legacy.renewal.gatewayStatus = null;
      legacy.gateway = gatewaySnapshotFromOutcome({
        amount_cents: 9900,
        due_date: '2026-06-01',
        payment_method: 'boleto',
        subscription_id: 'sub-1',
        period_start: '2026-06-01',
        status: null,
        failed: true,
      });
      v2.gateway = legacy.gateway;
      v2.stage.gateway = { status: null, paymentId: null, failed: true, error: 'gw down' };
      v2.stage.renewal.gatewayStatus = null;
    }),
  notification_failure: () =>
    buildScenarioPair('notification_failure', ({ legacy, v2 }) => {
      legacy.renewal.notificationStatus = 'unknown';
      v2.stage.notification = { status: 'unknown' };
      v2.stage.renewal.notificationStatus = 'unknown';
    }),
  timeline_failure: () =>
    buildScenarioPair('timeline_failure', ({ legacy, v2 }) => {
      legacy.renewal.timelineStatus = 'failed';
      v2.stage = baseStage({
        timeline: { status: 'failed', eventsRecorded: 0 },
        renewal: { ...baseRenewal(), timelineStatus: 'failed' },
      });
      v2.stage.engine = null;
    }),
  history_failure: () =>
    buildScenarioPair('history_failure', ({ legacy, v2 }) => {
      legacy.renewal.historyStatus = 'failed';
      v2.stage.history = { status: 'failed' };
      v2.stage.renewal.historyStatus = 'failed';
    }),
  rollback: () =>
    buildScenarioPair('rollback', ({ legacy, v2 }) => {
      const failedRenewal = baseRenewal({
        success: false,
        invoiceId: null,
        subscriptionAdvanced: false,
        completionOutcome: null,
      });
      legacy.renewal = failedRenewal;
      legacy.invoice = null;
      legacy.invoice_items = [];
      legacy.gateway = null;
      legacy.rollback = { triggered: true, invoice_deleted: true };
      legacy.subscription = {
        advanced: false,
        current_period_start: '2026-06-01',
        current_period_end: '2026-07-01',
        next_billing_date: '2026-07-01',
      };
      v2.stage = baseStage({
        engine: null,
        renewal: failedRenewal,
        persisted: { invoice: {} as never, itemCount: 0, idempotentReuse: false },
        gateway: { status: null, paymentId: null, failed: false },
        subscription: { advanced: false },
      });
      v2.invoice = null;
      v2.invoice_items = [];
      v2.gateway = null;
      v2.subscription = legacy.subscription;
      v2.rollback = { triggered: true, invoice_deleted: true };
    }),
  idempotency: () =>
    buildScenarioPair('idempotency', ({ legacy, v2 }) => {
      const renewal = baseRenewal({
        completionOutcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_IDEMPOTENT_CUSTOMER,
        subscriptionAdvanced: false,
        notificationStatus: 'skipped',
        timelineStatus: 'skipped',
        historyStatus: 'skipped',
      });
      legacy.renewal = renewal;
      legacy.idempotency = { reused_existing: true, engine_skipped: true };
      legacy.invoice_items = [];
      legacy.subscription = {
        advanced: false,
        current_period_start: '2026-06-01',
        current_period_end: '2026-07-01',
        next_billing_date: '2026-07-01',
      };
      v2.stage = baseStage({
        engine: null,
        renewal,
        persisted: { invoice: {} as never, itemCount: 0, idempotentReuse: true },
        gateway: { status: 'PENDING', paymentId: 'pay-old', failed: false },
        notification: { status: 'skipped' },
        timeline: { status: 'skipped', eventsRecorded: 0 },
        history: { status: 'skipped' },
        subscription: { advanced: false },
      });
      v2.idempotency = { reused_existing: true, engine_skipped: true };
      v2.invoice_items = [];
      v2.subscription = legacy.subscription;
    }),
  concurrency: () =>
    buildScenarioPair('concurrency', ({ legacy, v2 }) => {
      const renewal = baseRenewal({
        completionOutcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_IDEMPOTENT_CUSTOMER,
        subscriptionAdvanced: false,
        notificationStatus: 'skipped',
        timelineStatus: 'skipped',
        historyStatus: 'skipped',
      });
      legacy.renewal = renewal;
      legacy.idempotency = { reused_existing: true, engine_skipped: true };
      legacy.invoice_items = [];
      legacy.subscription = {
        advanced: false,
        current_period_start: '2026-06-01',
        current_period_end: '2026-07-01',
        next_billing_date: '2026-07-01',
      };
      v2.stage = baseStage({
        engine: null,
        renewal,
        persisted: { invoice: {} as never, itemCount: 0, idempotentReuse: true },
        gateway: { status: 'PENDING', paymentId: 'pay-old', failed: false },
        notification: { status: 'skipped' },
        timeline: { status: 'skipped', eventsRecorded: 0 },
        history: { status: 'skipped' },
        subscription: { advanced: false },
      });
      v2.idempotency = { reused_existing: true, engine_skipped: true };
      v2.invoice_items = [];
      v2.subscription = legacy.subscription;
    }),
  retry: () =>
    buildScenarioPair('retry', ({ legacy, v2 }) => {
      legacy.gateway = gatewaySnapshotFromOutcome({
        amount_cents: 9900,
        due_date: '2026-06-01',
        payment_method: 'boleto',
        subscription_id: 'sub-1',
        period_start: '2026-06-01',
        status: 'PENDING',
        failed: false,
      });
      v2.gateway = legacy.gateway;
    }),
  subscription_advance: () =>
    buildScenarioPair('subscription_advance', ({ legacy, v2 }) => {
      const sub = {
        advanced: true,
        current_period_start: '2026-07-01',
        current_period_end: '2026-08-01',
        next_billing_date: '2026-08-01',
      };
      legacy.subscription = sub;
      v2.subscription = sub;
    }),
  billing_result_parity: () => buildScenarioPair('billing_result_parity', () => {}),
};

export function getPipelineScenarioPair(id: PipelineCertificationScenarioId): ScenarioPair {
  return SCENARIO_BUILDERS[id]();
}

export function getAllPipelineScenarioPairs(): ScenarioPair[] {
  return PIPELINE_CERTIFICATION_SCENARIOS.map((s) => getPipelineScenarioPair(s.id));
}
