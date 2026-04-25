/**
 * Super Admin — WhatsApp da PLATAFORMA (mesma UazAPI + chat_instances do CRM, sem rota /api/chat).
 * Reutiliza handlers do chatController; DELETE limpa designação em superadmin_settings quando aplicável.
 */
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import {
  listInstances,
  createInstance,
  connectInstance,
  getInstanceStatus,
  patchInstance,
} from './chatController.js';
import {
  getPlatformNotificationsGlobalSettingsRow,
  upsertPlatformNotificationsGlobalSettings,
} from '../services/platformNotifications/platformNotificationsGlobalSettingsService.js';
import { refreshPlatformNotificationsFlagsFromPool } from '../services/platformNotifications/platformNotificationsRuntimeFlags.js';

export { listInstances, createInstance, connectInstance, getInstanceStatus, patchInstance };

export async function deleteSuperadminPlatformWhatsAppInstance(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const settings = await getPlatformNotificationsGlobalSettingsRow(pool);
    const wasDesignated = settings.platform_notifications_whatsapp_chat_instance_id === id;

    const del = await pool.query<{ id: string }>(
      `DELETE FROM chat_instances WHERE id = $1::uuid AND user_id = $2::uuid RETURNING id::text AS id`,
      [id, userId],
    );
    if (del.rowCount === 0) {
      res.status(404).json({ error: 'Instância não encontrada' });
      return;
    }

    if (wasDesignated) {
      await upsertPlatformNotificationsGlobalSettings(pool, {
        platform_notifications_whatsapp_chat_instance_id: '',
      });
      await refreshPlatformNotificationsFlagsFromPool(pool);
    }

    res.json({ message: 'Instância deletada com sucesso' });
  } catch (e: unknown) {
    console.error('[superadmin/platform-whatsapp] delete', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Erro ao remover instância.' });
  }
}
