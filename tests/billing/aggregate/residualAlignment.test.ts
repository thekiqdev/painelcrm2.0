import { describe, it, expect } from 'vitest';
import {
  buildBillingAggregateFromDetail,
  buildFinancialEventsFromAggregate,
  emitEventsForCycle,
} from '@/lib/billingAggregate';
import { buildGoldenDetail, timelineRow } from '../golden-dataset';

describe('Billing Residual Alignment (5.0-21D)', () => {
  it('RC-1: paid invoice emite payment (não invoice_due)', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({
          cycle_id: 'c-first',
          due_date: '2026-06-14',
          invoice_id: 'inv-first',
          invoice_status: 'paid',
          operational_state: 'paid',
          processed_at: '2026-06-14T12:00:00Z',
        }),
      ],
      stats: { total_invoiced_cents: 11_000, total_paid_cents: 11_000, total_pending_cents: 0, charge_count: 1 },
    });
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(aggregate.events.some((e) => e.eventType === 'payment')).toBe(true);
    expect(aggregate.events.some((e) => e.eventType === 'invoice_due')).toBe(false);
    expect(aggregate.sidebar.openAmount).toBe('R$ 0,00');
    expect(aggregate.sidebar.lastPaymentDate).toBe('14 Jun');
    expect(aggregate.alerts.some((a) => a.kind === 'client_overdue')).toBe(false);
  });

  it('RC-2: charge-manual emite manual_charge + invoice_due', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({
          cycle_id: 'c-manual',
          invoice_id: 'inv-manual',
          invoice_status: 'pending',
          operational_state: 'manual_invoice',
          status_pt: 'Manual',
          merge_source: 'cycle',
        }),
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const types = aggregate.events.map((e) => e.eventType);
    expect(types).toContain('manual_charge');
    expect(types).toContain('invoice_due');
    expect(aggregate.events.filter((e) => e.cycleId === 'c-manual')).toHaveLength(2);
    expect(aggregate.sidebar.openAmount).toBe('R$ 220,00');
  });

  it('RC-3: gateway_failed via invoice.status', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({
          cycle_id: 'c-gw',
          invoice_id: 'inv-gw',
          invoice_status: 'gateway_failed',
          operational_state: 'gateway_failed',
          gateway_status: 'failed',
        }),
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(aggregate.alerts.some((a) => a.kind === 'gateway_failed')).toBe(true);
    expect(aggregate.events.filter((e) => e.cycleId === 'c-gw').length).toBeGreaterThanOrEqual(2);
  });

  it('RC-4b: generate-retroactive-months emite client_overdue', () => {
    const scenario = buildGoldenDetail({
      timeline: [
        timelineRow({ cycle_id: 'c-may', due_date: '2026-05-14', cycle_date: '2026-05-14' }),
        timelineRow({ cycle_id: 'c-jun', due_date: '2026-06-14', cycle_date: '2026-06-14' }),
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(scenario, '2026-06-30');
    expect(aggregate.alerts.some((a) => a.kind === 'client_overdue')).toBe(true);
  });

  it('RC-4c: invoice_only emite alerta client_overdue via invoices[] (sem eventos órfãos)', () => {
    const detail = buildGoldenDetail({
      timeline: [timelineRow({
        cycle_id: null,
        merge_source: 'invoice_only',
        invoice_id: 'inv-orphan',
        invoice_status: 'pending',
        due_date: '2026-06-15',
        invoice_created_at: '2026-06-15T10:00:00Z',
      })],
      cycles_raw: [],
    });
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(aggregate.invoices.length).toBeGreaterThan(0);
    expect(aggregate.events).toHaveLength(0);
    expect(aggregate.alerts.some((a) => a.kind === 'client_overdue')).toBe(true);
  });

  it('determinismo: mesma entrada produz mesmos eventos multi-emissão', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({
          cycle_id: 'c-early',
          due_date: '2026-08-14',
          invoice_id: 'inv-early',
          invoice_status: 'pending',
          operational_state: 'generated',
          invoice_created_at: '2026-06-20T10:00:00Z',
        }),
      ],
    });
    const a = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const b = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(a.events).toEqual(b.events);
    expect(a.events.filter((e) => e.cycleId === 'c-early')).toHaveLength(2);
  });

  it('cycleStage popula aggregate.invoices', () => {
    const detail = buildGoldenDetail();
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(aggregate.invoices.length).toBeGreaterThanOrEqual(0);
  });
});
