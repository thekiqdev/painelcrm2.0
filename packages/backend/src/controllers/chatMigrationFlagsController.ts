import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { getChatMigrationFlagsForApi } from '../services/chatMigrationFlags/service.js';

/** GET /api/chat/migration-flags — leitura para clientes autenticados (CRM). */
export async function getChatMigrationFlags(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await getChatMigrationFlagsForApi();
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('[chat-migration-flags] get_failed', e);
    res.status(500).json({ ok: false, error: 'Failed to load chat migration flags' });
  }
}
