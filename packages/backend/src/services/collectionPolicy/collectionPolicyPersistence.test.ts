import { describe, expect, it } from 'vitest';
import {
  assertValidCollectionPolicyShape,
  buildDefaultCollectionPolicy,
  deserializeCollectionPolicy,
} from './index.js';
import { sanitizeBillingAuditPayloadForTest } from './billingAuditEventWriter.js';

describe('billing audit sanitize (Sprint 2)', () => {
  it('redige chaves sensíveis', () => {
    const out = sanitizeBillingAuditPayloadForTest({
      amount: 100,
      api_key: 'secret',
      nested: { card_number: '4111', ok: true },
    });
    expect(out).toEqual({
      amount: 100,
      api_key: '[redacted]',
      nested: { card_number: '[redacted]', ok: true },
    });
  });
});

describe('collection policy shape (Sprint 2)', () => {
  it('rejeita suspend_after > cancel_after', () => {
    const p = buildDefaultCollectionPolicy();
    p.suspend_after_days = 40;
    p.cancel_after_days = 30;
    expect(() => assertValidCollectionPolicyShape(p)).toThrow(/suspend_after_days/);
  });

  it('seed JSON da migration deserializa para defaults', () => {
    const seeded = deserializeCollectionPolicy({
      schema_version: 1,
      renew_card_auto: false,
      generate_pix_auto: true,
      pix_automatic_enabled: false,
      max_attempts: 3,
      attempt_interval_days: 2,
      suspend_after_days: 10,
      cancel_after_days: 30,
      notify_whatsapp: true,
      notify_email: true,
      generate_pix_after_failure: true,
      reactivate_on_paid: true,
      auto_suspend_enabled: false,
      auto_cancel_enabled: false,
      grace_period_days: 3,
      actions_after_fail: ['create_pix', 'notify_whatsapp', 'notify_email'],
    });
    expect(seeded).toEqual(buildDefaultCollectionPolicy({ grace_period_days: 3 }));
  });
});
