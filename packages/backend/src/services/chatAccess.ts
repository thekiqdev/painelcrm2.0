/**
 * Permissões granulares do Chat via `permissionCatalog` + module_extras do módulo `chat`.
 * Admins do tenant: sempre permitido.
 */
import type { AuthRequest } from '../middleware/auth.js';
import type { ModulePermissionsMap } from '../permissions/permissionTypes.js';
import type { PermissionCatalogKey } from '../permissions/permissionCatalog.js';
import { hasPermissionKey } from '../permissions/permissionCatalog.js';
import { resolveModulePermissions } from '../permissions/modulePermissionResolver.js';
import { isTenantAdmin } from '../utils/tenant.js';

export type ChatAction =
  | 'view'
  | 'view_queue'
  | 'view_all'
  | 'reply'
  | 'assign'
  | 'transfer'
  | 'close'
  | 'reopen'
  | 'take_attendance'
  | 'manage_queues'
  | 'manage_teams'
  | 'view_metrics'
  | 'manage_automation'
  | 'manage_tags'
  | 'schedule_from_chat'
  | 'create_invoice_from_chat'
  | 'create_proposal_from_chat'
  | 'create_contract_from_chat'
  | 'create_group'
  | 'manage_groups'
  | 'manage_group_participants'
  | 'manage_group_settings';

const ACTION_TO_KEY: Record<ChatAction, PermissionCatalogKey> = {
  view: 'chat.view',
  view_queue: 'chat.view_queue',
  view_all: 'chat.view_all_conversations',
  reply: 'chat.send_message',
  assign: 'chat.assign_to_user',
  transfer: 'chat.transfer_attendance',
  close: 'chat.close_attendance',
  reopen: 'chat.reopen_attendance',
  take_attendance: 'chat.take_attendance',
  manage_queues: 'chat.manage_queues',
  manage_teams: 'chat.manage_teams',
  view_metrics: 'chat.view_metrics',
  manage_automation: 'chat.manage_automation',
  manage_tags: 'chat.manage_tags',
  schedule_from_chat: 'chat.schedule_from_chat',
  create_invoice_from_chat: 'chat.create_invoice_from_chat',
  create_proposal_from_chat: 'chat.create_proposal_from_chat',
  create_contract_from_chat: 'chat.create_contract_from_chat',
  create_group: 'chat.create_group',
  manage_groups: 'chat.manage_groups',
  manage_group_participants: 'chat.manage_group_participants',
  manage_group_settings: 'chat.manage_group_settings',
};

async function getMap(req: AuthRequest | undefined, userId: string): Promise<ModulePermissionsMap> {
  if (req?.permissionMap?.[userId]) return req.permissionMap[userId];
  return resolveModulePermissions(userId);
}

export async function canChatAction(
  userId: string,
  action: ChatAction,
  req?: AuthRequest
): Promise<boolean> {
  if (await isTenantAdmin(userId)) return true;
  const map = await getMap(req, userId);
  const key = ACTION_TO_KEY[action];
  return hasPermissionKey(map, key);
}

/**
 * Se o utilizador não pode enviar mensagens, devolve texto para JSON 403; caso contrário `null`.
 */
export async function getChatReplyDeniedReason(
  userId: string,
  req?: AuthRequest
): Promise<string | null> {
  if (await isTenantAdmin(userId)) return null;
  const map = await getMap(req, userId);
  if (!hasPermissionKey(map, 'chat.view')) {
    return 'Sem permissão para enviar mensagens (acesso ao módulo Chat não permitido para o seu perfil).';
  }
  if (!hasPermissionKey(map, 'chat.send_message')) {
    return 'Sem permissão para enviar mensagens. Peça a um administrador para ativar o envio no módulo Chat do seu perfil.';
  }
  return null;
}
