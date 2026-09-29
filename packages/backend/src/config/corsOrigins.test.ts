import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
}));

import {
  getStaticCorsOrigins,
  invalidateCorsOriginsCache,
  isCorsOriginAllowed,
} from './corsOrigins.js';

describe('corsOrigins dynamic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateCorsOriginsCache();
    delete process.env.FRONTEND_URL;
    delete process.env.FRONTEND_URLS;
  });

  it('static includes localhost', () => {
    expect(getStaticCorsOrigins()).toContain('http://localhost:8080');
  });

  it('permite host tenant active', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ hostname: 'loja.empresa.com' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(isCorsOriginAllowed('https://loja.empresa.com')).resolves.toBe(true);
  });

  it('permite partner verified', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ custom_domain: 'crm.partner.com' }] });
    await expect(isCorsOriginAllowed('https://crm.partner.com')).resolves.toBe(true);
  });

  it('nega host desconhecido', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(isCorsOriginAllowed('https://evil.example.com')).resolves.toBe(false);
  });

  it('permite sem Origin', async () => {
    await expect(isCorsOriginAllowed(null)).resolves.toBe(true);
  });
});
