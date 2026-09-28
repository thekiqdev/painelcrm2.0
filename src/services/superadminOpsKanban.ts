import { createChatKanbanService } from './chatKanban';

export const SUPERADMIN_OPS_KANBAN_BASE = '/api/superadmin/ops/kanban';

/**
 * Kanban operacional (Super Admin) — mesmo contrato do Kanban de chat,
 * mas com base path superadmin e sem alias legado de attach.
 */
export const superadminOpsKanbanService = createChatKanbanService(SUPERADMIN_OPS_KANBAN_BASE, {
  useLegacyAttachAlias: false,
  isOpsLayer: true,
});

