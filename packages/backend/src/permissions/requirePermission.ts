/**
 * Middleware Express que exige permissão "module.action" (ex.: "clients.create", "tasks.edit").
 * Usar em rotas após tenantAuth; req.userId deve estar definido.
 *
 * Descriptor deve ser "module.action"; use parsePermissionDescriptor. Para create use requirePermission;
 * para edit/delete com own_only use assertModulePermission no controller.
 *
 * Uso:
 *   router.post('/', requirePermission('clients.create'), clientsController.createClient);
 *
 * Para edit/delete com own_only, a verificação completa (ownerId/assigneeId) deve permanecer no controller
 * via assertModulePermission; requirePermission pode ser usado para checagem inicial de can_edit/can_delete
 * no módulo (sem recurso específico). Em negação o engine chama logPermissionDenied; o middleware apenas responde 403.
 */

import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import type { PermissionAction, PermissionDescriptor } from './permissionTypes.js';
import { parsePermissionDescriptor } from './parsePermissionDescriptor.js';
import { checkPermission } from './permissionEngine.js';

const ACTION_MESSAGES: Record<PermissionAction, string> = {
  create: 'Sem permissão para criar neste módulo.',
  edit: 'Sem permissão para editar neste módulo.',
  delete: 'Sem permissão para excluir neste módulo.',
  view: 'Sem permissão para visualizar neste módulo.',
};

/**
 * Middleware que exige a permissão indicada.
 * Ex.: requirePermission('clients.create') → verifica can_create no módulo clients.
 * Valida o descritor no momento do registro da rota (formato "module.action" e action válida).
 * Monta ctx (userId, tenantId, role de req) e chama checkPermission(ctx, req).
 *
 * @param descriptor - String "moduleId.action" (ex.: "clients.create", "tasks.edit")
 */
export function requirePermission(descriptor: PermissionDescriptor) {
  const { module, action } = parsePermissionDescriptor(descriptor);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const ctx = {
      userId,
      tenantId: authReq.tenantId ?? null,
      role: (authReq as AuthRequest & { role?: string | null }).role ?? null,
      module,
      action,
    };
    const allowed = await checkPermission(ctx, authReq);
    if (!allowed) {
      const message = ACTION_MESSAGES[action] ?? 'Sem permissão para esta ação.';
      res.status(403).json({ error: message });
      return;
    }
    next();
  };
}
