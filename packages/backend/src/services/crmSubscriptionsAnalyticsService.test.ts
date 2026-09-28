import { describe, it, expect } from 'vitest';
import { monthKeysBetween, resolveCrmSubscriptionsAnalyticsRange } from './crmSubscriptionsAnalyticsService.js';

describe('monthKeysBetween', () => {
  it('inclui meses inclusivos no intervalo', () => {
    expect(monthKeysBetween('2026-01-15', '2026-03-20')).toEqual(['2026-01', '2026-02', '2026-03']);
  });
});

describe('resolveCrmSubscriptionsAnalyticsRange', () => {
  it('current_month retorna preset', () => {
    const r = resolveCrmSubscriptionsAnalyticsRange({ preset: 'current_month' });
    expect(r.preset).toBe('current_month');
    expect(r.from.slice(0, 7)).toBe(r.to.slice(0, 7));
  });

  it('current_quarter retorna trimestre civil', () => {
    const r = resolveCrmSubscriptionsAnalyticsRange({ preset: 'current_quarter' });
    expect(r.preset).toBe('current_quarter');
    expect(r.from.endsWith('-01')).toBe(true);
  });

  it('current_week retorna últimos 7 dias corridos', () => {
    const r = resolveCrmSubscriptionsAnalyticsRange({ preset: 'current_week' });
    expect(r.preset).toBe('current_week');
    expect(r.from <= r.to).toBe(true);
    const fromMs = Date.parse(`${r.from}T12:00:00Z`);
    const toMs = Date.parse(`${r.to}T12:00:00Z`);
    const diffDays = Math.round((toMs - fromMs) / 86400000);
    expect(diffDays).toBe(6);
  });
});
