/**
 * PE Etapa 5 — hosts que o Partner não pode usar como custom_domain.
 */

import { normalizeHostname } from './partnerBrandResolver.js';
import { getPartnerWlCnameTarget } from '../config/partnerCloudflareSaasEnv.js';

function hostFromUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const withScheme = raw.includes('://') ? raw : `https://${raw}`;
    return normalizeHostname(new URL(withScheme).hostname);
  } catch {
    return normalizeHostname(raw);
  }
}

/** Lista bloqueada: env + hosts da plataforma + CNAME target SaaS. */
export function getPartnerBlockedHosts(): string[] {
  const fromEnv = (process.env.PARTNER_WL_BLOCKED_HOSTS || 'localhost,127.0.0.1')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const extras = [
    hostFromUrl(process.env.FRONTEND_URL),
    hostFromUrl(process.env.PUBLIC_APP_URL),
    hostFromUrl(process.env.VITE_APP_URL),
    normalizeHostname(getPartnerWlCnameTarget()),
    'painelcrm.com',
    'www.painelcrm.com',
  ].filter((h): h is string => Boolean(h));

  return Array.from(new Set([...fromEnv, ...extras]));
}
