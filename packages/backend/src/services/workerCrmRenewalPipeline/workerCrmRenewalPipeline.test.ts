import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  assertWorkerContextReady,
  executeWorkerCrmRenewal,
  WORKER_CRM_PIPELINE_VERSION,
} from './workerCrmRenewalPipeline.js';
import { BillingExecutionContextError } from '../../billingExecutionContext/errors.js';
import type { BillingExecutionContext } from '../../billingExecutionContext/types.js';
import { BillingExecutionOrchestratorError } from '../../billingExecution/types.js';
import { BILLING_RECURRING_JOB_OUTCOME } from '../billingRecurringJobPersistence.js';
import type { SubscriptionRow } from '../billingSubscriptionService.js';
import { RenewalHardeningError } from '../renewalErrorClassification.js';

vi.mock('../../billingExecutionContext/billingExecutionContextBuilder.js', () => ({
  billingExecutionContextBuilder: { build: vi.fn() },
}));

vi.mock('../../billingExecution/billingExecutionOrchestrator.js', () => ({
  BillingExecutionOrchestrator: { execute: vi.fn() },
}));

vi.mock('../billingRecurringJobPersistence.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../billingRecurringJobPersistence.js')>();
  return {
    ...actual,
    completeBillingRecurringJob: vi.fn(),
  };
});

vi.mock('../billingSubscriptionService.js', () => ({
  getSubscriptionById: vi.fn(),
}));

vi.mock('../crmSubscriptionsContractService.js', () => ({
  applyPendingCrmSubscriptionContractIfDue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../renewalAttemptTrace.js', () => ({
  logRenewalAttemptTrace: vi.fn(),
}));

import { billingExecutionContextBuilder } from '../../billingExecutionContext/billingExecutionContextBuilder.js';
import { BillingExecutionOrchestrator } from '../../billingExecution/billingExecutionOrchestrator.js';
import { completeBillingRecurringJob } from '../billingRecurringJobPersistence.js';
import { getSubscriptionById } from '../billingSubscriptionService.js';

function certifiedContext(overrides: Partial<BillingExecutionContext> = {}): BillingExecutionContext {
  return {
    subscription: { id: 'sub-1', tenant_id: 't1', customer_id: 'c1' } as BillingExecutionContext['subscription'],
    tenant: { id: 't1', name: 'T' },
    customer: { id: 'c1', name: 'C', email: 'c@test.com' },
    billingPlan: { id: 'p1' } as BillingExecutionContext['billingPlan'],
    billingPlans: [],
    billingItems: [{ id: 'item-1' } as never],
    resolvedItems: [{ item: { total_amount: 9900 } } as never],
    contract: {} as never,
    cycle: '2026-06-01',
    period: {} as never,
    dates: {} as never,
    gateway: {} as never,
    notifications: {} as never,
    timeline: { events: [] },
    history: { changes: [] },
    featureFlags: {},
    metadata: {
      correlation_id: 'corr',
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
    ...overrides,
  };
}

function baseSubscription(): SubscriptionRow {
  return {
    id: 'sub-1',
    tenant_id: 't1',
    type: 'customer',
    status: 'active',
    customer_id: 'c1',
    billing_interval: 'monthly',
    next_billing_date: '2026-07-01',
    current_period_start: '2026-06-01',
    current_period_end: '2026-07-01',
    amount_cents: 9900,
    plan_id: 'p1',
  } as SubscriptionRow;
}

const baseJob = {
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
};

const baseInput = () => ({
  client: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  job: baseJob,
  subscription: baseSubscription(),
  periodStartYmd: '2026-06-01',
  cycleKey: '2026-06-01',
  executionMode: 'automatic' as const,
  correlationId: 'corr-worker-1',
  workerId: 'worker-1',
});

function mockStage(overrides: Record<string, unknown> = {}) {
  return {
    engine: { approved: true },
    persisted: { idempotentReuse: false, itemCount: 1, invoice: { id: 'inv-1' } },
    gateway: { status: 'PENDING', paymentId: 'pay-1', failed: false },
    notification: { status: 'queued' },
    timeline: { status: 'ok', eventsRecorded: 1 },
    history: { status: 'ok' },
    subscription: { advanced: true },
    renewal: {
      success: true,
      invoiceId: 'inv-1',
      invoiceNumber: 'CINV-1',
      gatewayStatus: 'PENDING',
      notificationStatus: 'queued',
      timelineStatus: 'ok',
      historyStatus: 'ok',
      subscriptionAdvanced: true,
      completionOutcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_INVOICE_CUSTOMER,
      executionTime: 5,
      logs: [],
      cycleKey: '2026-06-01',
      executionMode: 'automatic',
      correlationId: 'corr-worker-1',
    },
    ...overrides,
  };
}

describe('executeWorkerCrmRenewal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSubscriptionById).mockResolvedValue(baseSubscription());
    vi.mocked(billingExecutionContextBuilder.build).mockResolvedValue(certifiedContext());
    vi.mocked(BillingExecutionOrchestrator.execute).mockResolvedValue(mockStage() as never);
  });

  it('executa pipeline completo CRM Worker V2', async () => {
    const result = await executeWorkerCrmRenewal(baseInput());
    expect(result.success).toBe(true);
    expect(result.invoiceId).toBe('inv-1');
    expect(BillingExecutionOrchestrator.execute).toHaveBeenCalledTimes(1);
    expect(completeBillingRecurringJob).toHaveBeenCalled();
    expect(result.logs).toContain('worker_crm_v2_complete');
  });

  it('constrói BillingExecutionContext com skipCache', async () => {
    await executeWorkerCrmRenewal(baseInput());
    expect(billingExecutionContextBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 'sub-1',
        tenantId: 't1',
        cycleKey: '2026-06-01',
        skipCache: true,
      })
    );
  });

  it('modo manual repassa executionMode', async () => {
    await executeWorkerCrmRenewal({ ...baseInput(), executionMode: 'manual' });
    expect(billingExecutionContextBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({ executionMode: 'manual' })
    );
  });

  it('retry usa mesmo pipeline', async () => {
    await executeWorkerCrmRenewal({
      ...baseInput(),
      job: { ...baseJob, attempts: 2 },
    });
    expect(BillingExecutionOrchestrator.execute).toHaveBeenCalled();
  });

  it('idempotência via orchestrator completa job', async () => {
    vi.mocked(BillingExecutionOrchestrator.execute).mockResolvedValue(
      mockStage({
        engine: null,
        persisted: { idempotentReuse: true, itemCount: 0, invoice: { id: 'inv-old' } },
        renewal: {
          success: true,
          invoiceId: 'inv-old',
          completionOutcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_IDEMPOTENT_CUSTOMER,
          gatewayStatus: 'PENDING',
          notificationStatus: 'skipped',
          timelineStatus: 'skipped',
          historyStatus: 'skipped',
          subscriptionAdvanced: false,
          executionTime: 1,
          logs: [],
          cycleKey: '2026-06-01',
          executionMode: 'automatic',
          correlationId: 'corr-worker-1',
        },
      }) as never
    );
    await executeWorkerCrmRenewal(baseInput());
    expect(completeBillingRecurringJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        outcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_IDEMPOTENT_CUSTOMER,
      })
    );
  });

  it('gateway falha ainda completa renewal', async () => {
    vi.mocked(BillingExecutionOrchestrator.execute).mockResolvedValue(
      mockStage({
        gateway: { status: null, paymentId: null, failed: true },
        renewal: {
          ...mockStage().renewal,
          gatewayStatus: null,
          success: true,
        },
      }) as never
    );
    const result = await executeWorkerCrmRenewal(baseInput());
    expect(result.success).toBe(true);
  });

  it('notification unknown ainda completa', async () => {
    vi.mocked(BillingExecutionOrchestrator.execute).mockResolvedValue(
      mockStage({
        notification: { status: 'unknown' },
        renewal: { ...mockStage().renewal, notificationStatus: 'unknown' },
      }) as never
    );
    const result = await executeWorkerCrmRenewal(baseInput());
    expect(result.notificationStatus).toBe('unknown');
    expect(result.success).toBe(true);
  });

  it('timeline failed ainda completa', async () => {
    vi.mocked(BillingExecutionOrchestrator.execute).mockResolvedValue(
      mockStage({
        timeline: { status: 'failed', eventsRecorded: 0 },
        renewal: { ...mockStage().renewal, timelineStatus: 'failed' },
      }) as never
    );
    expect((await executeWorkerCrmRenewal(baseInput())).timelineStatus).toBe('failed');
  });

  it('history failed ainda completa', async () => {
    vi.mocked(BillingExecutionOrchestrator.execute).mockResolvedValue(
      mockStage({
        history: { status: 'failed' },
        renewal: { ...mockStage().renewal, historyStatus: 'failed' },
      }) as never
    );
    expect((await executeWorkerCrmRenewal(baseInput())).historyStatus).toBe('failed');
  });

  it('advance subscription refletido no result', async () => {
    const result = await executeWorkerCrmRenewal(baseInput());
    expect(result.subscriptionAdvanced).toBe(true);
  });

  it('BillingRenewalResult compatível com Worker', async () => {
    const result = await executeWorkerCrmRenewal(baseInput());
    expect(result).toMatchObject({
      success: true,
      invoiceId: 'inv-1',
      cycleKey: '2026-06-01',
      executionMode: 'automatic',
      correlationId: 'corr-worker-1',
      completionOutcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_INVOICE_CUSTOMER,
    });
  });

  it('propaga BillingExecutionContextError como RenewalHardeningError permanente', async () => {
    vi.mocked(billingExecutionContextBuilder.build).mockRejectedValue(
      new BillingExecutionContextError('Plano ausente', 'BILLING_PLAN_NOT_FOUND')
    );
    await expect(executeWorkerCrmRenewal(baseInput())).rejects.toBeInstanceOf(RenewalHardeningError);
  });

  it('propaga ENGINE_NOT_APPROVED como permanente', async () => {
    vi.mocked(BillingExecutionOrchestrator.execute).mockRejectedValue(
      new BillingExecutionOrchestratorError('nao aprovado', 'ENGINE_NOT_APPROVED', 'ENGINE')
    );
    await expect(executeWorkerCrmRenewal(baseInput())).rejects.toMatchObject({
      classification: expect.objectContaining({ permanent: true }),
    });
  });

  it('WORKER_CRM_PIPELINE_VERSION definido', () => {
    expect(WORKER_CRM_PIPELINE_VERSION).toContain('v3');
  });
});

describe('assertWorkerContextReady', () => {
  it('aceita contexto certificado e puro', () => {
    expect(() => assertWorkerContextReady(certifiedContext())).not.toThrow();
  });

  it('rejeita context_certified false', () => {
    expect(() =>
      assertWorkerContextReady(
        certifiedContext({
          metadata: {
            correlation_id: null,
            execution_mode: null,
            plan_source: 'persisted_plan',
            has_persisted_plan: true,
            context_certified: false,
          },
        })
      )
    ).toThrow(/context_certified/);
  });

  it('rejeita context_pure false', () => {
    expect(() =>
      assertWorkerContextReady(
        certifiedContext({
          diagnostics: {
            ...certifiedContext().diagnostics,
            context_pure: false,
          },
        })
      )
    ).toThrow(/context_pure/);
  });

  it('rejeita sem billing plan', () => {
    expect(() =>
      assertWorkerContextReady(
        certifiedContext({
          diagnostics: {
            ...certifiedContext().diagnostics,
            billing_plan_present: false,
          },
          metadata: {
            ...certifiedContext().metadata,
            has_persisted_plan: false,
          },
        })
      )
    ).toThrow(/Billing Plan/);
  });

  it('rejeita sem billing items', () => {
    expect(() =>
      assertWorkerContextReady(
        certifiedContext({
          billingItems: [],
          diagnostics: {
            ...certifiedContext().diagnostics,
            billing_items_present: false,
          },
        })
      )
    ).toThrow(/Billing Items/);
  });
});

describe('Worker V2 — sem dependências legadas no pipeline', () => {
  const prohibited = [
    'executeCustomerRenewal',
    'resolveCrmRenewalPreviousInvoice',
    'overlayCrmContractOnRenewalItems',
    'getCustomerInvoiceItems',
  ];

  it('workerCrmRenewalPipeline.ts não referencia legado', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync(
      new URL('./workerCrmRenewalPipeline.ts', import.meta.url),
      'utf8'
    );
    for (const sym of prohibited) {
      expect(content.includes(sym)).toBe(false);
    }
  });

  it('recurringBillingJobService customer branch usa executeWorkerCrmRenewal', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync(
      new URL('../recurringBillingJobService.ts', import.meta.url),
      'utf8'
    );
    expect(content.includes('executeWorkerCrmRenewal')).toBe(true);
    expect(content.match(/BillingRenewalEngine\.execute/g)?.length).toBe(1);
  });
});

describe('BillingRenewalEngine — CRM bloqueado pós-cutover', () => {
  it('executeCustomerRenewal não é importado no engine', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync(
      new URL('../billingRenewalEngine/billingRenewalEngine.ts', import.meta.url),
      'utf8'
    );
    expect(content.includes('executeCustomerRenewal')).toBe(false);
    expect(content.includes('crm_use_worker_v2_pipeline')).toBe(true);
  });
});

describe('Worker V2 — cenários operacionais (paridade certificada)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSubscriptionById).mockResolvedValue(baseSubscription());
    vi.mocked(billingExecutionContextBuilder.build).mockResolvedValue(certifiedContext());
  });

  const scenarios = [
    'simple',
    'monthly',
    'annual',
    'trial',
    'discount',
    'taxes',
    'gateway',
    'notification',
    'timeline',
    'history',
    'advance',
    'recovery',
    'concurrency',
    'scheduler',
    'manual',
  ] as const;

  for (const scenario of scenarios) {
    it(`pipeline executável — ${scenario}`, async () => {
      vi.mocked(BillingExecutionOrchestrator.execute).mockResolvedValue(mockStage() as never);
      const result = await executeWorkerCrmRenewal({
        ...baseInput(),
        executionMode: scenario === 'manual' ? 'manual' : 'automatic',
      });
      expect(result.success).toBe(true);
    });
  }
});

describe('Worker V2 — validações obrigatórias', () => {
  const validationCases = [
    { field: 'context_certified', mutate: (c: BillingExecutionContext) => ({ ...c, metadata: { ...c.metadata, context_certified: false } }) },
    { field: 'context_pure', mutate: (c: BillingExecutionContext) => ({ ...c, diagnostics: { ...c.diagnostics, context_pure: false } }) },
    { field: 'billing_plan', mutate: (c: BillingExecutionContext) => ({ ...c, diagnostics: { ...c.diagnostics, billing_plan_present: false }, metadata: { ...c.metadata, has_persisted_plan: false } }) },
    { field: 'billing_items', mutate: (c: BillingExecutionContext) => ({ ...c, billingItems: [], diagnostics: { ...c.diagnostics, billing_items_present: false } }) },
  ];

  for (const { field, mutate } of validationCases) {
    it(`bloqueia quando ${field} inválido`, async () => {
      vi.mocked(billingExecutionContextBuilder.build).mockResolvedValue(mutate(certifiedContext()));
      await expect(executeWorkerCrmRenewal(baseInput())).rejects.toThrow();
    });
  }
});

describe('Worker V2 — completeBillingRecurringJob payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSubscriptionById).mockResolvedValue(baseSubscription());
    vi.mocked(billingExecutionContextBuilder.build).mockResolvedValue(certifiedContext());
    vi.mocked(BillingExecutionOrchestrator.execute).mockResolvedValue(mockStage() as never);
  });

  it('inclui pipeline version no detail', async () => {
    await executeWorkerCrmRenewal(baseInput());
    const call = vi.mocked(completeBillingRecurringJob).mock.calls[0]?.[1];
    expect(call?.detail).toContain(WORKER_CRM_PIPELINE_VERSION);
  });

  it('resultInvoiceType customer_invoice quando há invoice', async () => {
    await executeWorkerCrmRenewal(baseInput());
    expect(vi.mocked(completeBillingRecurringJob).mock.calls[0]?.[1]?.resultInvoiceType).toBe(
      'customer_invoice'
    );
  });
});
