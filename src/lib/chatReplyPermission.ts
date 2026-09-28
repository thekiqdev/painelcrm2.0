import type { ModulePermission } from '@/services/modulePermissions';

/**
 * Espelha `packages/backend/src/services/chatAccess.ts` (ação `reply`).
 * Admin no tenant continua sendo tratado só no backend.
 */
export function effectiveCanChatReply(perm: ModulePermission | undefined): boolean {
  if (!perm?.can_view) return false;
  if (!perm.can_edit) return false;
  if (perm.module_extras?.chat_reply === false) return false;
  return true;
}
