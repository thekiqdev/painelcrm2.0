import { describe, expect, it } from 'vitest';
import {
  countBusinessDaysUntil,
  isWithinPixAutomaticInstructionWindow,
  mapBillingIntervalToPixFrequency,
  toPublicPixAutomaticStatus,
} from './billingPixAutomaticStore.js';

describe('billingPixAutomaticStore (Sprint 10)', () => {
  it('toPublicPixAutomaticStatus só expoe QR em pending', () => {
    const pending = toPublicPixAutomaticStatus({
      subscription_id: 's1',
      tenant_id: 't1',
      authorization_id: 'aut_1',
      status: 'pending',
      gateway: 'asaas',
      authorized_at: null,
      cancelled_at: null,
      contract_id: 'c1',
      qr_payload: 'pix-payload-secret',
      qr_image: 'data:image/png;base64,xxx',
      conciliation_id: 'conc1',
    });
    expect(pending?.has_active).toBe(false);
    expect(pending?.qr_payload).toBe('pix-payload-secret');

    const active = toPublicPixAutomaticStatus({
      subscription_id: 's1',
      tenant_id: 't1',
      authorization_id: 'aut_1',
      status: 'active',
      gateway: 'asaas',
      authorized_at: '2026-07-27',
      cancelled_at: null,
      contract_id: 'c1',
      qr_payload: 'should-not-leak',
      qr_image: 'should-not-leak',
      conciliation_id: 'conc1',
    });
    expect(active?.has_active).toBe(true);
    expect(active?.qr_payload).toBeNull();
    expect(active?.qr_image).toBeNull();
  });

  it('mapBillingIntervalToPixFrequency', () => {
    expect(mapBillingIntervalToPixFrequency('monthly')).toBe('MONTHLY');
    expect(mapBillingIntervalToPixFrequency('yearly')).toBe('ANNUALLY');
    expect(mapBillingIntervalToPixFrequency('quarterly')).toBe('QUARTERLY');
  });

  it('janela 2–10 dias úteis', () => {
    // Monday 2026-07-27 → due Friday 2026-07-31 = 4 business days
    expect(countBusinessDaysUntil('2026-07-31', '2026-07-27')).toBe(4);
    expect(isWithinPixAutomaticInstructionWindow('2026-07-31', '2026-07-27')).toBe(true);
    // Same day = 0
    expect(isWithinPixAutomaticInstructionWindow('2026-07-27', '2026-07-27')).toBe(false);
    // Far: Mon → +15 weekdays roughly outside
    expect(isWithinPixAutomaticInstructionWindow('2026-08-20', '2026-07-27')).toBe(false);
  });
});
