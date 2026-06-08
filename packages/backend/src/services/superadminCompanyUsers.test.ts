import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../utils/bcrypt.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed'),
}));

vi.mock('./auditLogService.js', () => ({
  logSuperAdminAction: vi.fn().mockResolvedValue(undefined),
}));

import { pool } from '../utils/db.js';
import { hashPassword } from '../utils/bcrypt.js';
import { logSuperAdminAction } from './auditLogService.js';
import {
  getSuperadminTenantUser,
  patchSuperadminTenantUser,
  resetSuperadminTenantUserPassword,
} from './superadminCompanyUsersService.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: userId,
    tenant_id: tenantId,
    email: 'user@test.com',
    is_super_admin: false,
    whatsapp_number: '11999999999',
    chat_show_sender_name: false,
    job_title: 'Dev',
    first_name: 'João',
    last_name: 'Silva',
    full_name: 'João Silva',
    last_used_at: null,
    role: 'admin',
    ...overrides,
  };
}

describe('superadminCompanyUsersService P0-E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getSuperadminTenantUser retorna detalhe do usuário', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [userRow()], rowCount: 1 } as never);
    const u = await getSuperadminTenantUser(tenantId, userId);
    expect(u?.email).toBe('user@test.com');
    expect(u?.full_name).toBe('João Silva');
  });

  it('patchSuperadminTenantUser persiste nome e email', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes('FROM tenants WHERE')) {
        return { rows: [{ id: tenantId }], rowCount: 1 } as never;
      }
      if (s.includes('SQL_TENANT_USER_DETAIL') || (s.includes('FROM users u') && s.includes('tenant_id = $2'))) {
        if (s.includes('novo@test.com')) {
          return { rows: [userRow({ email: 'novo@test.com', full_name: 'Maria Costa' })], rowCount: 1 } as never;
        }
        return { rows: [userRow()], rowCount: 1 } as never;
      }
      if (s.includes('lower(btrim(email))')) {
        return { rows: [], rowCount: 0 } as never;
      }
      if (s.includes('FROM profiles WHERE')) {
        return { rows: [{ id: userId }], rowCount: 1 } as never;
      }
      if (s.startsWith('UPDATE users SET')) {
        return { rows: [], rowCount: 0 } as never;
      }
      if (s.startsWith('UPDATE profiles SET')) {
        return { rows: [], rowCount: 0 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });

    const result = await patchSuperadminTenantUser({
      actorUserId: actorId,
      tenantId,
      targetUserId: userId,
      body: { full_name: 'Maria Costa', email: 'novo@test.com' },
    });

    expect(result.ok).toBe(true);
    expect(logSuperAdminAction).toHaveBeenCalledWith(
      actorId,
      'user_updated_by_superadmin',
      'user',
      userId,
      expect.objectContaining({ tenant_id: tenantId }),
    );
  });

  it('resetSuperadminTenantUserPassword gera hash e invalida sessões', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: tenantId }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [userRow()], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const result = await resetSuperadminTenantUserPassword({
      actorUserId: actorId,
      tenantId,
      targetUserId: userId,
      newPassword: 'novaSenha123',
    });

    expect(result.ok).toBe(true);
    expect(hashPassword).toHaveBeenCalledWith('novaSenha123');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM sessions'),
      [userId],
    );
    expect(logSuperAdminAction).toHaveBeenCalledWith(
      actorId,
      'user_password_reset_by_superadmin',
      'user',
      userId,
      expect.any(Object),
    );
  });

  it('bloqueia edição de super admin', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: tenantId }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [userRow({ is_super_admin: true })], rowCount: 1 } as never);

    const result = await patchSuperadminTenantUser({
      actorUserId: actorId,
      tenantId,
      targetUserId: userId,
      body: { full_name: 'X' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});
