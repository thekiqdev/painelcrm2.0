import { describe, it, expect } from 'vitest';
import {
  buildBillingAggregate,
  buildBillingAggregateFromDetail,
  createBillingContext,
  validateBillingContext,
  billingAggregateSignature,
  billingContextSourceSignature,
  snapshotBillingContextSource,
  BILLING_AGGREGATE_PIPELINE_STAGE_NAMES,
} from '@/lib/billingAggregate';
import { buildGoldenDetail } from '../golden-dataset';

describe('BillingAggregateFactory', () => {
  it('constrói Aggregate válido a partir do Golden Dataset', () => {
    const detail = buildGoldenDetail();
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');

    expect(aggregate.subscriptionId).toBe('sub-golden');
    expect(aggregate.todayYmd).toBe('2026-06-30');
    expect(aggregate.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(aggregate.sourceSignature).toBe(billingContextSourceSignature(detail));
  });

  it('BillingContext aceita payload do Golden Dataset', () => {
    const detail = buildGoldenDetail();
    const context = createBillingContext(detail, '2026-06-30');
    expect(validateBillingContext(context)).toEqual({ ok: true });
  });

  it('Aggregate mantém assinatura estável para mesmo input', () => {
    const detail = buildGoldenDetail();
    const a = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const b = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(billingAggregateSignature(a)).toBe(billingAggregateSignature(b));
  });

  it('views permanecem vazias; subscription e cycles populados (5.0-12/5.0-13)', () => {
    const detail = buildGoldenDetail();
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');

    expect(aggregate.subscription.id).toBe(detail.subscription.id);
    expect(aggregate.subscription.amount).toBe(detail.subscription.amount_cents);
    expect(aggregate.cycles).toHaveLength(detail.cycles_raw.length);
    expect(aggregate.cycles[0]?.id).toBe(detail.cycles_raw[0]?.id);
    expect(aggregate.events).toHaveLength(detail.cycles_raw.length);
    expect(aggregate.history).toEqual([]);
    expect(aggregate.calendar).toEqual([]);
    expect(aggregate.timeline).toEqual([]);
    expect(aggregate.alerts).toEqual([]);
    expect(aggregate.invoices).toEqual([]);
    expect(aggregate.capabilities).toEqual({ canGenerate: false, supportsGenerate: false });
    expect(aggregate.sidebar.alertCount).toBe(0);
    expect(aggregate.nextInvoice.showGenerate).toBe(false);
    expect(aggregate.technical).toEqual({ workerStatus: null, engineVersion: null });
  });

  it('pipeline executa todas as stages registradas', () => {
    expect(BILLING_AGGREGATE_PIPELINE_STAGE_NAMES).toHaveLength(11);
    expect(BILLING_AGGREGATE_PIPELINE_STAGE_NAMES[0]).toBe('SubscriptionStage');
    expect(BILLING_AGGREGATE_PIPELINE_STAGE_NAMES[10]).toBe('TechnicalStage');
  });

  it('nenhuma stage altera o payload recebido', () => {
    const detail = buildGoldenDetail({
      timeline: [
        {
          month_ref: '2026-07',
          cycle_label: 'Jul/26',
          cycle_subtitle: '',
          cycle_date: '2026-07-14',
          period_label: 'Jul/26',
          period_start: '2026-07-07',
          period_end: '2026-08-07',
          due_date: '2026-07-14',
          status_pt: 'Prevista',
          operational_state: 'awaiting_generation',
          operational_state_pt: 'Prevista',
          amount_cents: 11_000,
          invoice_id: null,
          cycle_status: 'pending',
          cycle_id: 'c-immutable',
          job_id: null,
        },
      ],
    });
    const before = snapshotBillingContextSource(detail);
    buildBillingAggregate(createBillingContext(detail, '2026-06-30'));
    expect(snapshotBillingContextSource(detail)).toBe(before);
  });

  it('rejeita contexto inválido', () => {
    const detail = buildGoldenDetail();
    const bad = createBillingContext(
      { ...detail, subscription: { ...detail.subscription, id: '' } },
      '2026-06-30'
    );
    expect(validateBillingContext(bad)).toEqual({ ok: false, reason: 'subscription.id is required' });
    expect(() => buildBillingAggregate(bad)).toThrow(/Invalid BillingContext/);
  });
});
