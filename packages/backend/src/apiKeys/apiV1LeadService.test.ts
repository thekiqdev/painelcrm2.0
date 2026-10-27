import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./apiKeyFlags.js', () => ({
  isApiKeysEnabled: vi.fn(),
}));

vi.mock('../services/tenantAccessGate.js', () => ({
  commercialAccessBlock: vi.fn(async () => null),
  planPeriodBlock: vi.fn(async () => null),
}));

vi.mock('./apiKeyRequestContext.js', () => ({
  withApiKeyTransaction: vi.fn(),
}));

vi.mock('../observability/appLogger.js', () => ({
  appLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), boot: vi.fn() },
}));

import { pool } from '../utils/db.js';
import { isApiKeysEnabled } from './apiKeyFlags.js';
import { withApiKeyTransaction } from './apiKeyRequestContext.js';
import { planPeriodBlock } from '../services/tenantAccessGate.js';
import { appLogger } from '../observability/appLogger.js';
import { createPublicLead, hashIdempotencyBody } from './apiV1LeadService.js';
import type { ResolvedApiKey } from './apiKeyService.js';

const query = vi.mocked(pool.query);
const tx = vi.mocked(withApiKeyTransaction);
const flag = vi.mocked(isApiKeysEnabled);
const period = vi.mocked(planPeriodBlock);

const key: ResolvedApiKey = {
  id: 'key-1',
  tenant_id: '11111111-1111-4111-8111-111111111111',
  owner_user_id: 'owner-1',
  scopes: ['leads.create'],
};

function useKey(active: ResolvedApiKey | null) {
  tx.mockImplementation(async (_secret, work) => {
    if (!active) return { ok: false };
    return { ok: true, value: await work(active) };
  });
}

describe('createPublicLead', () => {
  beforeEach(() => {
    vi.mocked(appLogger.info).mockClear();
    query.mockReset();
    flag.mockReset();
    period.mockReset();
    period.mockResolvedValue(null);
    flag.mockResolvedValue(true);
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      if (text.includes('UPDATE api_keys')) return { rows: [], rowCount: 1 } as never;
      if (text.includes('FROM lead_statuses')) return { rows: [], rowCount: 0 } as never;
      if (text.includes('INSERT INTO leads')) {
        return {
          rows: [
            {
              id: 'lead-1',
              name: 'Maria',
              email: null,
              phone: null,
              company: null,
              source: 'API',
              status: null,
              observacao: params?.[10] ?? null,
              cpf_cnpj: null,
              created_at: '2026-10-27T15:00:00.000Z',
            },
          ],
          rowCount: 1,
        } as never;
      }
      if (text.includes('FROM api_idempotency_keys')) return { rows: [], rowCount: 0 } as never;
      if (text.includes('INSERT INTO api_idempotency_keys')) return { rows: [], rowCount: 1 } as never;
      if (text.includes('SAVEPOINT') || text.includes('RELEASE') || text.includes('ROLLBACK TO')) {
        return { rows: [], rowCount: 0 } as never;
      }
      throw new Error(`sql inesperada: ${text}`);
    });
  });

  it('chave inválida ou revogada → 401', async () => {
    useKey(null);
    const result = await createPublicLead({ secret: 'pcrm_x', body: { name: 'Maria' }, idempotencyKey: null });
    expect(result.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
    expect(appLogger.info).toHaveBeenCalledWith('api-keys', 'request', {
      key_id: null,
      route: 'POST /api/v1/leads',
      status: 401,
    });
    expect(JSON.stringify(vi.mocked(appLogger.info).mock.calls)).not.toContain('pcrm_');
  });

  it('flag off → 404', async () => {
    useKey(key);
    flag.mockResolvedValue(false);
    const result = await createPublicLead({ secret: 'pcrm_x', body: { name: 'Maria' }, idempotencyKey: null });
    expect(result.status).toBe(404);
    expect(result.body.code).toBe('API_KEYS_DISABLED');
  });

  it('sem escopo → 403', async () => {
    useKey({ ...key, scopes: [] });
    const result = await createPublicLead({ secret: 'pcrm_x', body: { name: 'Maria' }, idempotencyKey: null });
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('API_KEY_SCOPE');
  });

  it('plano expirado → 402', async () => {
    useKey(key);
    period.mockResolvedValue({
      status: 402,
      body: { error: 'Período do plano expirado. Renove para continuar acessando.', code: 'PLAN_EXPIRED', redirect: '/meu-plano' },
    });
    const result = await createPublicLead({ secret: 'pcrm_x', body: { name: 'Maria' }, idempotencyKey: null });
    expect(result.status).toBe(402);
    expect(result.body.code).toBe('PLAN_EXPIRED');
    expect(query).not.toHaveBeenCalled();
  });

  it('cria o lead no dono da chave com source API', async () => {
    useKey(key);
    const result = await createPublicLead({ secret: 'pcrm_x', body: { name: 'Maria' }, idempotencyKey: null });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ id: 'lead-1', name: 'Maria', source: 'API' });
    expect(result.body).not.toHaveProperty('user_id');
    const insert = query.mock.calls.find((call) => String(call[0]).includes('INSERT INTO leads'));
    const params = insert?.[1] as unknown[];
    expect(params[0]).toBe('owner-1');
    expect(params[5]).toBe('API');
    expect(params[8]).toBeNull();
    expect(appLogger.info).toHaveBeenCalledWith('api-keys', 'request', {
      key_id: 'key-1',
      route: 'POST /api/v1/leads',
      status: 201,
    });
    const logged = JSON.stringify(vi.mocked(appLogger.info).mock.calls);
    expect(logged).not.toContain('pcrm_');
    expect(logged).not.toContain('Maria');
  });

  it('CPF inválido → 400 e não insere', async () => {
    useKey(key);
    const result = await createPublicLead({
      secret: 'pcrm_x',
      body: { name: 'Maria', cpf_cnpj: '123' },
      idempotencyKey: null,
    });
    expect(result.status).toBe(400);
    expect(String(result.body.error)).toMatch(/11/);
    expect(query.mock.calls.some((call) => String(call[0]).includes('INSERT INTO leads'))).toBe(false);
  });

  it('status fora da lista do dono → 400', async () => {
    useKey(key);
    const result = await createPublicLead({
      secret: 'pcrm_x',
      body: { name: 'Maria', status: 'Inexistente' },
      idempotencyKey: null,
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('Status de lead não encontrado.');
    expect(query.mock.calls.some((call) => String(call[0]).includes('INSERT INTO leads'))).toBe(false);
  });

  it('grava observacao e não devolve notes', async () => {
    useKey(key);
    const result = await createPublicLead({
      secret: 'pcrm_x',
      body: { name: 'Maria', observacao: 'Veio do formulário' },
      idempotencyKey: null,
    });
    expect(result.status).toBe(201);
    expect(result.body.observacao).toBe('Veio do formulário');
    expect(result.body).not.toHaveProperty('notes');
    const insert = query.mock.calls.find((call) => String(call[0]).includes('INSERT INTO leads'));
    const params = insert?.[1] as unknown[];
    expect(params[10]).toBe('Veio do formulário');
  });

  it('recusa notes, que não é campo do cadastro', async () => {
    useKey(key);
    const result = await createPublicLead({
      secret: 'pcrm_x',
      body: { name: 'Maria', notes: 'adesivo' },
      idempotencyKey: null,
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('Campo não permitido.');
    expect(query.mock.calls.some((call) => String(call[0]).includes('INSERT INTO leads'))).toBe(false);
  });

  it('recusa user_id no corpo', async () => {
    useKey(key);
    const result = await createPublicLead({
      secret: 'pcrm_x',
      body: { name: 'Maria', user_id: 'outro' },
      idempotencyKey: null,
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('Campo não permitido.');
  });

  it('Idempotency-Key repetida devolve a mesma resposta e não cria outro lead', async () => {
    useKey(key);
    const body = { name: 'Maria' };
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('UPDATE api_keys')) return { rows: [], rowCount: 1 } as never;
      if (text.includes('FROM api_idempotency_keys')) {
        return {
          rows: [
            {
              id: 'idem-1',
              request_hash: hashIdempotencyBody(body),
              status_code: 201,
              response_body: { id: 'lead-1', name: 'Maria', source: 'API' },
              created_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        } as never;
      }
      throw new Error(`sql inesperada: ${text}`);
    });
    const result = await createPublicLead({ secret: 'pcrm_x', body, idempotencyKey: 'pedido-1' });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ id: 'lead-1' });
    expect(query.mock.calls.some((call) => String(call[0]).includes('INSERT INTO leads'))).toBe(false);
  });

  it('mesma Idempotency-Key com corpo diferente → 409', async () => {
    useKey(key);
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('UPDATE api_keys')) return { rows: [], rowCount: 1 } as never;
      if (text.includes('FROM api_idempotency_keys')) {
        return {
          rows: [
            {
              id: 'idem-1',
              request_hash: hashIdempotencyBody({ name: 'Outra' }),
              status_code: 201,
              response_body: { id: 'lead-1' },
              created_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        } as never;
      }
      throw new Error(`sql inesperada: ${text}`);
    });
    const result = await createPublicLead({
      secret: 'pcrm_x',
      body: { name: 'Maria' },
      idempotencyKey: 'pedido-1',
    });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});
