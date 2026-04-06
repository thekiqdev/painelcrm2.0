/**
 * Tipos e interfaces do Permission Engine.
 * Fonte única de definições para módulo, ação e opções de own.
 */

/** Ações que podem ser verificadas (create, edit, delete; view opcional para uso futuro). */
export type PermissionAction = 'create' | 'edit' | 'delete' | 'view';

/** Módulos do sistema (alinhado a MODULE_IDS em modulePermissionsService). */
export type ModuleId =
  | 'dashboard'
  | 'clients'
  | 'leads'
  | 'funnels'
  | 'products'
  | 'projects'
  | 'tasks'
  | 'project_templates'
  | 'chat'
  | 'tickets'
  | 'proposals'
  | 'contracts'
  | 'billing'
  | 'finance'
  | 'settings'
  | 'meu_plano';

/** Permissões de um módulo para um usuário (espelho de role_module_permissions / custom_role_module_permissions). */
export interface ModulePermissionRow {
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  edit_own_only: boolean;
  delete_own_only: boolean;
}

/** Mapa módulo → permissões (retorno de getEffectiveModulePermissions). */
export interface ModulePermissionsMap {
  [module: string]: ModulePermissionRow;
}

/**
 * Request (ou objeto compatível) com cache de permissões por userId.
 * Uma única resolução por userId por request; req.permissionMap é Record<string, ModulePermissionsMap>.
 */
export interface RequestWithPermissionMap {
  permissionMap?: Record<string, ModulePermissionsMap>;
}

/** Opções para verificação de edit/delete quando há edit_own_only ou delete_own_only. */
export interface AssertModulePermissionOptions {
  /** UUID do dono/criador do recurso (ex.: client.user_id). */
  ownerId?: string | null;
  /** UUID do responsável atribuído (ex.: task.assignee_id, contract.responsible_id). */
  assigneeId?: string | null;
}

/** Descritor para requirePermission: "module.action" (ex.: "clients.create", "tasks.edit"). */
export type PermissionDescriptor = `${string}.${PermissionAction}`;

/** Contexto para a função central do engine (checkPermission). */
export interface CheckPermissionContext {
  userId: string;
  tenantId?: string | null;
  role?: string | null;
  module: ModuleId | string;
  action: PermissionAction;
  /** Recurso opcional para regras ABAC (ex.: ownerId, assigneeId). */
  resource?: { ownerId?: string | null; assigneeId?: string | null } | null;
}

/** Resultado da checagem central (sucesso ou falha com motivo). */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}
