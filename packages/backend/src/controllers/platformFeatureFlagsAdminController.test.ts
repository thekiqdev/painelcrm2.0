import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AuthRequest } from '../middleware/auth.js';

vi.mock('../platform/featureFlagRepository.js', () => ({
  listPlatformFeatureFlagsForAdmin: vi.fn(),
  findPlatformFeatureFlagByKey: vi.fn(),
  patchPlatformFeatureFlagForAdmin: vi.fn(),
}));

vi.mock('../platform/featureFlagRegistry.js', () => ({
  featureFlagRegistry: {
    refresh: vi.fn(),
    invalidateCache: vi.fn(),
    getCacheStats: vi.fn(() => ({ hits: 0, misses: 0, size: 1 })),
  },
}));

vi.mock('../services/auditLogService.js', () => ({
  logSuperAdminAction: vi.fn(),
}));

vi.mock('../context/requestContext.js', () => ({
  getCorrelationId: vi.fn(() => 'corr-1'),
}));

import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';
import {
  listPlatformFeatureFlagsForAdmin,
  findPlatformFeatureFlagByKey,
  patchPlatformFeatureFlagForAdmin,
} from '../platform/featureFlagRepository.js';
import { logSuperAdminAction } from '../services/auditLogService.js';
import { listAdvancedFeatureFlags, patchAdvancedFeatureFlag } from './platformFeatureFlagsAdminController.js';

function makeRes() {
  const res: any = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (b: any) => {
    res.body = b;
    return res;
  };
  return res;
}

describe('platformFeatureFlagsAdminController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('GET list returns flags + cache stats', async () => {
    vi.mocked(listPlatformFeatureFlagsForAdmin).mockResolvedValueOnce([
      {
        key: 'workflow.master_off',
        namespace: 'workflow',
        description: 'Kill switch workflow engine',
        default_enabled: false,
        kill_switch_key: null,
        rollout_type: 'off',
        rollout_percent: 0,
        shadow_mode: false,
        schema_version: 1,
        updated_at: new Date().toISOString(),
      },
    ]);

    const req = {} as AuthRequest;
    const res = makeRes();
    await listAdvancedFeatureFlags(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.flags).toHaveLength(1);
    expect(featureFlagRegistry.refresh).toHaveBeenCalledTimes(1);
    expect(featureFlagRegistry.getCacheStats).toHaveBeenCalledTimes(1);
  });

  it('PATCH updates, refreshes cache, and writes audit', async () => {
    vi.mocked(findPlatformFeatureFlagByKey).mockResolvedValueOnce({
      key: 'workflow.shadow_execution_v1',
      namespace: 'workflow',
      description: 'Shadow execution',
      default_enabled: false,
      kill_switch_key: 'workflow.master_off',
      rollout_type: 'off',
      rollout_percent: 0,
      shadow_mode: true,
      schema_version: 1,
      updated_at: new Date().toISOString(),
    });

    vi.mocked(patchPlatformFeatureFlagForAdmin).mockResolvedValueOnce({
      key: 'workflow.shadow_execution_v1',
      namespace: 'workflow',
      description: 'Shadow execution',
      default_enabled: true,
      kill_switch_key: 'workflow.master_off',
      rollout_type: 'off',
      rollout_percent: 0,
      shadow_mode: true,
      schema_version: 1,
      updated_at: new Date().toISOString(),
    });

    const req = {
      params: { key: 'workflow.shadow_execution_v1' },
      body: { default_enabled: true },
      user: { id: 'admin-1', email: 'a@a.com', is_super_admin: true },
    } as unknown as AuthRequest;
    const res = makeRes();

    await patchAdvancedFeatureFlag(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.flag.default_enabled).toBe(true);
    expect(featureFlagRegistry.invalidateCache).toHaveBeenCalledTimes(1);
    expect(featureFlagRegistry.refresh).toHaveBeenCalledTimes(1);
    expect(logSuperAdminAction).toHaveBeenCalledTimes(1);

    const call = vi.mocked(logSuperAdminAction).mock.calls[0]!;
    expect(call[0]).toBe('admin-1');
    expect(call[1]).toBe('feature_flag.updated');
    expect(call[2]).toBe('platform_feature_flag');
    expect(call[3]).toBe('workflow.shadow_execution_v1');
  });

  it('PATCH validates rollout_percent 0..100', async () => {
    const req = {
      params: { key: 'workflow.shadow_execution_v1' },
      body: { rollout_percent: 101 },
      user: { id: 'admin-1', email: 'a@a.com', is_super_admin: true },
    } as unknown as AuthRequest;
    const res = makeRes();
    await patchAdvancedFeatureFlag(req, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

