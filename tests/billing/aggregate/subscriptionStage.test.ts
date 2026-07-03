import { describe, it, expect } from 'vitest';
import {
  buildBillingAggregateFromDetail,
  createBillingContext,
  mapSubscriptionSnapshot,
  snapshotBillingContextSource,
  subscriptionStage,
  createEmptyBillingAggregate,
} from '@/lib/billingAggregate';
import { buildGoldenDetail } from '../golden-dataset';

const REQUIRED_FIELDS = [
  'id',
  'tenantId',
  'customerId',
  'status',
  'subscriptionType',
  'billingInterval',
  'billingIntervalCount',
  'currency',
  'amount',
  'nextBillingDate',
  'currentPeriodStart',
  'currentPeriodEnd',
  'billingAnchorDay',
  'cancelAtPeriodEnd',
  'cancelledAt',
  'pausedAt',
  'reactivatedAt',
  'trialEndsAt',
  'createdAt',
  'updatedAt',
  'metadata',
] as const;

describe('SubscriptionStage', () => {
  it('popula aggregate.subscription a partir do Golden Dataset', () => {
    const detail = buildGoldenDetail();
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const sub = detail.subscription;

    expect(aggregate.subscription).toEqual({
      id: sub.id,
      tenantId: sub.tenant_id,
      customerId: sub.customer_id,
      status: sub.status,
      subscriptionType: sub.type,
      billingInterval: sub.billing_interval,
      billingIntervalCount: sub.billing_cycle_count,
      currency: sub.currency,
      amount: sub.amount_cents,
      nextBillingDate: sub.next_billing_date,
      currentPeriodStart: sub.current_period_start,
      currentPeriodEnd: sub.current_period_end,
      billingAnchorDay: sub.billing_anchor_day,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      cancelledAt: null,
      pausedAt: null,
      reactivatedAt: null,
      trialEndsAt: null,
      createdAt: sub.created_at,
      updatedAt: sub.updated_at,
      metadata: {
        planId: sub.plan_id,
        gateway: sub.gateway,
        gracePeriodDays: sub.grace_period_days,
        defaultPaymentMethod: sub.default_payment_method,
        usersCount: sub.users_count,
        lastJobAt: sub.last_job_at,
        createdBy: sub.created_by,
        cyclesUnlimited: sub.cycles_unlimited ?? null,
        maxCycles: sub.max_cycles ?? null,
      },
    });
  });

  it.each(REQUIRED_FIELDS)('campo obrigatório presente: %s', (field) => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.subscription).toHaveProperty(field);
    expect(aggregate.subscription[field]).toBeDefined();
  });

  it('copia timestamps opcionais quando presentes no subscription', () => {
    const detail = buildGoldenDetail({
      subscription: {
        cancelled_at: '2026-05-01T10:00:00Z',
        paused_at: '2026-04-01T10:00:00Z',
        reactivated_at: '2026-06-01T10:00:00Z',
        trial_ends_at: '2026-07-01T10:00:00Z',
      } as never,
    });
    const snap = mapSubscriptionSnapshot(detail.subscription);
    expect(snap.cancelledAt).toBe('2026-05-01T10:00:00Z');
    expect(snap.pausedAt).toBe('2026-04-01T10:00:00Z');
    expect(snap.reactivatedAt).toBe('2026-06-01T10:00:00Z');
    expect(snap.trialEndsAt).toBe('2026-07-01T10:00:00Z');
  });

  it('não altera BillingContext.source', () => {
    const detail = buildGoldenDetail();
    const context = createBillingContext(detail, '2026-06-30');
    const before = snapshotBillingContextSource(detail);
    subscriptionStage(context, createEmptyBillingAggregate(context));
    expect(snapshotBillingContextSource(detail)).toBe(before);
  });

  it('subscriptionStage isolada não popula cycles; views permanecem vazias no pipeline', () => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    const afterSub = subscriptionStage(context, createEmptyBillingAggregate(context));
    expect(afterSub.cycles).toEqual([]);

    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.history).toEqual([]);
    expect(aggregate.calendar).toEqual([]);
    expect(aggregate.events).toEqual([]);
    expect(aggregate.alerts).toEqual([]);
  });

  it('mapSubscriptionSnapshot é determinístico', () => {
    const detail = buildGoldenDetail();
    expect(mapSubscriptionSnapshot(detail.subscription)).toEqual(
      mapSubscriptionSnapshot(detail.subscription)
    );
  });
});
