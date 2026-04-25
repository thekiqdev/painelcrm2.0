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

  it('N=5: após primeiro dia de geração, qualquer horário no mesmo fuso', () => {
    const mid = buildBillingWindowDiagnostic({
      tenantTimezoneRaw: tz,
      recurringGenerateTimeLocalRaw: '09:00',
      invoiceNotifySameAsGenerationRaw: true,
      nextBillingDate: '2026-05-25',
      recurringInvoiceGenerateDaysBeforeDue: 5,
      now: new Date('2026-05-22T08:00:00-03:00'),
    });
    expect(mid.would_be_eligible_by_window).toBe(true);
  });
});
