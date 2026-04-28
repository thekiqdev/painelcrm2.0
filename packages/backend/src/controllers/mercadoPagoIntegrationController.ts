import type { Request, Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import {
  isMercadoPagoGatewayEnabled,
  getMercadoPagoFrontendRedirectBase,
} from '../config/mercadoPagoGatewayEnv.js';
import {
  buildMercadoPagoConnectUrl,
  getMercadoPagoAvailabilitySync,
  getMercadoPagoIntegrationStatus,
  handleMercadoPagoOAuthCallback,
  testMercadoPagoIntegration,
  disconnectMercadoPagoIntegration,
} from '../services/mercadoPagoIntegrationService.js';

function getTenantId(req: AuthRequest): string | null {
  return req.tenantId ?? null;
}

/** Público: permite ao front saber se o módulo está habilitado sem autenticação. */
export async function getMercadoPagoAvailability(req: Request, res: Response): Promise<void> {
  void req;
  res.json(getMercadoPagoAvailabilitySync());
}

export async function getMercadoPagoConnectUrl(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req as AuthRequest);
    const userId = (req as AuthRequest).userId;
    if (!tenantId || !userId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    const url = await buildMercadoPagoConnectUrl({ tenantId, userId });
    res.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
}

/**
 * Callback OAuth (público). Valida state; se feature desligada, redireciona com erro.
 */
export async function getMercadoPagoOAuthCallback(req: Request, res: Response): Promise<void> {
  const front = getMercadoPagoFrontendRedirectBase();
  if (!isMercadoPagoGatewayEnabled()) {
    res.redirect(`${front}/settings/payments?mp_oauth=disabled`);
    return;
  }
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const err = typeof req.query.error === 'string' ? req.query.error : undefined;
    const { redirectUrl } = await handleMercadoPagoOAuthCallback({ code, state, error: err });
    res.redirect(redirectUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const q = new URLSearchParams({ mp_oauth: 'error', mp_oauth_msg: msg.slice(0, 200) });
    res.redirect(`${front}/settings/payments/mercado_pago?${q.toString()}`);
  }
}

export async function postMercadoPagoTest(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req as AuthRequest);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    const result = await testMercadoPagoIntegration(tenantId);
    res.json({ ok: result.ok, status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
}

export async function getMercadoPagoStatus(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req as AuthRequest);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    const status = await getMercadoPagoIntegrationStatus(tenantId);
    const avail = getMercadoPagoAvailabilitySync();
    res.json({
      ...status,
      feature_enabled: avail.enabled,
      oauth_client_configured: avail.oauth_client_configured,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
}

export async function postMercadoPagoDisconnect(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req as AuthRequest);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    await disconnectMercadoPagoIntegration(tenantId);
    const status = await getMercadoPagoIntegrationStatus(tenantId);
    res.json({ ok: true, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
}
