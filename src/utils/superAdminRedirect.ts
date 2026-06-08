/**
 * Super admin de plataforma: is_super_admin e sem tenant_id.
 * Deve usar apenas /superadmin, não o CRM.
 */
export function isSuperAdminPlatformUser(user: {
  is_super_admin?: boolean;
  tenant_id?: string | null;
} | null | undefined): boolean {
  if (!user?.is_super_admin) return false;
  const tid = user.tenant_id;
  return tid == null || tid === '';
}

/** Destino após login ou quando já autenticado na tela de login. */
export function getPostAuthHomePath(user: {
  is_super_admin?: boolean;
  tenant_id?: string | null;
  registration_complete?: boolean;
  onboarding_completed?: boolean;
  commercial_access_required?: boolean;
} | null | undefined): string {
  if (!user) return '/login';
  if (isSuperAdminPlatformUser(user)) return '/superadmin';
  if (user.tenant_id && user.onboarding_completed === false) {
    try {
      const sess = sessionStorage.getItem('acquisition_onboarding_session');
      if (sess) {
        return `/onboarding/acquisition?session=${encodeURIComponent(sess)}`;
      }
    } catch {
      /* SSR */
    }
    if (user.registration_complete === false) {
      return '/onboarding';
    }
    return '/onboarding/acquisition';
  }
  if (!user.registration_complete) return '/register/steps';
  if (user.commercial_access_required) return '/meu-plano?reason=payment_required';
  return '/dashboard';
}

/** Prefixos do app CRM (tenant); super admin plataforma não deve permanecer aqui. */
export const TENANT_CRM_PATH_PREFIXES: readonly string[] = [
  '/dashboard',
  '/chat',
  '/clients',
  '/leads',
  '/funnel',
  '/tasks',
  '/projects',
  '/products',
  '/proposals',
  '/contracts',
  '/customer-invoices',
  '/customer-charges',
  '/finance',
  '/orders',
  '/tickets',
  '/settings',
  '/messages',
  '/members',
  '/meu-plano',
  '/register/steps',
  '/onboarding',
];

export function isTenantCrmPath(pathname: string): boolean {
  const p = pathname.split('?')[0] || '';
  return TENANT_CRM_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}
