/**
 * Mapeamento fixo: cada app_role tem um conjunto padrão de permissões.
 * Usado para listar "Perfis de acesso" e ao atribuir role a um usuário.
 */
export type AppRole = 'admin' | 'manager' | 'member' | 'viewer';

export type PermissionType =
  | 'all_access'
  | 'manage_clients'
  | 'view_clients'
  | 'manage_leads'
  | 'view_leads'
  | 'manage_funnels'
  | 'view_funnels'
  | 'manage_settings'
  | 'view_reports'
  | 'manage_users';

export const ROLE_DISPLAY_NAMES: Record<AppRole, string> = {
  admin: 'Administrador',
  manager: 'Gestor',
  member: 'Operacional',
  viewer: 'Visualizador',
};

/** Permissões padrão por role. admin tem all_access; demais têm lista explícita. */
export const ROLE_DEFAULT_PERMISSIONS: Record<AppRole, PermissionType[]> = {
  admin: ['all_access'],
  manager: [
    'manage_clients',
    'view_clients',
    'manage_leads',
    'view_leads',
    'manage_funnels',
    'view_funnels',
    'manage_settings',
    'view_reports',
  ],
  member: [
    'view_clients',
    'manage_clients',
    'view_leads',
    'manage_leads',
    'view_funnels',
    'manage_funnels',
    'view_reports',
  ],
  viewer: ['view_clients', 'view_leads', 'view_funnels', 'view_reports'],
};

export const ALL_PERMISSIONS: PermissionType[] = [
  'all_access',
  'manage_clients',
  'view_clients',
  'manage_leads',
  'view_leads',
  'manage_funnels',
  'view_funnels',
  'manage_settings',
  'view_reports',
  'manage_users',
];

export function getPermissionsForRole(role: AppRole): PermissionType[] {
  return [...ROLE_DEFAULT_PERMISSIONS[role]];
}

export function isValidAppRole(role: string): role is AppRole {
  return role === 'admin' || role === 'manager' || role === 'member' || role === 'viewer';
}
