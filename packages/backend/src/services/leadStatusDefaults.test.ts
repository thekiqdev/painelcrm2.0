import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../utils/db.js';
import { DEFAULT_LEAD_STATUSES, ensureDefaultLeadStatuses } from './leadStatusDefaults.js';

const query = vi.mocked(pool.query);

describe('ensureDefaultLeadStatuses', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [], rowCount: 0 } as never);
  });

  it('grava Novo, Em contato, Qualificado e Perdido quando a conta não tem fase', async () => {
    await ensureDefaultLeadStatuses('tenant-1', 'user-1');
    const sql = String(query.mock.calls[0]?.[0]);
    const params = query.mock.calls[0]?.[1] as unknown[];
    expect(sql).toMatch(/INSERT INTO lead_statuses/i);
    expect(sql).toContain('FROM lead_statuses');
    expect(sql).toContain('NOT EXISTS');
    expect(params[0]).toBe('user-1');
    expect(params[1]).toEqual(DEFAULT_LEAD_STATUSES.map((status) => status.name));
    expect(params[2]).toEqual(['#6E56CF', '#F59E0B', '#10B981', '#EF4444']);
    expect(params[3]).toBe('tenant-1');
  });

  it('não grava sem conta ou usuário', async () => {
    await ensureDefaultLeadStatuses('', 'user-1');
    await ensureDefaultLeadStatuses('tenant-1', '');
    expect(query).not.toHaveBeenCalled();
  });
});
