/**
 * Permissões granulares do Chat (Fase 5) via module_extras do módulo `chat`.
 * Admins do tenant: sempre permitido.
 */
import type { AuthRequest } from '../middleware/auth.js';
import type { ModulePermissionsMap } from '../permissions/permissionTypes.js';
import { resolveModulePermissions } from '../permissions/modulePermissionResolver.js';
import { isTenantAdmin } from '../utils/tenant.js';

export type ChatAction =
  | 'view'
  | 'reply'
  | 'assign'
  | 'transfer'
  | 'close'
  | 'manage_queues'
  | 'manage_teams'
  | 'view_all'
  /** Fase 7 — métricas completas / dashboard operacional */
  | 'view_metrics'
  /** Fase 7 — automação e regras (fallback: manage_queues) */
  | 'manage_automation';

async function getMap(req: AuthRequest | undefined, userId: string): Promise<ModulePermissionsMap> {
  if (req?.permissionMap?.[userId]) return req.permissionMap[userId];
  return resolveModulePermissions(userId);
}

function extraFlag(ex: Record<string, unknown>, key: string, defaultVal: boolean): boolean {
  const v = ex[key];
  if (v === false) return false;
  if (v === true) return true;
  return defaultVal;
}

export async function canChatAction(
  userId: string,
  action: ChatAction,
  req?: AuthRequest
): Promise<boolean> {
  if (await isTenantAdmin(userId)) return true;
  const map = await getMap(req, userId);
  const chat = map['chat'];
  if (!chat?.can_view && action !== 'view') return false;
  if (!chat?.can_view) return false;

  const ex = (chat.module_extras ?? {}) as Record<string, unknown>;

  switch (action) {
    case 'view':
      return true;
    case 'view_all':
      return extraFlag(ex, 'chat_view_all', chat.can_edit === true);
    case 'reply':
      return chat.can_edit === true && extraFlag(ex, 'chat_reply', true);
    case 'assign':
      return chat.can_edit === true && extraFlag(ex, 'chat_assign', true);
    case 'transfer':
      return chat.can_edit === true && extraFlag(ex, 'chat_transfer', true);
    case 'close':
      return chat.can_edit === true && extraFlag(ex, 'chat_close', true);
    case 'manage_queues':
      return chat.can_edit === true && extraFlag(ex, 'chat_manage_queues', false);
    case 'manage_teams':
      return chat.can_edit === true && extraFlag(ex, 'chat_manage_teams', false);
    case 'view_metrics':
      return (
        chat.can_view === true &&
        extraFlag(ex, 'chat_view_metrics', false)
      );
    case 'manage_automation':
      return (
        chat.can_edit === true &&
        (extraFlag(ex, 'chat_manage_automation', false) || extraFlag(ex, 'chat_manage_queues', false))
      );
    default:
      return false;
  }
}
