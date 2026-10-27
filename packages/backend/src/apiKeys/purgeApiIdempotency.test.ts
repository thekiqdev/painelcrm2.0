import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { connect: vi.fn() },
}));

vi.mock('../observability/appLogger.js', () => ({
  appLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), boot: vi.fn() },
}));

import { pool } from '../utils/db.js';
import { purgeExpiredApiIdempotencyKeys } from './purgeApiIdempotency.js';

describe('purgeExpiredApiIdempotencyKeys', () => {
  const query = vi.fn();
  const release = vi.fn();

  beforeEach(() => {
    query.mockReset();
    release.mockReset();
    vi.mocked(pool.connect).mockResolvedValue({ query, release } as never);
    query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('DELETE FROM api_idempotency_keys')) return { rowCount: 2 };
      return { rowCount: 0 };
    });
  });

  it('apaga linhas com mais de 24 h, com bypass de RLS, e devolve o cliente', async () => {
    await expect(purgeExpiredApiIdempotencyKeys()).resolves.toBe(2);
    const sql = query.mock.calls.map((call) => String(call[0]));
    expect(sql[0]).toContain("set_config('app.bypass_rls', '1'");
    expect(sql[1]).toContain("created_at < now() - interval '24 hours'");
    expect(sql[2]).toContain("set_config('app.bypass_rls', ''");
    expect(release).toHaveBeenCalledOnce();
  });
});
