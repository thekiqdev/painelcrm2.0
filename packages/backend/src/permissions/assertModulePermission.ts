/**
 * Validação de permissão em controllers.
 * Garante que o usuário tem permissão para a ação no módulo; lança ModulePermissionError(403) se não permitido.
 * Suporta create, edit, delete e regras edit_own_only e delete_own_only (ownerId, assigneeId).
 *
 * Monta CheckPermissionContext (userId, tenantId/role de req quando disponível), delega a
 * checkPermission(ctx, req). Em negação apenas lança ModulePermissionError; logPermissionDenied
 * é responsabilidade do engine. Assinatura mantida para compatibilidade com clientsController,
 * leadsController, projectsController, projectTasksController.
 */

import type {
  ModuleId,
  PermissionAction,
  AssertModulePermissionOptions,
  RequestWithPermissionMap,
  CheckPermissionContext,
} from './permissionTypes.js';
import { checkPermission } from './permissionEngine.js';
import { ModulePermissionError } from './errors.js';

/** Request com permissionMap e opcionalmente tenantId/role para montar o contexto. */
type ReqWithContext = RequestWithPermissionMap & { tenantId?: string | null; role?: string | null };

const ACTION_MESSAGES: Record<PermissionAction, string> = {
  create: 'Sem permissão para criar neste módulo.',
  edit: 'Sem permissão para editar neste módulo.',
  delete: 'Sem permissão para excluir neste módulo.',
  view: 'Sem permissão para visualizar neste módulo.',
};

const OWN_MESSAGES: Record<'edit' | 'delete', string> = {
  edit: 'Sem permissão para editar este registro.',
  delete: 'Sem permissão para excluir este registro.',
};

/**
 * Garante que o usuário tem permissão para a ação no módulo.
 * Para create: exige can_create.
 * Para edit/delete: exige can_edit/can_delete; se edit_own_only/delete_own_only, exige ownerId === userId ou assigneeId === userId.
 * Passar req em fluxo HTTP para request cache e para preencher tenantId/role no contexto.
 *
 * @throws ModulePermissionError(403) quando não permitido
 */
export async function assertModulePermission(
  userId: string,
  moduleId: ModuleId | string,
  action: 'create' | 'edit' | 'delete',
  options?: AssertModulePermissionOptions,
  req?: ReqWithContext
): Promise<void> {
  const ctx: CheckPermissionContext = {
    userId,
    tenantId: req?.tenantId ?? null,
    role: req?.role ?? null,
    module: moduleId,
    action,
    resource: options
      ? { ownerId: options.ownerId ?? null, assigneeId: options.assigneeId ?? null }
      : undefined,
  };
  const allowed = await checkPermission(ctx, req);
  if (allowed) return;

  if (action === 'create') {
    throw new ModulePermissionError(403, ACTION_MESSAGES.create);
  }
  throw new ModulePermissionError(403, OWN_MESSAGES[action]);
}
