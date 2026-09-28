import { describe, expect, it } from 'vitest';
import {
  isPixAutomaticUserOptedOff,
  resolvePixAutomaticSwitchOn,
} from './pixAutomaticCheckoutUx';
import { isPixAutomaticDefaultOnBillingReason } from '@/components/billing/PixAutomaticConsentSwitch';

describe('pixAutomaticCheckoutUx', () => {
  it('default ON quando ainda não há auth e usuário não desligou', () => {
    expect(
      resolvePixAutomaticSwitchOn({
        pref: {
          available: true,
          switch_on: false,
          status: null,
          has_active: false,
        },
        userOptedOff: false,
        defaultOn: true,
      })
    ).toBe(true);
  });

  it('respeita opt-out do usuário (sessão)', () => {
    expect(
      resolvePixAutomaticSwitchOn({
        pref: {
          available: true,
          switch_on: false,
          status: null,
          has_active: false,
        },
        userOptedOff: true,
        defaultOn: true,
      })
    ).toBe(false);
  });

  it('respeita opt-out persistido (status cleared)', () => {
    expect(
      resolvePixAutomaticSwitchOn({
        pref: {
          available: true,
          switch_on: false,
          status: 'cleared',
          has_active: false,
          user_opted_off: true,
        },
        userOptedOff: false,
        defaultOn: true,
      })
    ).toBe(false);
  });

  it('respeita opt-out persistido (status cancelled)', () => {
    expect(
      resolvePixAutomaticSwitchOn({
        pref: {
          available: true,
          switch_on: false,
          status: 'cancelled',
          has_active: false,
        },
        defaultOn: true,
      })
    ).toBe(false);
  });

  it('ON quando pending mesmo com defaultOn false', () => {
    expect(
      resolvePixAutomaticSwitchOn({
        pref: {
          available: true,
          switch_on: true,
          status: 'pending',
          has_active: false,
        },
        defaultOn: false,
      })
    ).toBe(true);
  });

  it('ON quando requested (CRM8 intenção)', () => {
    expect(
      resolvePixAutomaticSwitchOn({
        pref: {
          available: true,
          switch_on: true,
          status: 'requested',
          has_active: false,
        },
        defaultOn: false,
      })
    ).toBe(true);
  });

  it('isPixAutomaticUserOptedOff cobre terminais', () => {
    expect(isPixAutomaticUserOptedOff('cleared')).toBe(true);
    expect(isPixAutomaticUserOptedOff('cancelled')).toBe(true);
    expect(isPixAutomaticUserOptedOff('pending')).toBe(false);
    expect(isPixAutomaticUserOptedOff(null)).toBe(false);
  });

  it('isPixAutomaticDefaultOnBillingReason só plano', () => {
    expect(isPixAutomaticDefaultOnBillingReason('plan_purchase')).toBe(true);
    expect(isPixAutomaticDefaultOnBillingReason('plan_renewal')).toBe(true);
    expect(isPixAutomaticDefaultOnBillingReason('seat_addon')).toBe(false);
  });
});
