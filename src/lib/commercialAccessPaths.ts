/**
 * Rotas do frontend onde o utilizador pode permanecer apesar de 402 (plano / período comercial).
 * Evita redirecionamento em loop durante checkout, pagamento interno e auth.
 */
export function isCommercialHubFrontendPath(pathname: string): boolean {
  const p = pathname || '';
  if (p === '/meu-plano') return true;
  if (p.startsWith('/checkout')) return true;
  if (p.startsWith('/saas-billing')) return true;
  if (p === '/login' || p === '/register' || p.startsWith('/register/')) return true;
  if (p === '/') return true;
  if (p.startsWith('/contract-view/') || p.startsWith('/contract-sign/')) return true;
  if (p.startsWith('/proposal-view/') || p.startsWith('/pay/')) return true;
  return false;
}

export const COMMERCIAL_402_REDIRECT_FLAG = 'painelcrm_commercial_402_redirect';

/** Chamado pelo ApiClient ao receber 402 (ex.: PLAN_EXPIRED): uma navegação full page evita rajadas de pedidos ao painel. */
export function redirectIfPaymentRequiredFromApi(): void {
  if (typeof window === 'undefined') return;
  if (!localStorage.getItem('auth_token')) return;
  const path = window.location.pathname || '';
  if (isCommercialHubFrontendPath(path)) return;
  if (sessionStorage.getItem(COMMERCIAL_402_REDIRECT_FLAG) === '1') return;
  sessionStorage.setItem(COMMERCIAL_402_REDIRECT_FLAG, '1');
  window.location.assign('/meu-plano?reason=payment_required');
}
