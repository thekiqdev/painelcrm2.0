import { describe, it, expect } from 'vitest';
import { tryResolveSaasRenewalAmountFromContractSnapshot } from './billingService.js';

describe('tryResolveSaasRenewalAmountFromContractSnapshot', () => {
  it('cenário 1 — standard: snapshot 4990 ignora lista 6990 conceitualmente', () => {
    const r = tryResolveSaasRenewalAmountFromContractSnapshot(
      'standard',
      1,
      4990,
      undefined
    );
    expect(r).not.toBeNull();
    expect(r!.amountCents).toBe(4990);
    expect(r!.planPriceSnapshotForInvoice).toBe(4990);
  });

  it('cenário 2 — custom: unitário snapshot 4990 × 3 assentos = 14970', () => {
    const r = tryResolveSaasRenewalAmountFromContractSnapshot('custom', 3, 99999, 4990);
    expect(r).not.toBeNull();
    expect(r!.amountCents).toBe(14970);
    expect(r!.planPriceSnapshotForInvoice).toBe(14970);
  });

  it('cenário 3 — sem snapshot numérico → null (fallback catálogo no chamador)', () => {
    expect(
      tryResolveSaasRenewalAmountFromContractSnapshot('standard', 1, undefined, undefined)
    ).toBeNull();
    expect(
      tryResolveSaasRenewalAmountFromContractSnapshot('custom', 3, undefined, undefined)
    ).toBeNull();
  });

  it('custom: só contracted_plan_price_cents usa total fixo (fallback seguro)', () => {
    const r = tryResolveSaasRenewalAmountFromContractSnapshot('custom', 5, 9000, undefined);
    expect(r).not.toBeNull();
    expect(r!.amountCents).toBe(9000);
    expect(r!.planPriceSnapshotForInvoice).toBe(9000);
  });

  it('standard: valores negativos ignorados como snapshot inválido', () => {
    expect(
      tryResolveSaasRenewalAmountFromContractSnapshot('standard', 1, -1, null)
    ).toBeNull();
  });
});
