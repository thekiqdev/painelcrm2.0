import { describe, expect, it } from 'vitest';
import { computeWhatsAppInstanceRenewalExtrasCents } from './billingService.js';

describe('computeWhatsAppInstanceRenewalExtrasCents', () => {
  it('cobra só o excedente ao incluso no plano', () => {
    expect(
      computeWhatsAppInstanceRenewalExtrasCents({
        planIncludedInstances: 1,
        contractedInstances: 3,
        pricePerInstanceCents: 2000,
      })
    ).toEqual({ extrasCount: 2, extrasCents: 4000 });
  });

  it('plano ilimitado → zero', () => {
    expect(
      computeWhatsAppInstanceRenewalExtrasCents({
        planIncludedInstances: null,
        contractedInstances: 10,
        pricePerInstanceCents: 2000,
      })
    ).toEqual({ extrasCount: 0, extrasCents: 0 });
  });

  it('sem preço → zero', () => {
    expect(
      computeWhatsAppInstanceRenewalExtrasCents({
        planIncludedInstances: 1,
        contractedInstances: 5,
        pricePerInstanceCents: null,
      })
    ).toEqual({ extrasCount: 0, extrasCents: 0 });
  });

  it('sem extras contratados → zero', () => {
    expect(
      computeWhatsAppInstanceRenewalExtrasCents({
        planIncludedInstances: 2,
        contractedInstances: 2,
        pricePerInstanceCents: 1500,
      })
    ).toEqual({ extrasCount: 0, extrasCents: 0 });
  });
});
