/**
 * Testes de permissão — Fase 5.1.
 * Valida que o engine retorna allow/deny conforme can_*, edit_own_only e delete_own_only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkPermission, check } from './permissionEngine.js';
import type { ModulePermissionRow, ModulePermissionsMap } from './permissionTypes.js';

const USER_A = 'user-a-uuid';
const USER_B = 'user-b-uuid';

function makeRow(overrides: Partial<ModulePermissionRow> = {}): ModulePermissionRow {
  return {
    module: 'clients',
    can_view: true,
    can_create: false,
    can_edit: false,
    can_delete: false,
    edit_own_only: false,
    delete_own_only: false,
    ...overrides,
  };
}

vi.mock('./modulePermissionResolver.js', () => ({
  resolveModulePermissions: vi.fn(),
}));

vi.mock('./permissionRulesEngine.js', () => ({
  evaluateRules: vi.fn().mockResolvedValue(null),
}));

const { resolveModulePermissions } = await import('./modulePermissionResolver.js');

describe('permissionEngine', () => {
  beforeEach(() => {
    vi.mocked(resolveModulePermissions).mockReset();
  });

  describe('checkPermission — RBAC (can_*)', () => {
    it('retorna false quando o módulo não está no mapa', async () => {
      vi.mocked(resolveModulePermissions).mockResolvedValue({} as ModulePermissionsMap);
      const result = await checkPermission(
        { userId: USER_A, module: 'clients', action: 'create' }
      );
      expect(result).toBe(false);
    });

    it('retorna false quando can_create é false', async () => {
      const map: ModulePermissionsMap = {
        clients: makeRow({ can_create: false }),
      };
      vi.mocked(resolveModulePermissions).mockResolvedValue(map);
      const result = await checkPermission(
        { userId: USER_A, module: 'clients', action: 'create' }
      );
      expect(result).toBe(false);
    });

    it('retorna true quando can_create é true', async () => {
      const map: ModulePermissionsMap = {
        clients: makeRow({ can_create: true }),
      };
      vi.mocked(resolveModulePermissions).mockResolvedValue(map);
      const result = await checkPermission(
        { userId: USER_A, module: 'clients', action: 'create' }
      );
      expect(result).toBe(true);
    });

    it('retorna false quando can_view é false', async () => {
      const map: ModulePermissionsMap = {
        clients: makeRow({ can_view: false }),
      };
      vi.mocked(resolveModulePermissions).mockResolvedValue(map);
      const result = await checkPermission(
        { userId: USER_A, module: 'clients', action: 'view' }
      );
      expect(result).toBe(false);
    });

    it('retorna true quando can_view é true', async () => {
      const map: ModulePermissionsMap = {
        clients: makeRow({ can_view: true }),
      };
      vi.mocked(resolveModulePermissions).mockResolvedValue(map);
      const result = await checkPermission(
        { userId: USER_A, module: 'clients', action: 'view' }
      );
      expect(result).toBe(true);
    });
  });

  describe('checkPermission — edit_own_only', () => {
    it('permite editar quando can_edit true e edit_own_only false', async () => {
      const map: ModulePermissionsMap = {
        clients: makeRow({ can_edit: true, edit_own_only: false }),
      };
      vi.mocked(resolveModulePermissions).mockResolvedValue(map);
      const result = await checkPermission(
        { userId: USER_A, module: 'clients', action: 'edit' }
      );
      expect(result).toBe(true);
    });

    it('permite editar quando edit_own_only true e userId é owner', async () => {
      const map: ModulePermissionsMap = {
        clients: makeRow({ can_edit: true, edit_own_only: true }),
      };
      vi.mocked(resolveModulePermissions).mockResolvedValue(map);
      const result = await checkPermission(
        {
          userId: USER_A,
          module: 'clients',
          action: 'edit',
          resource: { ownerId: USER_A, assigneeId: null },
        }
      );
      expect(result).toBe(true);
    });

    it('permite editar quando edit_own_only true e userId é assignee', async () => {
      const map: ModulePermissionsMap = {
        clients: makeRow({ can_edit: true, edit_own_only: true }),
      };
      vi.mocked(resolveModulePermissions).mockResolvedValue(map);
      const result = await checkPermission(
        {
          userId: USER_A,
          module: 'clients',
          action: 'edit',
          resource: { ownerId: USER_B, assigneeId: USER_A },
        }
      );
      expect(result).toBe(true);
    });

    it('nega editar quando edit_own_only true e userId não é owner nem assignee', async () => {
      const map: ModulePermissionsMap = {
        clients: makeRow({ can_edit: true, edit_own_only: true }),
      };
      vi.mocked(resolveModulePermissions).mockResolvedValue(map);
      const result = await checkPermission(
        {
          userId: USER_A,
          module: 'clients',
          action: 'edit',
          resource: { ownerId: USER_B, assigneeId: null },
        }
      );
      expect(result).toBe(false);
    });
  });

  describe('checkPermission — delete_own_only', () => {
    it('permite excluir quando can_delete true e delete_own_only false', async () => {
      const map: ModulePermissionsMap = {
        clients: makeRow({ can_delete: true, delete_own_only: false }),
      };
      vi.mocked(resolveModulePermissions).mockResolvedValue(map);
      const result = await checkPermission(
        { userId: USER_A, module: 'clients', action: 'delete' }
      );
      expect(result).toBe(true);
    });

    it('permite excluir quando delete_own_only true e userId é owner', async () => {
      const map: ModulePermissionsMap = {
        clients: makeRow({ can_delete: true, delete_own_only: true }),
      };
      vi.mocked(resolveModulePermissions).mockResolvedValue(map);
      const result = await checkPermission(
        {
          userId: USER_A,
          module: 'clients',
          action: 'delete',
          resource: { ownerId: USER_A, assigneeId: null },
        }
      );
      expect(result).toBe(true);
    });

    it('nega excluir quando delete_own_only true e userId não é owner nem assignee', async () => {
      const map: ModulePermissionsMap = {
        clients: makeRow({ can_delete: true, delete_own_only: true }),
      };
      vi.mocked(resolveModulePermissions).mockResolvedValue(map);
      const result = await checkPermission(
        {
          userId: USER_A,
          module: 'clients',
          action: 'delete',
          resource: { ownerId: USER_B, assigneeId: null },
        }
      );
      expect(result).toBe(false);
    });

    it('permite excluir quando delete_own_only true e userId é assignee', async () => {
      const map: ModulePermissionsMap = {
        tasks: makeRow({ can_delete: true, delete_own_only: true }),
      };
      vi.mocked(resolveModulePermissions).mockResolvedValue(map);
      const result = await checkPermission(
        {
          userId: USER_A,
          module: 'tasks',
          action: 'delete',
          resource: { ownerId: USER_B, assigneeId: USER_A },
        }
      );
      expect(result).toBe(true);
    });
  });

  describe('check (assinatura legada)', () => {
    it('delega para checkPermission e retorna true quando permitido', async () => {
      const map: ModulePermissionsMap = {
        clients: makeRow({ can_create: true }),
      };
      vi.mocked(resolveModulePermissions).mockResolvedValue(map);
      const result = await check(USER_A, 'clients', 'create');
      expect(result).toBe(true);
    });

    it('delega para checkPermission e retorna false quando negado', async () => {
      vi.mocked(resolveModulePermissions).mockResolvedValue({} as ModulePermissionsMap);
      const result = await check(USER_A, 'clients', 'create');
      expect(result).toBe(false);
    });
  });
});
