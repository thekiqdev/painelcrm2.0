import { describe, expect, it } from 'vitest';
import {
  deriveCheckoutContractPricingFromBilling,
  isSaasContractActivationBillingReason,
  shouldPersistContractSnapshotMode,
} from './billingSubscriptionService.js';

describe('shouldPersistContractSnapshotMode', () => {
  it('checkout_initial: permite plan_purchase e bloqueia seat_addon / plan_renewal', () => {
    expect(shouldPersistContractSnapshotMode('plan_purchase', 'checkout_initial')).toBe(true);
    expect(shouldPersistContractSnapshotMode(undefined, 'checkout_initial')).toBe(true);
    expect(shouldPersistContractSnapshotMode('seat_addon', 'checkout_initial')).toBe(false);
    expect(shouldPersistContractSnapshotMode('plan_renewal', 'checkout_initial')).toBe(false);
  });

  it('explicit: permite plan_purchase (CS S1 recontratação), upgrade, manual_charge, seat_addon; bloqueia plan_renewal', () => {
    expect(shouldPersistContractSnapshotMode('plan_purchase', 'explicit')).toBe(true);
    expect(shouldPersistContractSnapshotMode('plan_upgrade', 'explicit')).toBe(true);
    expect(shouldPersistContractSnapshotMode('manual_charge', 'explicit')).toBe(true);
    expect(shouldPersistContractSnapshotMode('seat_addon', 'explicit')).toBe(true);
    expect(shouldPersistContractSnapshotMode('plan_renewal', 'explicit')).toBe(false);
  });
});

describe('isSaasContractActivationBillingReason (CS S1)', () => {
  it('aceita plan_purchase, plan_upgrade, manual_charge', () => {
    expect(isSaasContractActivationBillingReason('plan_purchase')).toBe(true);
    expect(isSaasContractActivationBillingReason(undefined)).toBe(true);
    expect(isSaasContractActivationBillingReason('plan_upgrade')).toBe(true);
    expect(isSaasContractActivationBillingReason('manual_charge')).toBe(true);
  });

  it('rejeita renovação e add-ons', () => {
    expect(isSaasContractActivationBillingReason('plan_renewal')).toBe(false);
    expect(isSaasContractActivationBillingReason('seat_addon')).toBe(false);
    expect(isSaasContractActivationBillingReason('instance_addon')).toBe(false);
  });
});

describe('deriveCheckoutContractPricingFromBilling (checkout snapshot)', () => {
  it('standard: usa total da fatura; ignora users_count e catálogo', () => {
    expect(
      deriveCheckoutContractPricingFromBilling({
        planType: 'standard',
        billingAmountCents: 4990,
        billingUsersCount: 10,
        catalogPricePerUserCents: 999,
      })
    ).toEqual({
      contracted_plan_price_cents: 4990,
      contracted_price_per_user_cents: null,
    });
  });

  it('custom: total do ciclo e unitário = round(total/users)', () => {
    expect(
      deriveCheckoutContractPricingFromBilling({
        planType: 'custom',
        billingAmountCents: 10000,
        billingUsersCount: 4,
        catalogPricePerUserCents: null,
      })
    ).toEqual({
      contracted_plan_price_cents: 10000,
      contracted_price_per_user_cents: 2500,
    });
  });

  it('custom: sem users na fatura usa price_per_user_cents do catálogo', () => {
    expect(
      deriveCheckoutContractPricingFromBilling({
        planType: 'custom',
        billingAmountCents: 9000,
        billingUsersCount: null,
        catalogPricePerUserCents: 3000,
      })
    ).toEqual({
      contracted_plan_price_cents: 9000,
      contracted_price_per_user_cents: 3000,
    });
  });

  it('custom: users_count 0 trata como ausente e usa catálogo', () => {
    expect(
      deriveCheckoutContractPricingFromBilling({
        planType: 'custom',
        billingAmountCents: 4500,
        billingUsersCount: 0,
        catalogPricePerUserCents: 1500,
      })
    ).toEqual({
      contracted_plan_price_cents: 4500,
      contracted_price_per_user_cents: 1500,
    });
  });

  it('CS S1: recontratação standard usa amount pago (500_00) como flat contratado', () => {
    expect(
      deriveCheckoutContractPricingFromBilling({
        planType: 'standard',
        billingAmountCents: 50000,
        billingUsersCount: 1,
        catalogPricePerUserCents: null,
      })
    ).toEqual({
      contracted_plan_price_cents: 50000,
      contracted_price_per_user_cents: null,
    });
  });
});
