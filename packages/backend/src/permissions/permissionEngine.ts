/**
 * Função central do Permission Engine.
 * Fluxo: request cache → RBAC (can_*) → ABAC (evaluateRules) → own_only → allow/deny.
 * O engine não busca tenantId nem role no banco; o caller fornece no contexto.
 * logPermissionDenied é chamada com userId, tenantId, role, module, action, ownerId/assigneeId quando aplicável e reason,
 * para facilitar análise em suporte e debugging.
 */

import type {
  ModuleId,
  PermissionAction,
  AssertModulePermissionOptions,
  ModulePermissionsMap,
  RequestWithPermissionMap,
  CheckPermissionContext,
} from './permissionTypes.js';
import { resolveModulePermissions } from './modulePermissionResolver.js';
import { evaluateRules } from './permissionRulesEngine.js';

/** Motivos de negação para log estruturado. */
export type PermissionDeniedReason =
  | 'no_module_permission'
  | 'edit_own_only_not_owner'
  | 'delete_own_only_not_assignee'
  | 'abac_denied';

export interface LogPermissionDeniedParams {
  userId: string;
  tenantId?: string | null;
  role?: string | null;
  module: string;
  action: string;
  ownerId?: string | null;
  assigneeId?: string | null;
  reason: PermissionDeniedReason;
}

/**
 * Registra negação de permissão em log estruturado (suporte e debugging).
 * Chamada apenas pelo Permission Engine ao decidir negar (antes de retornar false).
 */
export function logPermissionDenied(params: LogPermissionDeniedParams): void {
  console.warn('[PermissionDenied]', JSON.stringify(params));
}

/**
 * Verifica se o usuário tem permissão para a ação no módulo.
 * Recebe contexto completo (userId, tenantId, role, module, action, resource?); não busca tenantId/role no banco.
 *
 * @param ctx - Contexto com userId, tenantId?, role?, module, action, resource? (ownerId, assigneeId para own_only)
 * @param req - Opcional: request com permissionMap para cache por request
 * @returns true se permitido; false se negado (RBAC, ABAC ou own_only)
 */
export async function checkPermission(
  ctx: CheckPermissionContext,
  req?: RequestWithPermissionMap
): Promise<boolean> {
  const { userId, module: moduleId, action, resource } = ctx;

  let perms: ModulePermissionsMap;
  if (req?.permissionMap?.[userId]) {
    perms = req.permissionMap[userId];
  } else {
    perms = await resolveModulePermissions(userId);
    if (req) {
      req.permissionMap = req.permissionMap ?? {};
      req.permissionMap[userId] = perms;
    }
  }

  const p = perms[moduleId];
  const logDenied = (reason: PermissionDeniedReason) =>
    logPermissionDenied({
      userId: ctx.userId,
      tenantId: ctx.tenantId ?? null,
      role: ctx.role ?? null,
      module: moduleId,
      action,
      ownerId: resource?.ownerId ?? null,
      assigneeId: resource?.assigneeId ?? null,
      reason,
    });

  if (!p) {
    logDenied('no_module_permission');
    return false;
  }

  // RBAC: permissão no módulo para a ação
  if (action === 'create') {
    if (p.can_create !== true) {
      logDenied('no_module_permission');
      return false;
    }
  } else if (action === 'view') {
    if (p.can_view !== true) {
      logDenied('no_module_permission');
      return false;
    }
  } else if (action === 'edit') {
    if (!p.can_edit) {
      logDenied('no_module_permission');
      return false;
    }
  } else if (action === 'delete') {
    if (!p.can_delete) {
      logDenied('no_module_permission');
      return false;
    }
  } else if (action === 'proposals_send' || action === 'proposals_convert_invoice') {
    if (moduleId !== 'proposals') {
      logDenied('no_module_permission');
      return false;
    }
    if (!p.can_edit) {
      logDenied('no_module_permission');
      return false;
    }
    const extraKey = action === 'proposals_send' ? 'proposals_send' : 'proposals_convert_invoice';
    const flag = p.module_extras?.[extraKey];
    if (flag === false) {
      logDenied('no_module_permission');
      return false;
    }
    if (p.edit_own_only) {
      const isOwner = resource?.ownerId != null && resource.ownerId === userId;
      const isAssignee = resource?.assigneeId != null && resource.assigneeId === userId;
      if (!isOwner && !isAssignee) {
        logDenied('edit_own_only_not_owner');
        return false;
      }
    }
  } else if (action === 'proposals_manage_integrations') {
    if (moduleId !== 'proposals') {
      logDenied('no_module_permission');
      return false;
    }
    if (!p.can_edit) {
      logDenied('no_module_permission');
      return false;
    }
    const m = p.module_extras?.proposals_manage_integrations;
    if (m !== true) {
      logDenied('no_module_permission');
      return false;
    }
  } else {
    logDenied('no_module_permission');
    return false;
  }

  // ABAC: regras por atributo (hoje retorna sempre null)
  const abacResult = await evaluateRules(
    { id: userId, tenantId: ctx.tenantId, role: ctx.role },
    moduleId,
    action,
    resource ?? undefined
  );
  if (abacResult === false) {
    logDenied('abac_denied');
    return false;
  }

  // own_only: edit/delete restritos a owner ou assignee (proposals_send/convert tratados acima)
  if (action === 'edit' && p.edit_own_only) {
    const isOwner = resource?.ownerId != null && resource.ownerId === userId;
    const isAssignee = resource?.assigneeId != null && resource.assigneeId === userId;
    if (!isOwner && !isAssignee) {
      logDenied('edit_own_only_not_owner');
      return false;
    }
  }
  if (action === 'delete' && p.delete_own_only) {
    const isOwner = resource?.ownerId != null && resource.ownerId === userId;
    const isAssignee = resource?.assigneeId != null && resource.assigneeId === userId;
    if (!isOwner && !isAssignee) {
      logDenied('delete_own_only_not_assignee');
      return false;
    }
  }

  return true;
}

/**
 * Verifica se o usuário tem permissão (assinatura legada).
 * Monta o contexto e delega para checkPermission.
 *
 * @param userId - UUID do usuário
 * @param moduleId - Módulo (clients, projects, tasks, etc.)
 * @param action - create | edit | delete | view
 * @param options - ownerId e assigneeId para regras edit_own_only / delete_own_only
 * @param req - Opcional: request com permissionMap para cache por request
 * @returns true se permitido; false se não tiver permissão
 */
export async function check(
  userId: string,
  moduleId: ModuleId | string,
  action: PermissionAction,
  options?: AssertModulePermissionOptions,
  req?: RequestWithPermissionMap
): Promise<boolean> {
  const ctx: CheckPermissionContext = {
    userId,
    module: moduleId,
    action,
    resource:
      options != null
        ? { ownerId: options.ownerId ?? null, assigneeId: options.assigneeId ?? null }
        : undefined,
  };
  return checkPermission(ctx, req);
}
