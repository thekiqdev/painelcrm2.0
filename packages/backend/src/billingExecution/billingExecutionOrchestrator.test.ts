import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingExecutionOrchestrator } from './billingExecutionOrchestrator.js';
import { BillingExecutionOrchestratorError } from './types.js';
import { buildBillingRenewalResult } from './renewalResultBuilder.js';
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import type { BillingEngineResult } from '../billingEngine/types.js';
import { BILLING_RECURRING_JOB_OUTCOME } from '../services/billingRecurringJobPersistence.js';

vi.mock('../billingEngine/billingEngine.js', () => ({
  BillingEngine: { execute: vi.fn() },
}));

vi.mock('../services/customerInvoiceService.js', () => ({
  findCustomerInvoiceBySubscriptionAndPeriod: vi.fn(),
  updateCustomerInvoiceGatewayData: vi.fn(),
}));

vi.mock('./invoicePersistenceService.js', () => ({
  persistCustomerInvoiceFromDraft: vi.fn(),
  rollbackPersistedInvoice: vi.fn(),
}));

vi.mock('./invoiceItemPersistenceService.js', () => ({
  persistCustomerInvoiceItemsFromDrafts: vi.fn(),
}));

vi.mock('./gatewayExecutionService.js', () => ({
  executeGatewayChargeForInvoice: vi.fn(),
}));

vi.mock('./notificationExecutionService.js', () => ({
  executeInvoiceNotifications: vi.fn(),
}));

vi.mock('./timelineExecutionService.js', () => ({
  executeTimelineEvents: vi.fn(),
}));

vi.mock('./historyExecutionService.js', () => ({
  executeRenewalHistory: vi.fn(),
}));

vi.mock('./subscriptionCycleService.js', () => ({
  advanceSubscriptionCycle: vi.fn(),
}));

import { BillingEngine } from '../billingEngine/billingEngine.js';
import { findCustomerInvoiceBySubscriptionAndPeriod } from '../services/customerInvoiceService.js';
import { persistCustomerInvoiceFromDraft, rollbackPersistedInvoice } from './invoicePersistenceService.js';
import { persistCustomerInvoiceItemsFromDrafts } from './invoiceItemPersistenceService.js';
import { executeGatewayChargeForInvoice } from './gatewayExecutionService.js';
import { executeInvoiceNotifications } from './notificationExecutionService.js';
import { executeTimelineEvents } from './timelineExecutionService.js';
import { executeRenewalHistory } from './historyExecutionService.js';
import { advanceSubscriptionCycle } from './subscriptionCycleService.js';

function sampleContext(): BillingExecutionContext {
  return {
    subscription: {
      id: 'sub-1',
      tenant_id: 't1',
      type: 'customer',
      customer_id: 'c1',
      currency: 'BRL',
      billing_interval: 'monthly',
      status: 'active',
      default_payment_method: 'boleto',
      gateway: 'asaas',
      amount_cents: 9900,
      next_billing_date: '2026-07-01',
      current_period_start: '2026-06-01',
      current_period_end: '2026-07-01',
      billing_anchor_day: 10,
      plan_id: null,
      billing_cycle_count: 1,
      cancel_at_period_end: false,
      grace_period_days: 0,
      users_count: null,
      last_job_at: null,
      created_by: null,
      created_at: '',
      updated_at: '',
      cycles_unlimited: true,
      max_cycles: null,
    },
    tenant: { id: 't1', name: 'T' },
    customer: { id: 'c1', name: 'C', email: 'c@test.com' },
    billingPlan: { id: 'p1', version: 1, plan_revision: 1 } as BillingExecutionContext['billingPlan'],
    billingPlans: [],
    billingItems: [],
    resolvedItems: [],
    contract: {
      billing_interval: 'monthly',
      amount_cents: 9900,
      currency: 'BRL',
      trial_until: null,
      status: 'active',
      metadata: {},
    },
    cycle: '2026-06-01',
    period: {
      cycleKey: '2026-06-01',
      periodStart: '2026-06-01',
      periodEnd: '2026-07-01',
      dueDate: '2026-06-01',
      nextGeneration: '2026-07-01',
      anchor: 10,
      interval: 'monthly',
      frequency: 1,
    },
    dates: {
      periodStart: '2026-06-01',
      periodEnd: '2026-07-01',
      dueDate: '2026-06-01',
      nextBilling: '2026-07-01',
      trialUntil: null,
    },
    gateway: {
      provider: 'asaas',
      currency: 'BRL',
      paymentMethod: 'boleto',
      fees: 0,
      gatewayMetadata: {},
    },
    notifications: {
      channels: ['email'],
      templates: ['crm_invoice_charge'],
      recipient: 'c@test.com',
      language: 'pt-BR',
      variables: {},
    },
    timeline: { events: [] },
    history: { changes: [] },
    featureFlags: {},
    metadata: {
      correlation_id: 'corr-1',
      execution_mode: 'automatic',
      plan_source: 'persisted_plan',
      has_persisted_plan: true,
      context_certified: true,
    },
    diagnostics: {
      contextBuildTime: 1,
      warnings: [],
      errors: [],
      sources: {},
      shadowReady: true,
      consistencyReady: true,
      engineReady: true,
      cacheHit: false,
      billing_plan_present: true,
      billing_items_present: true,
      context_certified: true,
      context_pure: true,
      legacy_dependencies_detected: [],
    },
  };
}

function sampleEngineResult(): BillingEngineResult {
  return {
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
    diagnostics: {
      contextBuildTime: 1,
      warnings: [],
      errors: [],
      sources: {},
      shadowReady: true,
      consistencyReady: true,
      engineReady: true,
      cacheHit: false,
      billing_plan_present: true,
      billing_items_present: true,
      context_certified: true,
      context_pure: true,
      legacy_dependencies_detected: [],
      engine_version: 'v2',
      plan_source: 'persisted_plan',
      projection_hash: 'abc',
      duration_ms: 1,
    },
  };
}

const baseInput = () => ({
  context: sampleContext(),
  client: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  job: {
    id: 'job-1',
    subscription_id: 'sub-1',
    tenant_id: 't1',
    job_type: 'renewal',
    cycle_key: '2026-06-01',
    scheduled_at: '2026-06-01T00:00:00Z',
    retry_at: null,
    status: 'processing',
    attempts: 0,
    max_attempts: 3,
  },
  workerId: 'worker-1',
  executionMode: 'automatic' as const,
  periodStartYmd: '2026-06-01',
  correlationId: 'corr-orch-1',
});

describe('BillingExecutionOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findCustomerInvoiceBySubscriptionAndPeriod).mockResolvedValue(null);
    vi.mocked(BillingEngine.execute).mockReturnValue(sampleEngineResult());
    vi.mocked(persistCustomerInvoiceFromDraft).mockResolvedValue({
      id: 'inv-1',
      tenant_id: 't1',
      invoice_number: 'CINV-1',
      gateway_status: null,
      gateway_reference_id: null,
    } as never);
    vi.mocked(persistCustomerInvoiceItemsFromDrafts).mockResolvedValue(1);
    vi.mocked(executeInvoiceNotifications).mockReturnValue({ status: 'queued' });
    vi.mocked(executeGatewayChargeForInvoice).mockResolvedValue({
      status: 'PENDING',
      paymentId: 'pay-1',
      failed: false,
    });
    vi.mocked(executeTimelineEvents).mockResolvedValue({ status: 'ok', eventsRecorded: 1 });
    vi.mocked(advanceSubscriptionCycle).mockResolvedValue({ advanced: true });
    vi.mocked(executeRenewalHistory).mockResolvedValue({ status: 'ok' });
  });

  it('executa persistência completa e retorna BillingRenewalResult', async () => {
    const result = await BillingExecutionOrchestrator.execute(baseInput());

    expect(result.renewal.success).toBe(true);
    expect(result.renewal.invoiceId).toBe('inv-1');
    expect(result.renewal.completionOutcome).toBe(
      BILLING_RECURRING_JOB_OUTCOME.COMPLETED_INVOICE_CUSTOMER
    );
    expect(result.renewal.subscriptionAdvanced).toBe(true);
    expect(BillingEngine.execute).toHaveBeenCalledTimes(1);
    expect(persistCustomerInvoiceFromDraft).toHaveBeenCalled();
    expect(persistCustomerInvoiceItemsFromDrafts).toHaveBeenCalled();
    expect(executeGatewayChargeForInvoice).toHaveBeenCalled();
    expect(executeInvoiceNotifications).toHaveBeenCalled();
    expect(executeTimelineEvents).toHaveBeenCalled();
    expect(executeRenewalHistory).toHaveBeenCalled();
    expect(advanceSubscriptionCycle).toHaveBeenCalled();
  });

  it('idempotência reutiliza invoice existente sem chamar engine', async () => {
    vi.mocked(findCustomerInvoiceBySubscriptionAndPeriod).mockResolvedValue({
      id: 'inv-existing',
      invoice_number: 'CINV-OLD',
      gateway_status: 'PENDING',
      gateway_reference_id: 'pay-old',
    } as never);

    const result = await BillingExecutionOrchestrator.execute(baseInput());

    expect(BillingEngine.execute).not.toHaveBeenCalled();
    expect(result.engine).toBeNull();
    expect(result.renewal.invoiceId).toBe('inv-existing');
    expect(result.renewal.completionOutcome).toBe(
      BILLING_RECURRING_JOB_OUTCOME.COMPLETED_IDEMPOTENT_CUSTOMER
    );
  });

  it('falha quando engine não aprova', async () => {
    vi.mocked(BillingEngine.execute).mockReturnValue({
      ...sampleEngineResult(),
      approved: false,
      items: [],
    });

    await expect(BillingExecutionOrchestrator.execute(baseInput())).rejects.toMatchObject({
      code: 'ENGINE_NOT_APPROVED',
    });
  });

  it('rollback transacional quando persistência de itens falha', async () => {
    vi.mocked(persistCustomerInvoiceItemsFromDrafts).mockRejectedValueOnce(new Error('items fail'));

    await expect(BillingExecutionOrchestrator.execute(baseInput())).rejects.toThrow('items fail');
    expect(rollbackPersistedInvoice).toHaveBeenCalledWith(
      expect.anything(),
      'inv-1',
      't1'
    );
  });

  it('continua quando gateway falha (invoice persistida)', async () => {
    vi.mocked(executeGatewayChargeForInvoice).mockResolvedValue({
      status: null,
      paymentId: null,
      failed: true,
      error: 'gw down',
    });

    const result = await BillingExecutionOrchestrator.execute(baseInput());
    expect(result.renewal.success).toBe(true);
    expect(result.gateway.failed).toBe(true);
  });

  it('propaga falha de notification sem abortar renewal', async () => {
    vi.mocked(executeInvoiceNotifications).mockReturnValue({ status: 'unknown' });
    const result = await BillingExecutionOrchestrator.execute(baseInput());
    expect(result.notification.status).toBe('unknown');
    expect(result.renewal.success).toBe(true);
  });

  it('timeline failed não impede sucesso do renewal', async () => {
    vi.mocked(executeTimelineEvents).mockResolvedValue({ status: 'failed', eventsRecorded: 0 });
    const result = await BillingExecutionOrchestrator.execute(baseInput());
    expect(result.timeline.status).toBe('failed');
    expect(result.renewal.timelineStatus).toBe('failed');
    expect(result.renewal.success).toBe(true);
  });

  it('history failed não impede sucesso do renewal', async () => {
    vi.mocked(executeRenewalHistory).mockResolvedValue({ status: 'failed' });
    const result = await BillingExecutionOrchestrator.execute(baseInput());
    expect(result.history.status).toBe('failed');
    expect(result.renewal.historyStatus).toBe('failed');
  });

  it('buildBillingRenewalResult compatível com Worker', () => {
    const renewal = buildBillingRenewalResult({
      success: true,
      invoiceId: 'inv-1',
      invoiceNumber: 'CINV-1',
      executionMode: 'manual',
      correlationId: 'corr',
      cycleKey: '2026-06-01',
      executionTime: 42,
      logs: ['x'],
      gateway: { status: 'PENDING', paymentId: 'p1', failed: false },
      notification: { status: 'queued' },
      timeline: { status: 'ok', eventsRecorded: 1 },
      history: { status: 'ok' },
      subscription: { advanced: true },
    });

    expect(renewal.invoiceId).toBe('inv-1');
    expect(renewal.gatewayStatus).toBe('PENDING');
    expect(renewal.notificationStatus).toBe('queued');
    expect(renewal.cycleKey).toBe('2026-06-01');
    expect(renewal.executionMode).toBe('manual');
  });
});

describe('BillingExecutionOrchestrator — sem motor legado', () => {
  const prohibited = [
    'resolveCrmRenewalPreviousInvoice',
    'executeCustomerRenewal',
    'getCustomerInvoiceItems',
    'overlayCrmContractOnRenewalItems',
  ];

  const files = [
    'billingExecutionOrchestrator.ts',
    'invoicePersistenceService.ts',
    'invoiceItemPersistenceService.ts',
    'gatewayExecutionService.ts',
  ];

  for (const file of files) {
    for (const sym of prohibited) {
      it(`${file} não referencia ${sym}`, async () => {
        const content = await import('node:fs').then((fs) =>
          fs.readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
        );
        expect(content.includes(sym)).toBe(false);
      });
    }
  }
});

describe('BillingExecutionOrchestratorError', () => {
  it('expõe code e stage', () => {
    const err = new BillingExecutionOrchestratorError('x', 'TEST', 'STAGE');
    expect(err.code).toBe('TEST');
    expect(err.stage).toBe('STAGE');
  });
});
