import { describe, it, expect } from 'vitest';
import {
  hasPermissionKey,
  resolveBillingGranularFromLegacy,
  resolveChatGranularFromLegacy,
  resolveTasksGranularFromLegacy,
} from './permissionCatalog.js';
import type { ModulePermissionsMap } from './permissionTypes.js';

describe('permissionCatalog', () => {
  it('dashboard.view_financial_cards: finance ou billing', () => {
    const map: ModulePermissionsMap = {
      finance: {
        module: 'finance',
        can_view: true,
        can_create: false,
        can_edit: false,
        can_delete: false,
        edit_own_only: false,
        delete_own_only: false,
      },
    };
    expect(hasPermissionKey(map, 'dashboard.view_financial_cards')).toBe(true);
    expect(hasPermissionKey(map, 'billing.view')).toBe(false);
  });

  it('admin ignora negação', () => {
    const map: ModulePermissionsMap = {};
    expect(hasPermissionKey(map, 'chat.view', { isTenantAdmin: true })).toBe(true);
  });

  it('chat.send_message exige can_edit e chat_reply', () => {
    const deny: ModulePermissionsMap = {
      chat: {
        module: 'chat',
        can_view: true,
        can_edit: true,
        can_create: false,
        can_delete: false,
        edit_own_only: false,
        delete_own_only: false,
        module_extras: { chat_reply: false },
      },
    };
    expect(hasPermissionKey(deny, 'chat.send_message')).toBe(false);

    const allow: ModulePermissionsMap = {
      chat: {
        module: 'chat',
        can_view: true,
        can_edit: true,
        can_create: false,
        can_delete: false,
        edit_own_only: false,
        delete_own_only: false,
        module_extras: { chat_reply: true },
      },
    };
    expect(hasPermissionKey(allow, 'chat.send_message')).toBe(true);
  });

  it('resolveChatGranularFromLegacy: create_invoice exige billing.view', () => {
    const map: ModulePermissionsMap = {
      chat: {
        module: 'chat',
        can_view: true,
        can_edit: true,
        can_create: false,
        can_delete: false,
        edit_own_only: false,
        delete_own_only: false,
      },
      billing: {
        module: 'billing',
        can_view: false,
        can_create: false,
        can_edit: false,
        can_delete: false,
        edit_own_only: false,
        delete_own_only: false,
      },
    };
    expect(resolveChatGranularFromLegacy(map).create_invoice_from_chat).toBe(false);
  });

  it('billing.view_own é sempre false (sem dono confiável no modelo)', () => {
    const map: ModulePermissionsMap = {
      billing: {
        module: 'billing',
        can_view: true,
        can_create: false,
        can_edit: false,
        can_delete: false,
        edit_own_only: false,
        delete_own_only: false,
        module_extras: { billing_view_own_only: true },
      },
    };
    const b = resolveBillingGranularFromLegacy(map);
    expect(b.view_own).toBe(false);
    expect(b.view_all).toBe(true);
    expect(hasPermissionKey(map, 'billing.view_own')).toBe(false);
  });

  it('tasks.view_own quando tasks_view_own_only em extras', () => {
    const map: ModulePermissionsMap = {
      tasks: {
        module: 'tasks',
        can_view: true,
        can_create: true,
        can_edit: true,
        can_delete: true,
        edit_own_only: false,
        delete_own_only: false,
        module_extras: { tasks_view_own_only: true },
      },
    };
    const tk = resolveTasksGranularFromLegacy(map);
    expect(tk.view_own).toBe(true);
    expect(tk.view_all).toBe(false);
    expect(hasPermissionKey(map, 'tasks.view')).toBe(true);
    expect(hasPermissionKey(map, 'tasks.create')).toBe(true);
  });

  it('settings.manage_users exige can_edit em settings e settings_manage_users', () => {
    const deny: ModulePermissionsMap = {
      settings: {
        module: 'settings',
        can_view: true,
        can_edit: true,
        can_create: false,
        can_delete: false,
        edit_own_only: false,
        delete_own_only: false,
        module_extras: { settings_manage_users: false },
      },
    };
    expect(hasPermissionKey(deny, 'settings.manage_users')).toBe(false);

    const allow: ModulePermissionsMap = {
      settings: {
        module: 'settings',
        can_view: true,
        can_edit: true,
        can_create: false,
        can_delete: false,
        edit_own_only: false,
        delete_own_only: false,
        module_extras: { settings_manage_users: true },
      },
    };
    expect(hasPermissionKey(allow, 'settings.manage_users')).toBe(true);
  });
});
