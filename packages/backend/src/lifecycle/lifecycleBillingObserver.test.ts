import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectLifecycleObservationMetrics,
  observeBillingLifecycleEvent,
  observeFutureBillingLifecycleEvent,
  resetLifecycleObservationMetrics,
} from './lifecycleBillingObserver.js';

describe('observeBillingLifecycleEvent', () => {
  afterEach(() => {
    resetLifecycleObservationMetrics();
    vi.restoreAllMocks();
  });

  it('resolves trial.started to Aquisição / Trial iniciado', () => {
    const res = observeBillingLifecycleEvent('trial.started', { tenantId: 't1' }, { source: 'test' });
    expect(res.boardName).toBe('Aquisição');
    expect(res.columnName).toBe('Trial iniciado');
    expect(res.matched).toBe(true);
    const metrics = collectLifecycleObservationMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0]?.event).toBe('trial.started');
    expect(metrics[0]?.resolvedBoard).toBe('Aquisição');
    expect(metrics[0]?.resolvedColumn).toBe('Trial iniciado');
  });

  it('resolves trial.expired to Reativação / Trial expirado', () => {
    const res = observeBillingLifecycleEvent('trial.expired', { tenantId: 't2' });
    expect(res.boardName).toBe('Reativação');
    expect(res.columnName).toBe('Trial expirado');
  });

  it('resolves subscription.activated to Expansão / Novo Cliente', () => {
    const res = observeBillingLifecycleEvent('subscription.activated', {
      tenantId: 't3',
      invoiceId: 'bill-1',
      subscriptionId: 'sub-1',
    });
    expect(res.boardName).toBe('Expansão');
    expect(res.columnName).toBe('Novo Cliente');
  });

  it('resolves subscription.cancelled to Reativação / Cancelado', () => {
    const res = observeBillingLifecycleEvent('subscription.cancelled', {
      tenantId: 't4',
      subscriptionId: 'sub-2',
    });
    expect(res.boardName).toBe('Reativação');
    expect(res.columnName).toBe('Cancelado');
  });

  it('falls back for invalid event type', () => {
    const res = observeBillingLifecycleEvent('not.valid', { tenantId: 't5' });
    expect(res.fallback).toBe(true);
    expect(res.matched).toBe(false);
    expect(res.boardName).toBe('Aquisição');
    expect(res.columnName).toBe('Novo lead');
  });

  it('records actual board when provided', () => {
    observeBillingLifecycleEvent(
      'subscription.activated',
      { tenantId: 't6' },
      { actual: { boardName: 'Aquisição', columnName: 'Trial iniciado' } },
    );
    const m = collectLifecycleObservationMetrics()[0];
    expect(m?.actualBoard).toBe('Aquisição');
    expect(m?.actualColumn).toBe('Trial iniciado');
    expect(m?.resolvedBoard).toBe('Expansão');
  });

  it('observeFutureBillingLifecycleEvent uses fallback until routes exist', () => {
    const res = observeFutureBillingLifecycleEvent('subscription.renewed', { tenantId: 't7' });
    expect(res.fallback).toBe(true);
    expect(res.matched).toBe(false);
  });
});
