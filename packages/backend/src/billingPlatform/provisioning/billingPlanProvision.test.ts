import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SubscriptionRow } from '../../services/billingSubscriptionService.js';
import type { BillingPlanRow } from '../../billingPlan/types.js';
import type { BillingPlanItemRow } from '../../billingPlanItems/types.js';

const mockGetSubscriptionById = vi.fn();
const mockFindActiveBySubscription = vi.fn();
const mockFindVersions = vi.fn();
const mockFindEffective = vi.fn();
const mockFindByBillingPlan = vi.fn();
const mockFindById = vi.fn();
const mockFindCurrent = vi.fn();
const mockPoolConnect = vi.fn();
const mockRunProvisionTransaction = vi.fn();
const mockRepair = vi.fn();
const mockSync = vi.fn();
const mockCreateActivePlan = vi.fn();
const mockCreateItems = vi.fn();

vi.mock('../../services/billingSubscriptionService.js', () => ({
  getSubscriptionById: (...args: unknown[]) => mockGetSubscriptionById(...args),
}));

vi.mock('../../billingPlan/billingPlanRepository.js', () => ({
  billingPlanRepository: {
    findActiveBySubscription: (...args: unknown[]) => mockFindActiveBySubscription(...args),
    findVersions: (...args: unknown[]) => mockFindVersions(...args),
    findById: (...args: unknown[]) => mockFindById(...args),
  },
  BillingPlanRepository: vi.fn(),
}));

vi.mock('../../billingPlanItems/repository.js', () => ({
  billingPlanItemRepository: {
    findEffective: (...args: unknown[]) => mockFindEffective(...args),
    findByBillingPlan: (...args: unknown[]) => mockFindByBillingPlan(...args),
    findCurrent: (...args: unknown[]) => mockFindCurrent(...args),
  },
  BillingPlanItemRepository: vi.fn(),
}));

vi.mock('../../utils/db.js', () => ({
  pool: {
    connect: (...args: unknown[]) => mockPoolConnect(...args),
    query: vi.fn(),
  },
}));

vi.mock('./billingPlanProvisionDb.js', () => ({
  runProvisionTransaction: (...args: unknown[]) => mockRunProvisionTransaction(...args),
}));

vi.mock('./billingPlanRepairService.js', () => ({
  repairBillingPlanForSubscription: (...args: unknown[]) => mockRepair(...args),
}));

vi.mock('./billingPlanSynchronizationService.js', () => ({
  synchronizeBillingPlanFromSubscription: (...args: unknown[]) => mockSync(...args),
}));

vi.mock('./billingPlanAutoProvision.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./billingPlanAutoProvision.js')>();
  return {
    ...actual,
    createActiveBillingPlanForSubscription: (...args: unknown[]) => mockCreateActivePlan(...args),
    createBillingPlanItemsForSubscription: (...args: unknown[]) => mockCreateItems(...args),
  };
});

import {
  BILLING_PROVISION_VERSION,
  BillingPlanProvisionError,
  BillingPlanProvisionService,
  buildBillingPlanItemInputsFromSubscription,
  resolveItemLabel,
  resetBillingProvisionMetricsForTests,
  getBillingProvisionMetrics,
  recordBillingPlanCreated,
  recordBillingPlanRepaired,
  recordBillingPlanSync,
  recordBillingPlanValidationError,
  recordBillingPlanProvisionDuration,
} from './index.js';
import { validateBillingPlanForSubscription } from './billingPlanProvisionValidator.js';

function subscription(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: 'sub-1',
    tenant_id: 't1',
    type: 'customer',
    customer_id: 'c1',
    plan_id: null,
    amount_cents: 5000,
    currency: 'BRL',
    billing_anchor_day: 10,
    billing_cycle_count: 0,
    billing_interval: 'monthly',
    status: 'active',
    next_billing_date: '2026-07-10',
    current_period_start: '2026-06-10',
    current_period_end: '2026-07-10',
    grace_period_days: 3,
    default_payment_method: null,
    users_count: null,
    gateway: null,
    cancel_at_period_end: false,
    last_job_at: null,
    created_by: 'crm_ui',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    cycles_unlimited: true,
    max_cycles: null,
    ...overrides,
  };
}

function plan(overrides: Partial<BillingPlanRow> = {}): BillingPlanRow {
  return {
    id: 'plan-1',
    tenant_id: 't1',
    subscription_id: 'sub-1',
    plan_number: 'BP-00000001',
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
    billing_anchor: 10,
    starts_at: '2026-06-10',
    ends_at: '2026-07-10',
    trial_until: null,
    next_generation_at: null,
    metadata: {},
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function item(overrides: Partial<BillingPlanItemRow> = {}): BillingPlanItemRow {
  return {
    id: 'item-1',
    tenant_id: 't1',
    billing_plan_id: 'plan-1',
    sequence: 1,
    status: 'active',
    item_type: 'service',
    origin: 'subscription',
    name: 'Plano mensal',
    description: 'Plano mensal',
    quantity: 1,
    unit_price: 5000,
    discount_type: 'none',
    discount_value: 0,
    tax_rate: null,
    tax_value: 0,
    total_amount: 5000,
    currency: 'BRL',
    is_recurring: true,
    billing_interval: 'monthly',
    billing_frequency: 1,
    billing_anchor: 10,
    proration_mode: 'none',
    starts_at: '2026-06-10',
    ends_at: '2026-07-10',
    trial_until: null,
    definition_hash: 'hash-1',
    item_revision: 1,
    effective_from: '2026-06-10',
    effective_until: null,
    created_from_revision: null,
    superseded_by_revision: null,
    snapshot_strategy: 'invoice_snapshot',
    metadata: {},
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('BillingPlanProvision — Sprint 4.0A', () => {
  const service = new BillingPlanProvisionService();

  beforeEach(() => {
    vi.clearAllMocks();
    resetBillingProvisionMetricsForTests();
    mockGetSubscriptionById.mockReset();
    mockFindActiveBySubscription.mockReset();
    mockFindVersions.mockReset();
    mockFindEffective.mockReset();
    mockFindByBillingPlan.mockReset();
    mockFindById.mockReset();
    mockFindCurrent.mockReset();
    mockPoolConnect.mockReset();
    mockRepair.mockReset();
    mockSync.mockReset();
    mockCreateActivePlan.mockReset();
    mockCreateItems.mockReset();
    mockRunProvisionTransaction.mockReset();
    mockRunProvisionTransaction.mockImplementation(async (_tenantId, work) =>
      work({ query: vi.fn().mockResolvedValue({ rows: [] }) } as never)
    );
    mockPoolConnect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    });
  });

  it('BILLING_PROVISION_VERSION', () => {
    expect(BILLING_PROVISION_VERSION).toBe('v4_0a_auto_provision');
  });

  describe('buildBillingPlanItemInputsFromSubscription', () => {
    it('cria item com amount da assinatura', () => {
      const inputs = buildBillingPlanItemInputsFromSubscription({
        subscription: subscription(),
        billingPlanId: 'plan-1',
        metadata: { crm_contract: { amount_cents: 5000, billing_interval: 'monthly', description: 'Plano mensal' } },
      });
      expect(inputs).toHaveLength(1);
      expect(inputs[0]!.unit_price).toBe(5000);
      expect(inputs[0]!.total_amount).toBe(5000);
      expect(inputs[0]!.billing_plan_id).toBe('plan-1');
    });

    it('usa descrição do contrato CRM', () => {
      const inputs = buildBillingPlanItemInputsFromSubscription({
        subscription: subscription(),
        billingPlanId: 'plan-1',
        metadata: { crm_contract: { amount_cents: 5000, billing_interval: 'monthly', description: 'Serviço X' } },
      });
      expect(inputs[0]!.name).toBe('Serviço X');
    });

    it('fallback para label padrão sem contrato', () => {
      expect(resolveItemLabel(subscription(), {})).toBe('Assinatura recorrente');
    });

    it('propaga billing_interval e anchor', () => {
      const inputs = buildBillingPlanItemInputsFromSubscription({
        subscription: subscription({ billing_interval: 'yearly', billing_anchor_day: 15 }),
        billingPlanId: 'plan-1',
      });
      expect(inputs[0]!.billing_interval).toBe('yearly');
      expect(inputs[0]!.billing_anchor).toBe(15);
    });

    it('garante amount mínimo de 1 centavo', () => {
      const inputs = buildBillingPlanItemInputsFromSubscription({
        subscription: subscription({ amount_cents: 0 }),
        billingPlanId: 'plan-1',
      });
      expect(inputs[0]!.unit_price).toBe(1);
    });

    it('marca origin subscription e status active', () => {
      const inputs = buildBillingPlanItemInputsFromSubscription({
        subscription: subscription(),
        billingPlanId: 'plan-1',
      });
      expect(inputs[0]!.origin).toBe('subscription');
      expect(inputs[0]!.status).toBe('active');
    });

    it('metadata de provisionamento', () => {
      const inputs = buildBillingPlanItemInputsFromSubscription({
        subscription: subscription(),
        billingPlanId: 'plan-1',
      });
      expect(inputs[0]!.metadata?.provisioned_from).toBe('billing_plan_auto_provision');
    });
  });

  describe('validateBillingPlanForSubscription', () => {
    it('falha quando plano ausente', async () => {
      mockFindActiveBySubscription.mockResolvedValue(null);
      const status = await validateBillingPlanForSubscription(subscription());
      expect(status.valid).toBe(false);
      expect(status.issues).toContain('billing_plan_missing');
    });

    it('falha quando items ausentes', async () => {
      mockFindActiveBySubscription.mockResolvedValue(plan());
      mockFindEffective.mockResolvedValue([]);
      const status = await validateBillingPlanForSubscription(subscription());
      expect(status.valid).toBe(false);
      expect(status.issues).toContain('billing_plan_items_missing');
    });

    it('ok quando plano e items existem', async () => {
      mockFindActiveBySubscription.mockResolvedValue(plan());
      mockFindEffective.mockResolvedValue([item()]);
      const status = await validateBillingPlanForSubscription(subscription());
      expect(status.valid).toBe(true);
      expect(status.item_count).toBe(1);
    });

    it('detecta tenant mismatch', async () => {
      mockFindActiveBySubscription.mockResolvedValue(plan({ tenant_id: 'other' }));
      mockFindEffective.mockResolvedValue([item()]);
      const status = await validateBillingPlanForSubscription(subscription());
      expect(status.issues).toContain('tenant_mismatch');
    });

    it('detecta plano não ativo', async () => {
      mockFindActiveBySubscription.mockResolvedValue(plan({ status: 'draft' }));
      mockFindEffective.mockResolvedValue([item()]);
      const status = await validateBillingPlanForSubscription(subscription());
      expect(status.issues).toContain('billing_plan_not_active');
    });
  });

  describe('BillingPlanProvisionService.validate', () => {
    it('noop válido para assinatura saas', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription({ type: 'saas' }));
      const status = await service.validate('sub-1');
      expect(status.valid).toBe(true);
      expect(mockFindActiveBySubscription).not.toHaveBeenCalled();
    });

    it('SUBSCRIPTION_NOT_FOUND', async () => {
      mockGetSubscriptionById.mockResolvedValue(null);
      await expect(service.validate('missing')).rejects.toMatchObject({ code: 'SUBSCRIPTION_NOT_FOUND' });
    });

    it('TENANT_MISMATCH', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription({ tenant_id: 't1' }));
      await expect(service.validate('sub-1', { tenantId: 't2' })).rejects.toMatchObject({
        code: 'TENANT_MISMATCH',
      });
    });
  });

  describe('BillingPlanProvisionService.provision', () => {
    it('provisiona assinatura customer via repair', async () => {
      const sub = subscription();
      mockGetSubscriptionById.mockResolvedValue(sub);
      mockRepair.mockResolvedValue({
        plan: plan(),
        items: [item()],
        createdPlan: true,
        createdItems: true,
      });
      const result = await service.provision('sub-1', { tenantId: 't1' });
      expect(result.ok).toBe(true);
      expect(result.action).toBe('provisioned');
      expect(result.created_plan).toBe(true);
      expect(mockRepair).toHaveBeenCalled();
    });

    it('noop para saas', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription({ type: 'saas' }));
      const result = await service.provision('sub-1');
      expect(result.action).toBe('noop');
      expect(mockRepair).not.toHaveBeenCalled();
    });

    it('propaga falha de provision via runProvisionTransaction', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription());
      mockRunProvisionTransaction.mockRejectedValue(new Error('db_error'));
      await expect(service.provision('sub-1')).rejects.toMatchObject({ code: 'PROVISION_FAILED' });
    });
  });

  describe('BillingPlanProvisionService.repair', () => {
    it('repara plano customer', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription());
      mockRepair.mockResolvedValue({
        plan: plan(),
        items: [item()],
        createdPlan: false,
        createdItems: true,
      });
      const result = await service.repair('sub-1');
      expect(result.action).toBe('repaired');
      expect(result.repaired).toBe(true);
    });
  });

  describe('BillingPlanProvisionService.synchronize', () => {
    it('sincroniza quando há mudanças', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription());
      mockSync.mockResolvedValue({ plan: plan(), items: [item()], changed: true });
      const result = await service.synchronize('sub-1');
      expect(result.synchronized).toBe(true);
    });

    it('retorna sem mudanças', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription());
      mockSync.mockResolvedValue({ plan: plan(), items: [item()], changed: false });
      const result = await service.synchronize('sub-1');
      expect(result.message).toContain('já estava sincronizado');
    });
  });

  describe('BillingPlanProvisionService.ensureBillingPlan', () => {
    it('retorna validated quando já válido', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription());
      mockFindActiveBySubscription.mockResolvedValue(plan());
      mockFindEffective.mockResolvedValue([item()]);
      mockSync.mockResolvedValue({ plan: plan(), items: [item()], changed: false });
      const result = await service.ensureBillingPlan('sub-1');
      expect(result.action).toBe('validated');
      expect(result.ok).toBe(true);
    });

    it('provisiona quando inválido', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription());
      mockFindActiveBySubscription.mockResolvedValueOnce(null).mockResolvedValue(plan());
      mockFindEffective.mockResolvedValueOnce([]).mockResolvedValue([item()]);
      mockRepair.mockResolvedValue({
        plan: plan(),
        items: [item()],
        createdPlan: true,
        createdItems: true,
      });
      mockSync.mockResolvedValue({ plan: plan(), items: [item()], changed: false });
      const result = await service.ensureBillingPlan('sub-1');
      expect(result.ok).toBe(true);
      expect(['provisioned', 'synchronized', 'validated', 'repaired']).toContain(result.action);
    });

    it('sincroniza após validação quando divergente', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription());
      mockFindActiveBySubscription.mockResolvedValue(plan());
      mockFindEffective.mockResolvedValue([item()]);
      mockSync.mockResolvedValue({ plan: plan({ plan_revision: 2 }), items: [item()], changed: true });
      const result = await service.ensureBillingPlan('sub-1');
      expect(result.action).toBe('synchronized');
    });

    it('skipSync evita sincronização', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription());
      mockFindActiveBySubscription.mockResolvedValue(plan());
      mockFindEffective.mockResolvedValue([item()]);
      const result = await service.ensureBillingPlan('sub-1', { skipSync: true });
      expect(result.action).toBe('validated');
      expect(mockSync).not.toHaveBeenCalled();
    });

    it('noop para assinatura não elegível', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription({ type: 'saas' }));
      const result = await service.ensureBillingPlan('sub-1');
      expect(result.action).toBe('noop');
    });
  });

  describe('BillingPlanProvisionError', () => {
    it('expõe code e details', () => {
      const err = new BillingPlanProvisionError('msg', 'VALIDATION_FAILED', { x: 1 });
      expect(err.name).toBe('BillingPlanProvisionError');
      expect(err.code).toBe('VALIDATION_FAILED');
      expect(err.details).toEqual({ x: 1 });
    });
  });

  describe('métricas de observabilidade', () => {
    it('incrementa billing_plans_created', () => {
      recordBillingPlanCreated();
      expect(getBillingProvisionMetrics().billing_plans_created).toBe(1);
    });

    it('incrementa billing_plans_repaired', () => {
      recordBillingPlanRepaired();
      expect(getBillingProvisionMetrics().billing_plans_repaired).toBe(1);
    });

    it('incrementa billing_plan_syncs', () => {
      recordBillingPlanSync();
      expect(getBillingProvisionMetrics().billing_plan_syncs).toBe(1);
    });

    it('incrementa validation errors', () => {
      recordBillingPlanValidationError();
      expect(getBillingProvisionMetrics().billing_plan_validation_errors).toBe(1);
    });

    it('acumula provision time', () => {
      recordBillingPlanProvisionDuration(120);
      recordBillingPlanProvisionDuration(80);
      const m = getBillingProvisionMetrics();
      expect(m.billing_plan_auto_provision_time_ms_total).toBe(200);
      expect(m.billing_plan_auto_provision_count).toBe(2);
    });

    it('reset para testes', () => {
      recordBillingPlanCreated();
      resetBillingProvisionMetricsForTests();
      expect(getBillingProvisionMetrics().billing_plans_created).toBe(0);
    });
  });

  describe('cenários idempotência e isolamento', () => {
    it('provision idempotente não chama repair duas vezes no noop saas', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription({ type: 'saas' }));
      await service.ensureBillingPlan('sub-1');
      await service.ensureBillingPlan('sub-1');
      expect(mockRepair).not.toHaveBeenCalled();
    });

    it('tenant isolation na validação', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription({ tenant_id: 't1' }));
      await expect(service.provision('sub-1', { tenantId: 't2' })).rejects.toMatchObject({
        code: 'TENANT_MISMATCH',
      });
    });

    it('worker auto provision path — ensure antes de context', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription());
      mockFindActiveBySubscription.mockResolvedValueOnce(null).mockResolvedValue(plan());
      mockFindEffective.mockResolvedValueOnce([]).mockResolvedValue([item()]);
      mockRepair.mockResolvedValue({
        plan: plan(),
        items: [item()],
        createdPlan: true,
        createdItems: true,
      });
      mockSync.mockResolvedValue({ plan: plan(), items: [item()], changed: false });
      const result = await service.ensureBillingPlan('sub-1', {
        tenantId: 't1',
        periodStartYmd: '2026-06-10',
      });
      expect(result.billing_plan_id).toBe('plan-1');
    });

    it('manual renewal path — mesmo ensure', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription());
      mockFindActiveBySubscription.mockResolvedValue(plan());
      mockFindEffective.mockResolvedValue([item()]);
      mockSync.mockResolvedValue({ plan: plan(), items: [item()], changed: false });
      const result = await service.ensureBillingPlan('sub-1', { periodStartYmd: '2026-06-10' });
      expect(result.ok).toBe(true);
    });

    it('sincronização após edição — synchronize chamado', async () => {
      mockGetSubscriptionById.mockResolvedValue(subscription({ amount_cents: 9900 }));
      mockSync.mockResolvedValue({ plan: plan(), items: [item({ unit_price: 9900 })], changed: true });
      const result = await service.synchronize('sub-1');
      expect(result.synchronized).toBe(true);
    });
  });
});
