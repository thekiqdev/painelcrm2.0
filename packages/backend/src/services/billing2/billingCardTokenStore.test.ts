import { describe, expect, it } from 'vitest';
import { cardTokenAuditSafe, toPublicSavedCard } from './billingCardTokenStore.js';

describe('billingCardTokenStore (Sprint 9)', () => {
  it('mascara token para audit (sem PAN)', () => {
    expect(cardTokenAuditSafe('a75a1d98-c52d-4a6b-a413-71e00b193c99')).toMatch(/…/);
    expect(cardTokenAuditSafe('a75a1d98-c52d-4a6b-a413-71e00b193c99')).not.toContain(
      'a75a1d98-c52d-4a6b-a413-71e00b193c99'
    );
    expect(cardTokenAuditSafe(null)).toBeNull();
  });

  it('toPublicSavedCard não expoe token', () => {
    const pub = toPublicSavedCard({
      subscription_id: 's1',
      tenant_id: 't1',
      card_token: 'secret-token-value',
      card_brand: 'VISA',
      card_last4: '8829',
      card_token_gateway: 'asaas',
      card_tokenized_at: '2026-07-27',
      card_token_status: 'active',
    });
    expect(pub).toEqual({ brand: 'VISA', last4: '8829', gateway: 'asaas' });
    expect(JSON.stringify(pub)).not.toContain('secret-token');
  });
});
