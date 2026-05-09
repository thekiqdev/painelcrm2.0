import { describe, it, expect } from 'vitest';
import { computeDashboardOverviewGates } from './dashboardOverviewGates.js';
import type { ModulePermissionsMap } from '../permissions/permissionTypes.js';

describe('computeDashboardOverviewGates', () => {
  it('sem admin: só módulos com can_view', () => {
    const perms: ModulePermissionsMap = {
      billing: {
        module: 'billing',
        can_view: true,
        can_create: false,
        can_edit: false,
        can_delete: false,
        edit_own_only: false,
        delete_own_only: false,
      },
    };
    const g = computeDashboardOverviewGates(perms, false);
    expect(g.canBilling).toBe(true);
    expect(g.canFinance).toBe(false);
    expect(g.canChat).toBe(false);
  });

  it('admin: todos os gates true', () => {
    const g = computeDashboardOverviewGates({}, true);
    expect(g.canBilling).toBe(true);
    expect(g.canFinance).toBe(true);
    expect(g.canChat).toBe(true);
  });
});
