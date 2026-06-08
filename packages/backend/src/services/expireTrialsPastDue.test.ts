import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../utils/db.js';
import { isTrialExpirationJobEnabled } from '../config/checkoutTrialFeatureFlags.js';
import { schedulePublishPlatformTrialEnded } from './platformNotifications/platformBusinessNotifications.js';
import { observeBillingLifecycleEventWithKanbanActual } from '../lifecycle/lifecycleBillingObserver.js';
import { promoteLifecycleCard } from '../lifecycle/lifecyclePromotionService.js';
import { expireTrialsPastDue } from './subscriptionService.js';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../config/checkoutTrialFeatureFlags.js', () => ({
  isTrialExpirationJobEnabled: vi.fn(),
}));

vi.mock('./platformNotifications/platformBusinessNotifications.js', () => ({
  schedulePublishPlatformTrialEnded: vi.fn(),
}));

vi.mock('../lifecycle/lifecycleBillingObserver.js', () => ({
  observeBillingLifecycleEventWithKanbanActual: vi.fn(),
}));

vi.mock('../lifecycle/lifecyclePromotionService.js', () => ({
  promoteLifecycleCard: vi.fn(),
}));

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function mockSuspendedTenants(ids: string[]) {
  vi.mocked(pool.query).mockResolvedValue({
    rows: ids.map((id) => ({ id })),
    rowCount: ids.length,
  } as never);
}

describe('expireTrialsPastDue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTrialExpirationJobEnabled).mockReturnValue(true);
    vi.mocked(observeBillingLifecycleEventWithKanbanActual).mockResolvedValue({
      matched: true,
      fallback: false,
      boardName: 'Reativação',
      columnName: 'Trial expirado',
      reason: null,
    });
    vi.mocked(promoteLifecycleCard).mockResolvedValue({
      status: 'moved',
      toBoard: 'Reativação',
      toColumn: 'Trial expirado',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cenário A — trial válido: não processa', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

    const result = await expireTrialsPastDue();

    expect(result).toEqual({ suspended: 0, lifecycle_events: 0, promotions_executed: 0 });
    expect(promoteLifecycleCard).not.toHaveBeenCalled();
    expect(observeBillingLifecycleEventWithKanbanActual).not.toHaveBeenCalled();
  });

  it('cenário B — trial vencido: processa normalmente', async () => {
    mockSuspendedTenants([TENANT_A]);

    const result = await expireTrialsPastDue();

    expect(result).toEqual({ suspended: 1, lifecycle_events: 1, promotions_executed: 1 });
    expect(schedulePublishPlatformTrialEnded).toHaveBeenCalledWith(TENANT_A);
    expect(observeBillingLifecycleEventWithKanbanActual).toHaveBeenCalledWith(
      'trial.expired',
      { tenantId: TENANT_A },
      'expireTrialsPastDue',
    );
    expect(promoteLifecycleCard).toHaveBeenCalledWith({
      eventType: 'trial.expired',
      context: { tenantId: TENANT_A },
      source: 'expireTrialsPastDue',
    });
  });

  it('cenário C — trial alterado manualmente para passado: processa na próxima execução', async () => {
    mockSuspendedTenants([TENANT_B]);

    const result = await expireTrialsPastDue();

    expect(result.suspended).toBe(1);
    expect(String(vi.mocked(pool.query).mock.calls[0]?.[0])).toContain('trial_ends_at <= now()');
  });

  it('cenário D — execução repetida: idempotente quando UPDATE não retorna linhas', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

    const first = await expireTrialsPastDue();
    const second = await expireTrialsPastDue();

    expect(first.suspended).toBe(0);
    expect(second.suspended).toBe(0);
    expect(promoteLifecycleCard).not.toHaveBeenCalled();
  });

  it('cenário E — scheduler após processamento: não reprocesa tenant já suspenso', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

    const result = await expireTrialsPastDue();

    expect(result.suspended).toBe(0);
    expect(String(vi.mocked(pool.query).mock.calls[0]?.[0])).toContain("status IN ('trial', 'payment_pending')");
  });

  it('respeita TRIAL_EXPIRATION_JOB desligado', async () => {
    vi.mocked(isTrialExpirationJobEnabled).mockReturnValue(false);

    const result = await expireTrialsPastDue();

    expect(result).toEqual({ suspended: 0, lifecycle_events: 0, promotions_executed: 0 });
    expect(pool.query).not.toHaveBeenCalled();
  });
});
