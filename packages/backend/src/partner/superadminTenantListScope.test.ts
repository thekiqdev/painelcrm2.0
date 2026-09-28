import { describe, expect, it } from 'vitest';
import {
  isAllTenantsScope,
  PLATFORM_CUSTOMER_ACCOUNT_TYPE,
  SQL_PT_IS_PLATFORM_CUSTOMER,
  SQL_SUBSCRIPTION_TENANT_IS_PLATFORM_CUSTOMER,
  SQL_T_IS_PLATFORM_CUSTOMER,
} from './superadminTenantListScope.js';

describe('superadminTenantListScope', () => {
  it('scope all aceita all/true/1', () => {
    expect(isAllTenantsScope('all')).toBe(true);
    expect(isAllTenantsScope('ALL')).toBe(true);
    expect(isAllTenantsScope('true')).toBe(true);
    expect(isAllTenantsScope('1')).toBe(true);
  });

  it('default não é all', () => {
    expect(isAllTenantsScope(undefined)).toBe(false);
    expect(isAllTenantsScope('platform')).toBe(false);
    expect(isAllTenantsScope('')).toBe(false);
  });

  it('predicado Platform está nas constantes SQL', () => {
    expect(SQL_T_IS_PLATFORM_CUSTOMER).toBe("t.account_type = 'platform_customer'");
    expect(SQL_PT_IS_PLATFORM_CUSTOMER).toBe("pt.account_type = 'platform_customer'");
    expect(SQL_SUBSCRIPTION_TENANT_IS_PLATFORM_CUSTOMER).toMatch(/pt\.account_type = 'platform_customer'/);
  });
});
