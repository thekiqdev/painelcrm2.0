import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../utils/db.js';
import { hashApiKey } from './apiKeyCrypto.js';
import {
  ApiKeyNotFoundError,
  createApiKey,
  listApiKeys,
  resolveApiKey,
  revokeApiKey,
} from './apiKeyService.js';

const query = vi.mocked(pool.query);

describe('apiKeyService', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('create devolve o segredo uma vez e grava só o hash', async () => {
    query.mockImplementation(async (_sql: string, params?: unknown[]) => {
      const hash = String(params?.[4] ?? '');
      return {
        rows: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Site',
            key_prefix: String(params?.[3] ?? ''),
            scopes: ['leads.create'],
            created_at: new Date('2026-10-27T15:00:00.000Z'),
            last_used_at: null,
            revoked_at: null,
            stored_hash: hash,
          },
        ],
        rowCount: 1,
      };
    });

    const created = await createApiKey({
      tenantId: 'tenant-a',
      userId: 'user-a',
      name: '  Site  ',
    });

    expect(created.key.startsWith('pcrm_')).toBe(true);
    expect(created.key_prefix).toBe(created.key.slice(0, 12));
    expect(created.scopes).toEqual(['leads.create']);

    const sql = String(query.mock.calls[0]?.[0]);
    const params = query.mock.calls[0]?.[1] as unknown[];
    expect(sql).toMatch(/INSERT INTO api_keys/i);
    expect(params[0]).toBe('tenant-a');
    expect(params[1]).toBe('user-a');
    expect(params[2]).toBe('Site');
    expect(params[4]).toBe(hashApiKey(created.key));
    expect(params).not.toContain(created.key);
    expect(JSON.stringify(params)).not.toContain(created.key);
  });

  it('list não devolve segredo nem hash e filtra o tenant', async () => {
    query.mockResolvedValue({
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Site',
          key_prefix: 'pcrm_abc1234',
          key_hash: 'should-not-leak',
          key: 'pcrm_should-not-leak',
          scopes: ['leads.create'],
          created_at: '2026-10-27T15:00:00.000Z',
          last_used_at: null,
          revoked_at: null,
        },
      ],
      rowCount: 1,
    } as never);

    const keys = await listApiKeys('tenant-b');
    const sql = String(query.mock.calls[0]?.[0]);
    const params = query.mock.calls[0]?.[1] as unknown[];
    expect(sql).toMatch(/tenant_id = \$1/);
    expect(params[0]).toBe('tenant-b');
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toHaveProperty('key');
    expect(keys[0]).not.toHaveProperty('key_hash');
    expect(JSON.stringify(keys)).not.toContain('should-not-leak');
  });

  it('revoke de outro tenant não encontra a chave', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await expect(revokeApiKey('tenant-b', '11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(
      ApiKeyNotFoundError
    );
    const params = query.mock.calls[0]?.[1] as unknown[];
    expect(params).toEqual(['11111111-1111-4111-8111-111111111111', 'tenant-b']);
  });

  it('resolve aceita chave ativa e recusa revogada ou hash diferente', async () => {
    const secret = 'pcrm_testsecretvalue_padding_32b';
    const hash = hashApiKey(secret);
    const active = {
      id: 'k1',
      tenant_id: 'tenant-a',
      owner_user_id: 'user-a',
      key_hash: hash,
      scopes: ['leads.create'],
      revoked_at: null,
    };

    query.mockResolvedValueOnce({ rows: [active], rowCount: 1 } as never);
    await expect(resolveApiKey(secret)).resolves.toEqual({
      id: 'k1',
      tenant_id: 'tenant-a',
      owner_user_id: 'user-a',
      scopes: ['leads.create'],
    });

    query.mockResolvedValueOnce({
      rows: [{ ...active, revoked_at: new Date('2026-10-27T16:00:00.000Z') }],
      rowCount: 1,
    } as never);
    await expect(resolveApiKey(secret)).resolves.toBeNull();

    query.mockResolvedValueOnce({ rows: [active], rowCount: 1 } as never);
    await expect(resolveApiKey(`${secret}no`)).resolves.toBeNull();
  });
});
