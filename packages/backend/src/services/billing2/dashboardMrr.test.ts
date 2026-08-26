import { describe, expect, it } from 'vitest';
import { monthlyizePeriodCents, DASHBOARD_KPI_DEFINITIONS } from './dashboardMrr.js';

describe('dashboardMrr (Sprint 6)', () => {
  it('mensaliza intervalos corretamente', () => {
    expect(monthlyizePeriodCents(12000, 'yearly')).toBe(1000);
    expect(monthlyizePeriodCents(9000, 'quarterly')).toBe(3000);
    expect(monthlyizePeriodCents(6000, 'semi_annual')).toBe(1000);
    expect(monthlyizePeriodCents(5000, 'monthly')).toBe(5000);
    expect(monthlyizePeriodCents(1200, 'weekly')).toBe(Math.floor((1200 * 52) / 12));
  });

  it('amostra de 10 assinaturas mensais bate soma esperada', () => {
    // 10 contratos de R$ 199,00 / mês → MRR = 199000 cents? 199.00 BRL = 19900 cents
    const sample = Array.from({ length: 10 }, () => ({ cents: 19900, interval: 'monthly' as const }));
    const mrr = sample.reduce((sum, s) => sum + monthlyizePeriodCents(s.cents, s.interval), 0);
    expect(mrr).toBe(199000);
  });

  it('amostra mista yearly + monthly', () => {
    const rows = [
      { cents: 120000, interval: 'yearly' }, // 10000 / mês
      { cents: 9900, interval: 'monthly' },
      { cents: 30000, interval: 'quarterly' }, // 10000
    ];
    const mrr = rows.reduce((sum, s) => sum + monthlyizePeriodCents(s.cents, s.interval), 0);
    expect(mrr).toBe(10000 + 9900 + 10000);
  });

  it('definições PRD presentes', () => {
    expect(DASHBOARD_KPI_DEFINITIONS.mrr_contracted).toMatch(/subscriptions/i);
    expect(DASHBOARD_KPI_DEFINITIONS.mrr_catalog).toMatch(/Platform|platform_customer|lista/i);
  });
});
