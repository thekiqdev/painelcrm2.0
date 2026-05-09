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
import { deleteChatInstanceComplete } from '../services/whatsappInstanceDeletionService.js';

export { listInstances, createInstance, connectInstance, getInstanceStatus, patchInstance };

export async function deleteSuperadminPlatformWhatsAppInstance(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const settings = await getPlatformNotificationsGlobalSettingsRow(pool);
    const wasDesignated = settings.platform_notifications_whatsapp_chat_instance_id === id;

    const result = await deleteChatInstanceComplete(pool, id, userId);
    if (!result.deleted || !result.audit) {
      res.status(404).json({ error: 'Instância não encontrada' });
      return;
    }

    if (wasDesignated) {
      await upsertPlatformNotificationsGlobalSettings(pool, {
        platform_notifications_whatsapp_chat_instance_id: '',
      });
      await refreshPlatformNotificationsFlagsFromPool(pool);
    }

    res.json({
      message: 'Instância removida no provedor e no sistema.',
      ok: true,
      audit: {
        notifications_deleted: result.audit.notifications_deleted,
        provider_delete_ok: result.audit.provider_delete_ok,
      },
    });
  } catch (e: unknown) {
    console.error('[superadmin/platform-whatsapp] delete', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Erro ao remover instância.' });
  }
}
