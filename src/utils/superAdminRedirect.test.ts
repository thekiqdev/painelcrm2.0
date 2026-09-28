import { describe, expect, it } from 'vitest';
import {
  getPostAuthHomePath,
  isPartnerChannelUser,
  isSuperAdminPlatformUser,
} from './superAdminRedirect';

describe('superAdminRedirect', () => {
  it('isSuperAdminPlatformUser exige superadmin sem tenant', () => {
    expect(isSuperAdminPlatformUser({ is_super_admin: true, tenant_id: null })).toBe(true);
    expect(isSuperAdminPlatformUser({ is_super_admin: true, tenant_id: 't1' })).toBe(false);
    expect(isSuperAdminPlatformUser({ is_super_admin: false })).toBe(false);
  });

  it('isPartnerChannelUser reconhece account_type e membership', () => {
    expect(isPartnerChannelUser({ account_type: 'partner' })).toBe(true);
    expect(isPartnerChannelUser({ partner_membership_role: 'partner_admin' })).toBe(true);
    expect(isPartnerChannelUser({ partner_membership_role: 'partner_seller' })).toBe(true);
    expect(isPartnerChannelUser({ account_type: 'customer_tenant' })).toBe(false);
    expect(isPartnerChannelUser({})).toBe(false);
  });

  it('getPostAuthHomePath manda Partner para /partner sem onboarding', () => {
    expect(
      getPostAuthHomePath({
        tenant_id: 'p1',
        account_type: 'partner',
        onboarding_completed: false,
        registration_complete: true,
      })
    ).toBe('/partner');
    expect(
      getPostAuthHomePath({
        tenant_id: 'p1',
        partner_membership_role: 'partner_seller',
        onboarding_completed: false,
        registration_complete: true,
      })
    ).toBe('/partner');
  });

  it('getPostAuthHomePath ainda manda cliente incompleto para onboarding', () => {
    expect(
      getPostAuthHomePath({
        tenant_id: 'c1',
        account_type: 'customer_tenant',
        onboarding_completed: false,
        registration_complete: true,
      })
    ).toBe('/onboarding/acquisition');
  });
});
