import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  listPlatformFeatureFlagsForAdmin,
  findPlatformFeatureFlagByKey,
  patchPlatformFeatureFlagForAdmin,
} from '../platform/featureFlagRepository.js';
import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';
import { logSuperAdminAction } from '../services/auditLogService.js';
import { getCorrelationId } from '../context/requestContext.js';

const patchSchema = z.object({
  default_enabled: z.boolean().optional(),
  shadow_mode: z.boolean().optional(),
  rollout_percent: z.number().int().min(0).max(100).optional(),
});

/** GET /api/superadmin/advanced/feature-flags */
export async function listAdvancedFeatureFlags(req: AuthRequest, res: Response): Promise<void> {
  try {
    await featureFlagRegistry.refresh();
    const flags = await listPlatformFeatureFlagsForAdmin();
    res.json({
      ok: true,
      flags,
      cache: featureFlagRegistry.getCacheStats(),
    });
  } catch (e) {
    console.error('[FEATURE_FLAG_ADMIN] list_failed', {
      correlation_id: getCorrelationId(),
      error: e instanceof Error ? e.message : String(e),
    });
    res.status(500).json({ ok: false, error: 'Failed to load feature flags' });
  }
}

/** PATCH /api/superadmin/advanced/feature-flags/:key */
export async function patchAdvancedFeatureFlag(req: AuthRequest, res: Response): Promise<void> {
  try {
    const key = String(req.params.key || '').trim();
    if (!key) {
      res.status(400).json({ ok: false, error: 'Missing flag key' });
      return;
    }

    const patch = patchSchema.parse(req.body);
    const before = await findPlatformFeatureFlagByKey(key);
    if (!before) {
      res.status(404).json({ ok: false, error: 'Flag not found' });
      return;
    }

    const after = await patchPlatformFeatureFlagForAdmin(key, patch);
    if (!after) {
      res.status(500).json({ ok: false, error: 'Failed to update flag' });
      return;
    }

    // refresh registry cache immediately (no restart)
    featureFlagRegistry.invalidateCache();
    await featureFlagRegistry.refresh();

    const actor = req.user?.id ?? req.userId ?? null;
    if (actor) {
      await logSuperAdminAction(actor, 'feature_flag.updated', 'platform_feature_flag', key, {
        key,
        namespace: before.namespace,
        correlation_id: getCorrelationId(),
        old: {
          default_enabled: before.default_enabled,
          shadow_mode: before.shadow_mode,
          rollout_percent: before.rollout_percent,
        },
        new: {
          default_enabled: after.default_enabled,
          shadow_mode: after.shadow_mode,
          rollout_percent: after.rollout_percent,
        },
      });
    }

    console.log('[FEATURE_FLAG_ADMIN]', {
      action: 'feature_flag.updated',
      actor_user_id: actor,
      key,
      namespace: before.namespace,
      correlation_id: getCorrelationId(),
      old: {
        default_enabled: before.default_enabled,
        shadow_mode: before.shadow_mode,
        rollout_percent: before.rollout_percent,
      },
      new: {
        default_enabled: after.default_enabled,
        shadow_mode: after.shadow_mode,
        rollout_percent: after.rollout_percent,
      },
    });

    res.json({
      ok: true,
      flag: after,
      cache: featureFlagRegistry.getCacheStats(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: 'Validation error', details: error.errors });
      return;
    }
    console.error('[FEATURE_FLAG_ADMIN] patch_failed', {
      correlation_id: getCorrelationId(),
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

