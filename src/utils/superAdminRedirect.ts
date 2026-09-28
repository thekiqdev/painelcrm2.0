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

/** Admin ou seller do canal Partner (M5) — home em /partner, sem onboarding SaaS. */
export function isPartnerChannelUser(user: {
  account_type?: string | null;
  partner_membership_role?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.account_type === 'partner') return true;
  const role = user.partner_membership_role;
  return role === 'partner_admin' || role === 'partner_seller';
}

/** Destino após login ou quando já autenticado na tela de login. */
export function getPostAuthHomePath(user: {
  is_super_admin?: boolean;
  tenant_id?: string | null;
  registration_complete?: boolean;
  onboarding_completed?: boolean;
  commercial_access_required?: boolean;
  account_type?: string | null;
  partner_membership_role?: string | null;
} | null | undefined): string {
  if (!user) return '/login';
  if (isSuperAdminPlatformUser(user)) return '/superadmin';
  if (isPartnerChannelUser(user)) return '/partner';
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
  '/plano',
  '/planos',
  '/register/steps',
  '/onboarding',
];

export function isTenantCrmPath(pathname: string): boolean {
  const p = pathname.split('?')[0] || '';
  return TENANT_CRM_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}
