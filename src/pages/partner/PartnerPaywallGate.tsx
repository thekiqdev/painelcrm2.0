import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePartnerPanel } from './PartnerPanelContext';

/** Rotas liberadas com canal past_due/canceled (pagamento + perfil mínimo). */
const PAYWALL_ALLOWED_PREFIXES = [
  '/partner/platform-plan',
  '/partner/config/identity',
];

function isPaywallAllowedPath(pathname: string): boolean {
  if (pathname === '/partner' || pathname === '/partner/') return true;
  return PAYWALL_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function isPartnerPaywallActive(wholesaleStatus: string | null | undefined): boolean {
  return wholesaleStatus === 'past_due' || wholesaleStatus === 'canceled';
}

/**
 * Block S2 — admin em past_due só acessa overview, identidade e Plano Platform (pagar).
 */
export default function PartnerPaywallGate({ children }: { children: React.ReactNode }) {
  const { me, isAdmin, loading } = usePartnerPanel();
  const { pathname } = useLocation();

  if (loading || !me) return <>{children}</>;
  if (!isAdmin) return <>{children}</>;
  if (!isPartnerPaywallActive(me.wholesale_status)) return <>{children}</>;
  if (isPaywallAllowedPath(pathname)) return <>{children}</>;

  return <Navigate to="/partner/platform-plan" replace />;
}
