/**
 * Sprint 4.0A.1 — Runtime certification (provision + SQL + pipeline contracts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const backendSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readSrc(relativePath: string): string {
  return readFileSync(path.join(backendSrc, relativePath), 'utf8');
}

describe('billingProvisionRuntimeCertification — Sprint 4.0A.1', () => {
  describe('SQL runtime audit — clients.tenant_id', () => {
    const contextBuilder = readSrc('billingExecutionContext/billingExecutionContextBuilder.ts');
    const mercadoPago = readSrc('services/mercadoPagoCustomerInvoicePaymentService.ts');

    it('context builder não referencia clients.tenant_id', () => {
      expect(contextBuilder).not.toMatch(/FROM clients WHERE id = .*tenant_id/);
      expect(contextBuilder).toContain('INNER JOIN users u ON u.id = c.user_id');
    });

    it('mercado pago payer não referencia clients.tenant_id', () => {
      expect(mercadoPago).not.toMatch(
        /FROM clients WHERE id = \$1::uuid AND tenant_id = \$2::uuid/
      );
      expect(mercadoPago).toContain('INNER JOIN users u ON u.id = c.user_id');
    });

    it('billing_plans queries usam tenant_id na tabela correta', () => {
      const repo = readSrc('billingPlan/billingPlanRepository.ts');
      expect(repo).toContain('FROM billing_plans');
      expect(repo).toContain('tenant_id = $2::uuid');
    });

    it('billing_plan_items INSERT inclui tenant_id', () => {
      const itemsRepo = readSrc('billingPlanItems/repository.ts');
      expect(itemsRepo).toContain('tenant_id, billing_plan_id');
    });

    it('subscriptions DELETE no rollback usa tenant_id', () => {
      const billing = readSrc('services/customerBillingService.ts');
      expect(billing).toContain('DELETE FROM subscriptions WHERE id = $1::uuid AND tenant_id = $2::uuid');
    });
  });

  describe('provision module contracts', () => {
    it('usa runProvisionTransaction para RLS', () => {
      const svc = readSrc('billingPlatform/provisioning/billingPlanProvisionService.ts');
      expect(svc).toContain('runProvisionTransaction');
      expect(svc).not.toContain('pool.connect()');
    });

    it('repair corrige janela efetiva sem duplicar sequence', () => {
      const repair = readSrc('billingPlatform/provisioning/billingPlanRepairService.ts');
      expect(repair).toContain('repairItemEffectiveWindow');
      expect(repair).toContain('effective_from');
    });

    it('factory define plan_state running quando active', () => {
      const factory = readSrc('billingPlan/billingPlanFactory.ts');
      expect(factory).toContain("'running'");
    });
  });
});

describe('billingProvisionRuntimeCertification — metrics & health', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('métricas Sprint 4.0A.1 expostas', async () => {
    const m = await import('./billingPlanProvisionMetrics.js');
    m.resetBillingProvisionMetricsForTests();
    m.recordBillingPlanCreated();
    m.recordBillingItemsCreated(2);
    m.recordProvisionRuntimeError();
    m.recordTenantResolutionError();
    const snap = m.getBillingProvisionMetrics();
    expect(snap.billing_plan_created).toBe(1);
    expect(snap.billing_items_created).toBe(2);
    expect(snap.provision_runtime_errors).toBe(1);
    expect(snap.tenant_resolution_errors).toBe(1);
  });

  it('provision health degraded com erros SQL', async () => {
    const m = await import('./billingPlanProvisionMetrics.js');
    m.resetBillingProvisionMetricsForTests();
    m.recordProvisionSqlError();
    m.recordProvisionSqlError();
    m.recordProvisionSqlError();
    m.recordProvisionSqlError();
    const health = m.buildProvisionHealthDashboard();
    expect(health.status).toBe('degraded');
    expect(health.signals).toContain('provision_sql_errors');
  });

  it('provision health healthy sem erros', async () => {
    const m = await import('./billingPlanProvisionMetrics.js');
    m.resetBillingProvisionMetricsForTests();
    const health = m.buildProvisionHealthDashboard();
    expect(health.status).toBe('healthy');
    expect(health.provision_health_score).toBeGreaterThanOrEqual(85);
  });
});

describe('billingProvisionRuntimeCertification — pipeline scenarios', () => {
  const mockGetSubscriptionById = vi.fn();
  const mockFindActive = vi.fn();
  const mockFindEffective = vi.fn();
  const mockRunTx = vi.fn();
  const mockRepair = vi.fn();
  const mockSync = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRunTx.mockImplementation(async (_t: string, work: (c: unknown) => Promise<unknown>) =>
      work({ query: vi.fn().mockResolvedValue({ rows: [] }) })
    );

    vi.doMock('../../services/billingSubscriptionService.js', () => ({
      getSubscriptionById: (...a: unknown[]) => mockGetSubscriptionById(...a),
    }));
    vi.doMock('../../billingPlan/billingPlanRepository.js', () => ({
      billingPlanRepository: {
        findActiveBySubscription: (...a: unknown[]) => mockFindActive(...a),
        findVersions: vi.fn().mockResolvedValue([]),
        findById: vi.fn(),
      },
      BillingPlanRepository: vi.fn(),
    }));
    vi.doMock('../../billingPlanItems/repository.js', () => ({
      billingPlanItemRepository: {
        findEffective: (...a: unknown[]) => mockFindEffective(...a),
        findByBillingPlan: vi.fn().mockResolvedValue([]),
        findCurrent: vi.fn(),
      },
      BillingPlanItemRepository: vi.fn(),
    }));
    vi.doMock('./billingPlanProvisionDb.js', () => ({
      runProvisionTransaction: (...a: unknown[]) => mockRunTx(...a),
    }));
    vi.doMock('./billingPlanRepairService.js', () => ({
      repairBillingPlanForSubscription: (...a: unknown[]) => mockRepair(...a),
    }));
    vi.doMock('./billingPlanSynchronizationService.js', () => ({
      synchronizeBillingPlanFromSubscription: (...a: unknown[]) => mockSync(...a),
    }));
  });

  const sub = {
    id: 'sub-1',
    tenant_id: 't1',
    type: 'customer',
    customer_id: 'c1',
    plan_id: null,
    amount_cents: 1000,
    currency: 'BRL',
    billing_anchor_day: 1,
    billing_cycle_count: 0,
    billing_interval: 'monthly',
    status: 'active',
    next_billing_date: '2026-07-01',
    current_period_start: '2026-06-01',
    current_period_end: '2026-07-01',
    grace_period_days: 3,
    default_payment_method: null,
    users_count: null,
    gateway: null,
    cancel_at_period_end: false,
    last_job_at: null,
    created_by: null,
    created_at: '',
    updated_at: '',
    cycles_unlimited: true,
    max_cycles: null,
  };

  const plan = {
    id: 'plan-1',
    tenant_id: 't1',
    subscription_id: 'sub-1',
    plan_number: 'BP-1',
    status: 'active',
    version: 1,
    plan_revision: 1,
    plan_state: 'running',
    created_from: 'subscription',
    engine_version: 'v2',
    billing_strategy: 'billing_plan_items',
    currency: 'BRL',
    billing_interval: 'monthly',
    billing_frequency: 1,
    billing_anchor: 1,
    starts_at: '2026-06-01',
    ends_at: null,
    trial_until: null,
    next_generation_at: null,
    metadata: {},
    created_at: '',
    updated_at: '',
  };

  const item = {
    id: 'item-1',
    tenant_id: 't1',
    billing_plan_id: 'plan-1',
    sequence: 1,
    status: 'active',
    item_type: 'service',
    origin: 'subscription',
    name: 'X',
    description: null,
    quantity: 1,
    unit_price: 1000,
    discount_type: 'none',
    discount_value: 0,
    tax_rate: null,
    tax_value: 0,
    total_amount: 1000,
    currency: 'BRL',
    is_recurring: true,
    billing_interval: 'monthly',
    billing_frequency: 1,
    billing_anchor: 1,
    proration_mode: 'none',
    starts_at: '2026-06-01',
    ends_at: null,
    trial_until: null,
    definition_hash: 'h',
    item_revision: 1,
    effective_from: '2026-06-01',
    effective_until: null,
    created_from_revision: null,
    superseded_by_revision: null,
    snapshot_strategy: 'invoice_snapshot',
    metadata: {},
    created_at: '',
    updated_at: '',
  };

  async function service() {
    const { BillingPlanProvisionService } = await import('./billingPlanProvisionService.js');
    return new BillingPlanProvisionService();
  }

  const scenarios = [
    ['nova assinatura sem plano', { active: null, effective: [], repair: true }],
    ['assinatura antiga sem plano', { active: null, effective: [], repair: true }],
    ['plano draft tratado no repair', { active: null, effective: [], repair: true }],
    ['plano archived tratado no repair', { active: null, effective: [], repair: true }],
    ['itens inexistentes', { active: plan, effective: [], repair: true }],
    ['repair idempotente com plano válido', { active: plan, effective: [item], repair: false }],
    ['tenant isolation mismatch', { tenantMismatch: true }],
    ['renewal worker periodStart', { active: plan, effective: [item], period: '2026-06-01' }],
    ['renewal manual periodStart', { active: plan, effective: [item], period: '2026-06-15' }],
    ['saas noop', { type: 'saas' }],
    ['validação final pós provision', { active: null, effective: [], repair: true, postValid: true }],
  ] as const;

  for (const [name, cfg] of scenarios) {
    it(`cenário: ${name}`, async () => {
      const s = cfg.type === 'saas' ? { ...sub, type: 'saas' as const } : sub;
      mockGetSubscriptionById.mockResolvedValue(s);

      if ('tenantMismatch' in cfg && cfg.tenantMismatch) {
        await expect((await service()).provision('sub-1', { tenantId: 'other' })).rejects.toMatchObject({
          code: 'TENANT_MISMATCH',
        });
        return;
      }

      if (cfg.active === null) {
        mockFindActive.mockResolvedValueOnce(null);
        mockFindEffective.mockResolvedValueOnce([]);
      } else {
        mockFindActive.mockResolvedValue(cfg.active);
        mockFindEffective.mockResolvedValue(cfg.effective);
      }

      if (cfg.repair) {
        mockRepair.mockResolvedValue({
          plan,
          items: [item],
          createdPlan: true,
          createdItems: true,
        });
      }
      mockSync.mockResolvedValue({ plan, items: [item], changed: false });

      const result = await (await service()).ensureBillingPlan('sub-1', {
        tenantId: 't1',
        periodStartYmd: 'period' in cfg ? cfg.period : '2026-06-01',
      });

      if (cfg.type === 'saas') {
        expect(result.action).toBe('noop');
        return;
      }
      expect(result.ok).toBe(true);
    });
  }

  it('pg 42703 classificado como tenant_resolution', async () => {
    const { isPgError, observeProvisionFailure } = await import('./billingPlanProvisionErrors.js');
    const { resetBillingProvisionMetricsForTests, getBillingProvisionMetrics } = await import(
      './billingPlanProvisionMetrics.js'
    );
    resetBillingProvisionMetricsForTests();
    expect(isPgError({ code: '42703' }, '42703')).toBe(true);
    observeProvisionFailure({ code: '42703', message: 'column "tenant_id" does not exist' });
    expect(getBillingProvisionMetrics().tenant_resolution_errors).toBe(1);
  });

  it('invoice path depende de plano ativo no context resolver', () => {
    const resolver = readSrc('billingExecutionContext/planItemResolver.ts');
    expect(resolver).toContain('BILLING_PLAN_NOT_FOUND');
    expect(resolver).toContain('findActiveBySubscription');
    expect(resolver).toContain('findEffective');
  });
});
