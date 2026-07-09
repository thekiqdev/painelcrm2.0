import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  getChatMigrationFlagsForApi,
  updateChatMigrationFlag,
  isChatMigrationFlagKey,
} from '../services/chatMigrationFlags/service.js';
import { logSuperAdminAction } from '../services/auditLogService.js';

const patchSchema = z.object({
  enabled: z.boolean(),
});

/** GET /api/superadmin/advanced/chat-migration-flags */
export async function getSuperadminChatMigrationFlags(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const data = await getChatMigrationFlagsForApi();
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('[superadmin/chat-migration-flags] get_failed', e);
    res.status(500).json({ ok: false, error: 'Failed to load chat migration flags' });
  }
}

/** PATCH /api/superadmin/advanced/chat-migration-flags/:key */
export async function patchSuperadminChatMigrationFlag(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const key = String(req.params.key || '').trim();
    if (!isChatMigrationFlagKey(key)) {
      res.status(400).json({ ok: false, error: 'Invalid chat migration flag key' });
      return;
    }

    const { enabled } = patchSchema.parse(req.body);
    const before = (await getChatMigrationFlagsForApi()).flags[key];
    const flags = await updateChatMigrationFlag(key, enabled);

    const actor = req.user?.id;
    if (actor) {
      await logSuperAdminAction(actor, 'chat_migration_flag.updated', 'chat_migration_flag', key, {
        before,
        after: enabled,
      });
    }

    res.json({ ok: true, key, enabled: flags[key], flags });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: 'Invalid payload' });
      return;
    }
    console.error('[superadmin/chat-migration-flags] patch_failed', e);
    res.status(500).json({ ok: false, error: 'Failed to update chat migration flag' });
  }
}
