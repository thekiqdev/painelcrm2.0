import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { connect: vi.fn() },
  dbRequestStorage: { run: (_store: unknown, fn: () => unknown) => fn() },
  escapeSetLocalAppValue: (value: string) => value.replace(/'/g, "''"),
}));

vi.mock('./apiKeyService.js', () => ({
  resolveApiKey: vi.fn(),
}));

import { pool } from '../utils/db.js';
import { resolveApiKey } from './apiKeyService.js';
import { withApiKeyTransaction } from './apiKeyRequestContext.js';

const connect = vi.mocked(pool.connect);
const resolve = vi.mocked(resolveApiKey);

describe('withApiKeyTransaction', () => {
  const query = vi.fn(async () => ({ rows: [] }));
  const release = vi.fn();

  beforeEach(() => {
    query.mockClear();
    release.mockClear();
    resolve.mockReset();
    connect.mockResolvedValue({ query, release } as never);
  });

  it('faz bypass para achar a chave e depois fixa o tenant', async () => {
    resolve.mockResolvedValue({
      id: 'k1',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      owner_user_id: 'user-1',
      scopes: ['leads.create'],
    });
    const work = vi.fn(async () => 'ok');
    const result = await withApiKeyTransaction('pcrm_secret', work);
    const sql = query.mock.calls.map((call) => String(call[0]));
    expect(sql[0]).toBe('BEGIN');
    expect(sql.some((line) => line.includes("app.bypass_rls', '1'"))).toBe(true);
    expect(sql.some((line) => line.includes('app.current_tenant_id'))).toBe(true);
    expect(sql.at(-1)).toBe('COMMIT');
    expect(work).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, value: 'ok' });
    expect(release).toHaveBeenCalledOnce();
  });

  it('chave revogada ou desconhecida não executa o trabalho', async () => {
    resolve.mockResolvedValue(null);
    const work = vi.fn();
    const result = await withApiKeyTransaction('pcrm_secret', work);
    expect(result).toEqual({ ok: false });
    expect(work).not.toHaveBeenCalled();
    expect(query.mock.calls.map((call) => String(call[0])).at(-1)).toBe('COMMIT');
  });

  it('erro no trabalho faz rollback', async () => {
    resolve.mockResolvedValue({
      id: 'k1',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      owner_user_id: 'user-1',
      scopes: ['leads.create'],
    });
    await expect(
      withApiKeyTransaction('pcrm_secret', async () => {
        throw new Error('falhou');
      })
    ).rejects.toThrow('falhou');
    expect(query.mock.calls.map((call) => String(call[0])).includes('ROLLBACK')).toBe(true);
    expect(release).toHaveBeenCalledOnce();
  });
});
