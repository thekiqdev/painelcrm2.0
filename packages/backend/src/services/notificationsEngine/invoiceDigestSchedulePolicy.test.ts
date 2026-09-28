import { describe, expect, it } from 'vitest';
import {
  addCalendarDaysYmd,
  isDueSoonEligibleOnLocalDay,
  isOverdueFirstEligibleOnLocalDay,
  mergeRecipientPolicyPatch,
  overdueDigestIdempotencySuffix,
  parseInvoiceDueSoonSchedule,
  parseInvoiceOverdueSchedule,
  parseOverdueDigestSeqFromIdempotencyKey,
  resolveNextOverdueDigestSend,
  scheduleFieldsForEventKey,
} from './invoiceDigestSchedulePolicy.js';

describe('invoiceDigestSchedulePolicy', () => {
  it('defaults days_before / days_after', () => {
    expect(parseInvoiceDueSoonSchedule(null).days_before).toBe(3);
    expect(parseInvoiceOverdueSchedule({}).days_after).toBe(1);
    expect(parseInvoiceOverdueSchedule({}).repeat_enabled).toBe(false);
  });

  it('clamps days_before', () => {
    expect(parseInvoiceDueSoonSchedule({ days_before: -2 }).days_before).toBe(0);
    expect(parseInvoiceDueSoonSchedule({ days_before: 99 }).days_before).toBe(60);
  });

  it('due_soon matches exact offset day', () => {
    expect(
      isDueSoonEligibleOnLocalDay({
        dueDateYmd: '2026-08-07',
        tenantTodayYmd: '2026-08-04',
        daysBefore: 3,
      }),
    ).toBe(true);
    expect(
      isDueSoonEligibleOnLocalDay({
        dueDateYmd: '2026-08-07',
        tenantTodayYmd: '2026-08-04',
        daysBefore: 2,
      }),
    ).toBe(false);
    expect(
      isDueSoonEligibleOnLocalDay({
        dueDateYmd: '2026-08-04',
        tenantTodayYmd: '2026-08-04',
        daysBefore: 0,
      }),
    ).toBe(true);
  });

  it('overdue first eligible from due+days_after', () => {
    expect(
      isOverdueFirstEligibleOnLocalDay({
        dueDateYmd: '2026-08-01',
        tenantTodayYmd: '2026-08-02',
        daysAfter: 1,
      }),
    ).toBe(true);
    expect(
      isOverdueFirstEligibleOnLocalDay({
        dueDateYmd: '2026-08-01',
        tenantTodayYmd: '2026-08-01',
        daysAfter: 1,
      }),
    ).toBe(false);
    expect(
      isOverdueFirstEligibleOnLocalDay({
        dueDateYmd: '2026-08-01',
        tenantTodayYmd: '2026-08-01',
        daysAfter: 0,
      }),
    ).toBe(true);
  });

  it('addCalendarDaysYmd crosses month', () => {
    expect(addCalendarDaysYmd('2026-01-30', 3)).toBe('2026-02-02');
  });

  it('mergeRecipientPolicyPatch preserves and merges repeat', () => {
    const merged = mergeRecipientPolicyPatch(
      { days_before: 3, repeat_enabled: false },
      { days_after: 1, repeat_enabled: true, repeat_every_days: 5, repeat_max_extra: 2 },
    );
    expect(merged.days_before).toBe(3);
    expect(merged.days_after).toBe(1);
    expect(merged.repeat_enabled).toBe(true);
    expect(merged.repeat_every_days).toBe(5);
    expect(merged.repeat_max_extra).toBe(2);
  });

  it('scheduleFieldsForEventKey includes repeat for overdue', () => {
    expect(scheduleFieldsForEventKey('invoice.due_soon', null)).toEqual({ days_before: 3 });
    expect(scheduleFieldsForEventKey('invoice.overdue', { days_after: 2, repeat_enabled: true })).toEqual({
      days_after: 2,
      repeat_enabled: true,
      repeat_every_days: 3,
      repeat_max_extra: 2,
    });
    expect(scheduleFieldsForEventKey('invoice.created', {})).toBeNull();
  });

  it('parses idempotency seq keys', () => {
    expect(parseOverdueDigestSeqFromIdempotencyKey('invoice.overdue:abc:seq:3')).toBe(3);
    expect(parseOverdueDigestSeqFromIdempotencyKey('invoice.overdue:abc:first')).toBe(1);
    expect(parseOverdueDigestSeqFromIdempotencyKey('invoice.overdue:abc:2026-08-04')).toBe(1);
    expect(overdueDigestIdempotencySuffix(2)).toBe('seq:2');
  });

  it('resolveNextOverdueDigestSend: first then repeats', () => {
    const base = {
      schedule: {
        days_after: 1,
        repeat_enabled: true,
        repeat_every_days: 3,
        repeat_max_extra: 2,
      },
      dueDateYmd: '2026-08-01',
      tenantTodayYmd: '2026-08-02',
    };
    expect(
      resolveNextOverdueDigestSend({
        ...base,
        maxSeqAlready: 0,
        lastSendYmd: null,
      }),
    ).toEqual({ seq: 1 });

    expect(
      resolveNextOverdueDigestSend({
        ...base,
        tenantTodayYmd: '2026-08-04',
        maxSeqAlready: 1,
        lastSendYmd: '2026-08-02',
      }),
    ).toBeNull(); // ainda não passaram 3 dias

    expect(
      resolveNextOverdueDigestSend({
        ...base,
        tenantTodayYmd: '2026-08-05',
        maxSeqAlready: 1,
        lastSendYmd: '2026-08-02',
      }),
    ).toEqual({ seq: 2 });

    expect(
      resolveNextOverdueDigestSend({
        ...base,
        tenantTodayYmd: '2026-08-12',
        maxSeqAlready: 3,
        lastSendYmd: '2026-08-09',
      }),
    ).toBeNull(); // max 1+2 atingido
  });

  it('resolveNextOverdueDigestSend: sem repeat só 1.º', () => {
    expect(
      resolveNextOverdueDigestSend({
        schedule: {
          days_after: 1,
          repeat_enabled: false,
          repeat_every_days: 3,
          repeat_max_extra: 2,
        },
        dueDateYmd: '2026-08-01',
        tenantTodayYmd: '2026-08-10',
        maxSeqAlready: 1,
        lastSendYmd: '2026-08-02',
      }),
    ).toBeNull();
  });
});
