/**
 * GET /api/public/tenant-host?domain=
 * TD S2 — contexto público do host customizado (loja | abertura de chamados).
 */
import type { Request, Response } from 'express';
import { normalizeHostname } from '../partner/partnerBrandResolver.js';
import { resolveTenantHostByHostname } from './tenantHostResolver.js';

export async function publicGetTenantHost(req: Request, res: Response): Promise<void> {
  try {
    const q = typeof req.query.domain === 'string' ? req.query.domain : null;
    const hostHeader = req.get('x-forwarded-host') || req.get('host') || null;
    const host = normalizeHostname(q) || normalizeHostname(hostHeader);

    if (!host) {
      res.json({ host: null, platform: true });
      return;
    }

    // Partner WL tem prioridade — se o host é Partner, não expor tenant host
    try {
      const { resolvePartnerBrandByHost } = await import('../partner/partnerBrandResolver.js');
      const partner = await resolvePartnerBrandByHost(host);
      if (partner) {
        res.json({ host: null, platform: false, partner: true });
        return;
      }
    } catch {
      /* ignore partner lookup failures */
    }

    const resolved = await resolveTenantHostByHostname(host);
    if (!resolved) {
      res.json({ host: null, platform: true });
      return;
    }

    res.json({
      host: {
        id: resolved.host_id,
        hostname: resolved.hostname,
        role: resolved.role,
        status: resolved.status,
        tenant_id: resolved.tenant_id,
        tenant_name: resolved.tenant_name,
        tenant_slug: resolved.tenant_slug,
        logo_url: resolved.logo_url,
        store_slug: resolved.store_slug,
        support_portal_slug: resolved.support_portal_slug,
        support_portal_enabled: resolved.support_portal_enabled,
      },
      platform: false,
      partner: false,
    });
  } catch (err) {
    console.error('[publicGetTenantHost]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
