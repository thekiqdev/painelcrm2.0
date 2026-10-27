import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../observability/appLogger.js', () => ({
  appLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), boot: vi.fn() },
}));

import { appLogger } from '../observability/appLogger.js';
import { logApiV1Request } from './apiV1UsageLog.js';

describe('logApiV1Request', () => {
  beforeEach(() => {
    vi.mocked(appLogger.info).mockClear();
  });

  it('grava só id da chave, rota e status', () => {
    logApiV1Request({ keyId: 'key-1', route: 'POST /api/v1/leads', status: 201 });
    expect(appLogger.info).toHaveBeenCalledOnce();
    const fields = vi.mocked(appLogger.info).mock.calls[0]?.[2] as Record<string, unknown>;
    expect(Object.keys(fields).sort()).toEqual(['key_id', 'route', 'status']);
    expect(fields).toEqual({ key_id: 'key-1', route: 'POST /api/v1/leads', status: 201 });
  });
});
