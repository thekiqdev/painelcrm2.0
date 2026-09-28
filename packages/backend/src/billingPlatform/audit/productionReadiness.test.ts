import { describe, it, expect } from 'vitest';
import { certifyBillingTimezone } from './timezone/timezoneCertification.js';
import { PRODUCTION_AUDIT_ARTIFACTS } from './types.js';

describe('Billing Platform audit — Sprint 4.2', () => {
  it('PRODUCTION_AUDIT_ARTIFACTS lista 8 artefatos', () => {
    expect(PRODUCTION_AUDIT_ARTIFACTS).toHaveLength(8);
    expect(PRODUCTION_AUDIT_ARTIFACTS).toContain('production-readiness-summary.json');
  });

  it('timezone certification passa matriz civil e boundary', async () => {
    const result = await certifyBillingTimezone();
    expect(result.module).toBe('timezone');
    expect(result.certified).toBe(true);
    expect(result.metrics.boundary_sp_today).toBe('2026-06-30');
    expect(result.metrics.boundary_utc_today).toBe('2026-07-01');
  });
});
