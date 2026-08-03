import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  utcInstantForLocalWallClock,
  resolveInvoiceTransactionalDispatchSchedule,
} from './notificationTenantOutboundDispatchSchedule.js';

vi.mock('../tenantBillingPreferencesService.js', () => ({
  getTenantBillingPreferences: vi.fn(),
  resolveTenantBillingPreferences: vi.fn(),
}));

import {
  getTenantBillingPreferences,
  resolveTenantBillingPreferences,
} from '../tenantBillingPreferencesService.js';

function localWallAt(d: Date, timeZone: string): { ymd: string; hhmm: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { ymd: `${m.year}-${m.month}-${m.day}`, hhmm: `${m.hour}:${m.minute}` };
}

describe('utcInstantForLocalWallClock', () => {
  it('reproduces America/Sao_Paulo wall time', () => {
    const d = utcInstantForLocalWallClock('2024-08-15', '15:30', 'America/Sao_Paulo');
    expect(localWallAt(d, 'America/Sao_Paulo')).toEqual({ ymd: '2024-08-15', hhmm: '15:30' });
  });

  it('reproduces UTC wall time', () => {
    const d = utcInstantForLocalWallClock('2024-01-10', '09:00', 'UTC');
    expect(localWallAt(d, 'UTC')).toEqual({ ymd: '2024-01-10', hhmm: '09:00' });
  });
});

describe('resolveInvoiceTransactionalDispatchSchedule — Sprint 2', () => {
  const tz = 'America/Sao_Paulo';

  beforeEach(() => {
    vi.mocked(getTenantBillingPreferences).mockResolvedValue({
      timezone: tz,
      recurring_generate_time_local: '14:00',
      invoice_notify_same_as_generation: true,
      invoice_notify_time_local: null,
      recurring_invoice_generate_days_before_due: 0,
      recurring_invoice_generate_days_before_due_weekly: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function mockResolved(overrides: Record<string, unknown> = {}) {
    vi.mocked(resolveTenantBillingPreferences).mockReturnValue({
      timezone_effective: tz,
      timezone_source: 'tenant',
      timezone_valid: true,
      recurring_generate_time_local_effective: '14:00',
      recurring_generate_time_source: 'tenant',
      invoice_notify_same_as_generation_effective: true,
      invoice_notify_same_as_generation_source: 'tenant',
      invoice_notify_time_local_effective: '14:00',
      invoice_notify_time_source: 'derived_from_generation',
      recurring_invoice_generate_days_before_due_effective: 0,
      recurring_invoice_generate_days_before_due_source: 'fallback_default',
      ...overrides,
    } as ReturnType<typeof resolveTenantBillingPreferences>);
  }

  it('same_as_generation após H → imediato (null)', async () => {
    mockResolved();
    const now = new Date('2026-07-25T14:05:00-03:00');
    const r = await resolveInvoiceTransactionalDispatchSchedule({
      tenantId: 't1',
      eventKey: 'invoice.created',
      eventOccurredAt: now,
      now,
    });
    expect(r.dispatchNotBefore).toBeNull();
    expect(r.scheduleSource).toBe('immediate_same_as_generation');
    expect(r.generate_time_local_effective).toBe('14:00');
    expect(r.local_hhmm).toBe('14:05');
  });

  it('same_as_generation antes de H → defere até H (defesa / manual cedo)', async () => {
    mockResolved();
    const now = new Date('2026-07-25T00:01:00-03:00');
    const r = await resolveInvoiceTransactionalDispatchSchedule({
      tenantId: 't1',
      eventKey: 'invoice.created',
      eventOccurredAt: now,
      now,
    });
    expect(r.dispatchNotBefore).not.toBeNull();
    expect(r.scheduleSource).toBe('deferred_same_as_generation');
    expect(localWallAt(r.dispatchNotBefore!, tz)).toEqual({ ymd: '2026-07-25', hhmm: '14:00' });
  });

  it('notify separado depois de H de geração → defere até notify', async () => {
    mockResolved({
      invoice_notify_same_as_generation_effective: false,
      invoice_notify_time_local_effective: '18:00',
      invoice_notify_time_source: 'tenant',
    });
    const now = new Date('2026-07-25T14:05:00-03:00');
    const r = await resolveInvoiceTransactionalDispatchSchedule({
      tenantId: 't1',
      eventKey: 'invoice.created',
      eventOccurredAt: now,
      now,
    });
    expect(r.scheduleSource).toBe('deferred_notify_time');
    expect(localWallAt(r.dispatchNotBefore!, tz)).toEqual({ ymd: '2026-07-25', hhmm: '18:00' });
  });

  it('notify separado já passado no dia → imediato', async () => {
    mockResolved({
      invoice_notify_same_as_generation_effective: false,
      invoice_notify_time_local_effective: '09:00',
      invoice_notify_time_source: 'tenant',
    });
    const now = new Date('2026-07-25T14:05:00-03:00');
    const r = await resolveInvoiceTransactionalDispatchSchedule({
      tenantId: 't1',
      eventKey: 'invoice.created',
      eventOccurredAt: now,
      now,
    });
    expect(r.dispatchNotBefore).toBeNull();
    expect(r.scheduleSource).toBe('immediate_notify_time_past');
  });

  it('evento não agendável → not_applicable', async () => {
    mockResolved();
    const r = await resolveInvoiceTransactionalDispatchSchedule({
      tenantId: 't1',
      eventKey: 'proposal.sent',
      eventOccurredAt: new Date(),
    });
    expect(r.scheduleSource).toBe('not_applicable');
    expect(r.dispatchNotBefore).toBeNull();
    expect(getTenantBillingPreferences).not.toHaveBeenCalled();
  });
});
