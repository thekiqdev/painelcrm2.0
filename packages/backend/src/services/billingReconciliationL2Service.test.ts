import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./billing2/billingFeatureFlags.js', () => ({
  isBilling2FlagEnabled: vi.fn(),
}));

vi.mock('../modules/payments/gatewayProvider.js', () => ({
  getActiveGateway: vi.fn(),
}));

vi.mock('../modules/payments/webhook/statusNormalizer.js', () => ({
  normalizeGatewayStatus: vi.fn((_gw: string, status: string) => {
    if (status === 'RECEIVED' || status === 'CONFIRMED') return 'paid';
    if (status === 'OVERDUE') return 'overdue';
    return 'pending';
  }),
}));

vi.mock('../modules/payments/webhook/paymentDomainService.js', () => ({
  applyPaymentEvent: vi.fn(async () => undefined),
}));

vi.mock('./collectionPolicy/billingAuditEventWriter.js', () => ({
  writeBillingAuditEvent: vi.fn(async () => ({ id: 'a1' })),
}));

vi.mock('./billingLogger.js', () => ({
  billingLog: vi.fn(),
}));

vi.mock('./invoiceService.js', () => ({
  updateInvoiceGatewayData: vi.fn(async () => undefined),
  getInvoiceById: vi.fn(async () => ({ payment_method: 'PIX', idempotency_key: null })),
}));

vi.mock('./collectionPolicy/reader.js', () => ({
  getActiveCollectionPolicy: vi.fn(async () => ({
    policy: {
      attempt_interval_days: 3,
      max_attempts: 3,
      grace_period_days: 7,
      suspend_after_days: 7,
      cancel_after_days: 30,
    },
  })),
}));

vi.mock('./collectionPolicy/hook.js', () => ({
  scheduleCollectionPolicyExtensionPoint: vi.fn(),
}));

vi.mock('./billing2/billingCorrelationId.js', () => ({
  tenantBillingCorrelationId: (id: string) => `c:${id}`,
}));

describe('billingReconciliationL2Service (Sprint 8)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('apply é no-op (skipped) quando flag OFF', async () => {
    const { isBilling2FlagEnabled } = await import('./billing2/billingFeatureFlags.js');
    vi.mocked(isBilling2FlagEnabled).mockResolvedValue(false);

    const { runReconciliationL2 } = await import('./billingReconciliationL2Service.js');
    const r = await runReconciliationL2({ dryRun: false, limit: 10 });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('flag_reconciliation_l2_enabled_off');
    expect(r.applied).toBe(0);
  });

  it('dry-run detecta paid_remote_pending_local sem apply', async () => {
    const { isBilling2FlagEnabled } = await import('./billing2/billingFeatureFlags.js');
    vi.mocked(isBilling2FlagEnabled).mockResolvedValue(false);

    const { pool } = await import('../utils/db.js');
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          id: 'b1',
          tenant_id: 't1',
          tenant_name: 'Acme',
          status: 'pending',
          gateway: 'asaas',
          gateway_reference_id: 'pay_1',
          gateway_status: 'PENDING',
          amount_cents: 9900,
          due_date: '2026-07-01',
          payment_method: 'PIX',
        },
      ],
      rowCount: 1,
    } as never);

    const { getActiveGateway } = await import('../modules/payments/gatewayProvider.js');
    vi.mocked(getActiveGateway).mockResolvedValue({
      getPayment: vi.fn(async () => ({ status: 'RECEIVED', paidAt: '2026-07-02T12:00:00Z' })),
    } as never);

    const { applyPaymentEvent } = await import('../modules/payments/webhook/paymentDomainService.js');

    const { runReconciliationL2 } = await import('./billingReconciliationL2Service.js');
    const r = await runReconciliationL2({ dryRun: true, limit: 10 });
    expect(r.skipped).toBe(false);
    expect(r.dry_run).toBe(true);
    expect(r.divergences).toBe(1);
    expect(r.samples[0]?.kind).toBe('paid_remote_pending_local');
    expect(r.applied).toBe(0);
    expect(applyPaymentEvent).not.toHaveBeenCalled();
  });
});

describe('billingDunningJobService (Sprint 8)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('apply é skipped quando dunning_enabled OFF', async () => {
    const { isBilling2FlagEnabled } = await import('./billing2/billingFeatureFlags.js');
    vi.mocked(isBilling2FlagEnabled).mockResolvedValue(false);

    const { runBillingDunningCycle } = await import('./billingDunningJobService.js');
    const r = await runBillingDunningCycle({ dryRun: false });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('flag_dunning_enabled_off');
  });
});
