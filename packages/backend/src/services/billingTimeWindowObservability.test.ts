import { describe, it, expect } from 'vitest';
import { buildBillingWindowDiagnostic } from './billingTimeWindowObservability.js';

describe('buildBillingWindowDiagnostic — geração antecipada', () => {
  const tz = 'America/Sao_Paulo';

  it('N=0: só elegível a partir do dia do vencimento e horário', () => {
    const d = buildBillingWindowDiagnostic({
      tenantTimezoneRaw: tz,
      recurringGenerateTimeLocalRaw: '09:00',
      invoiceNotifySameAsGenerationRaw: true,
      nextBillingDate: '2026-05-25',
      recurringInvoiceGenerateDaysBeforeDue: 0,
      now: new Date('2026-05-25T11:00:00-03:00'),
    });
    expect(d.generation_date_ymd).toBe('2026-05-25');
    expect(d.would_be_eligible_by_window).toBe(true);
    expect(d.reason).toBe('eligible_by_window');
  });

  it('N=0: no dia de geração, antes de H → too_early', () => {
    const d = buildBillingWindowDiagnostic({
      tenantTimezoneRaw: tz,
      recurringGenerateTimeLocalRaw: '09:00',
      invoiceNotifySameAsGenerationRaw: true,
      nextBillingDate: '2026-05-25',
      recurringInvoiceGenerateDaysBeforeDue: 0,
      now: new Date('2026-05-25T08:59:00-03:00'),
    });
    expect(d.would_be_eligible_by_window).toBe(false);
    expect(d.reason).toBe('too_early_local_time');
  });

  it('N=0: no dia de geração, exatamente H → elegível', () => {
    const d = buildBillingWindowDiagnostic({
      tenantTimezoneRaw: tz,
      recurringGenerateTimeLocalRaw: '09:00',
      invoiceNotifySameAsGenerationRaw: true,
      nextBillingDate: '2026-05-25',
      recurringInvoiceGenerateDaysBeforeDue: 0,
      now: new Date('2026-05-25T09:00:00-03:00'),
    });
    expect(d.would_be_eligible_by_window).toBe(true);
    expect(d.reason).toBe('eligible_by_window');
  });

  it('N=5: dia 19 local ainda futuro; dia 20 após 09:00 elegível', () => {
    const early = buildBillingWindowDiagnostic({
      tenantTimezoneRaw: tz,
      recurringGenerateTimeLocalRaw: '09:00',
      invoiceNotifySameAsGenerationRaw: true,
      nextBillingDate: '2026-05-25',
      recurringInvoiceGenerateDaysBeforeDue: 5,
      now: new Date('2026-05-19T12:00:00-03:00'),
    });
    expect(early.generation_date_ymd).toBe('2026-05-20');
    expect(early.would_be_eligible_by_window).toBe(false);
    expect(early.reason).toBe('future_local_date');

    const tooEarly = buildBillingWindowDiagnostic({
      tenantTimezoneRaw: tz,
      recurringGenerateTimeLocalRaw: '09:00',
      invoiceNotifySameAsGenerationRaw: true,
      nextBillingDate: '2026-05-25',
      recurringInvoiceGenerateDaysBeforeDue: 5,
      now: new Date('2026-05-20T08:00:00-03:00'),
    });
    expect(tooEarly.would_be_eligible_by_window).toBe(false);
    expect(tooEarly.reason).toBe('too_early_local_time');

    const ok = buildBillingWindowDiagnostic({
      tenantTimezoneRaw: tz,
      recurringGenerateTimeLocalRaw: '09:00',
      invoiceNotifySameAsGenerationRaw: true,
      nextBillingDate: '2026-05-25',
      recurringInvoiceGenerateDaysBeforeDue: 5,
      now: new Date('2026-05-20T12:00:00-03:00'),
    });
    expect(ok.would_be_eligible_by_window).toBe(true);
  });

  it('Sprint 1: catch-up D+1 às 00:01 com H=09:00 → too_early (regressão 00:01)', () => {
    const midnight = buildBillingWindowDiagnostic({
      tenantTimezoneRaw: tz,
      recurringGenerateTimeLocalRaw: '09:00',
      invoiceNotifySameAsGenerationRaw: true,
      nextBillingDate: '2026-07-25',
      recurringInvoiceGenerateDaysBeforeDue: 0,
      now: new Date('2026-07-26T00:01:00-03:00'),
    });
    expect(midnight.generation_date_ymd).toBe('2026-07-25');
    expect(midnight.local_now_ymd).toBe('2026-07-26');
    expect(midnight.would_be_eligible_by_window).toBe(false);
    expect(midnight.reason).toBe('too_early_local_time');
  });

  it('Sprint 1: catch-up D+1 após H → elegível (catch-up não morre)', () => {
    const afterH = buildBillingWindowDiagnostic({
      tenantTimezoneRaw: tz,
      recurringGenerateTimeLocalRaw: '09:00',
      invoiceNotifySameAsGenerationRaw: true,
      nextBillingDate: '2026-07-25',
      recurringInvoiceGenerateDaysBeforeDue: 0,
      now: new Date('2026-07-26T09:00:00-03:00'),
    });
    expect(afterH.would_be_eligible_by_window).toBe(true);
    expect(afterH.reason).toBe('eligible_by_window');
  });

  it('Sprint 1: N=5 — dias seguintes também respeitam H (não liberar antes de H)', () => {
    const beforeH = buildBillingWindowDiagnostic({
      tenantTimezoneRaw: tz,
      recurringGenerateTimeLocalRaw: '09:00',
      invoiceNotifySameAsGenerationRaw: true,
      nextBillingDate: '2026-05-25',
      recurringInvoiceGenerateDaysBeforeDue: 5,
      now: new Date('2026-05-22T08:00:00-03:00'),
    });
    expect(beforeH.generation_date_ymd).toBe('2026-05-20');
    expect(beforeH.would_be_eligible_by_window).toBe(false);
    expect(beforeH.reason).toBe('too_early_local_time');

    const afterH = buildBillingWindowDiagnostic({
      tenantTimezoneRaw: tz,
      recurringGenerateTimeLocalRaw: '09:00',
      invoiceNotifySameAsGenerationRaw: true,
      nextBillingDate: '2026-05-25',
      recurringInvoiceGenerateDaysBeforeDue: 5,
      now: new Date('2026-05-22T09:00:00-03:00'),
    });
    expect(afterH.would_be_eligible_by_window).toBe(true);
    expect(afterH.reason).toBe('eligible_by_window');
  });

  it('Sprint 1: timezone fallback default ainda exige H', () => {
    const d = buildBillingWindowDiagnostic({
      tenantTimezoneRaw: null,
      recurringGenerateTimeLocalRaw: '09:00',
      invoiceNotifySameAsGenerationRaw: true,
      nextBillingDate: '2026-07-25',
      recurringInvoiceGenerateDaysBeforeDue: 0,
      now: new Date('2026-07-26T00:01:00-03:00'),
    });
    expect(d.timezone_effective).toBe('America/Sao_Paulo');
    expect(d.fallback_applied).toBe(true);
    expect(d.would_be_eligible_by_window).toBe(false);
    expect(d.reason).toBe('too_early_local_time');
  });
});
