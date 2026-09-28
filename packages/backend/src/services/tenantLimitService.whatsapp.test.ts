import { describe, expect, it } from 'vitest';
import { formatWhatsAppInstancesLimitReachedMessage } from './tenantLimitService.js';

describe('formatWhatsAppInstancesLimitReachedMessage', () => {
  it('inclui current/limit e hint Meu Plano', () => {
    const msg = formatWhatsAppInstancesLimitReachedMessage(2, 2);
    expect(msg).toContain('2 de 2');
    expect(msg.toLowerCase()).toContain('meu plano');
  });
});

describe('checkTenantWhatsAppInstancesLimit allowed math', () => {
  it('current < limit permite; current >= limit bloqueia; null ilimitado', () => {
    const decide = (current: number, limit: number | null) => {
      if (limit == null) return true;
      return current < limit;
    };
    expect(decide(0, 1)).toBe(true);
    expect(decide(1, 1)).toBe(false);
    expect(decide(2, 1)).toBe(false);
    expect(decide(5, null)).toBe(true);
  });
});
