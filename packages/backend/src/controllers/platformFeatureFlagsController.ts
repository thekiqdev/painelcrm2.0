import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { listPlatformFeatureFlagsForAdmin } from '../platform/featureFlagRepository.js';
import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';

/** GET /api/superadmin/platform-feature-flags — leitura apenas (Sprint 1). */
export async function listPlatformFeatureFlags(req: AuthRequest, res: Response): Promise<void> {
  try {
    await featureFlagRegistry.refresh();
    const flags = await listPlatformFeatureFlagsForAdmin();
    const cache = featureFlagRegistry.getCacheStats();
    res.json({
      flags,
      cache,
      note: 'Rollout registry P0 — alterações via SQL/migração nesta sprint; UI admin em sprint futura.',
    });
  } catch (e) {
    console.error('[FEATURE_FLAG] list_failed', e);
    res.status(500).json({ error: 'Failed to load platform feature flags' });
  }
}
