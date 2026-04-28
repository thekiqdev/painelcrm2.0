import type { Request, Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import {
  connectAsaasIntegration,
  getAsaasIntegrationStatus,
  recreateAsaasWebhook,
  testAsaasIntegration,
  type AsaasEnvironment,
} from '../services/asaasIntegrationService.js';

function getTenantId(req: AuthRequest): string | null {
  return req.tenantId ?? null;
}

function getPublicApiUrl(_req: Request): string {
  const fromEnv = String(process.env.PUBLIC_API_URL || '').trim();
  if (fromEnv) return fromEnv;
  return '';
}

export async function postAsaasConnect(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req as AuthRequest);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    const { environment, apiKey, webhookEmail, webhookAuthTokenManual } = req.body ?? {};
    const env = String(environment || '').trim().toLowerCase();
    if (env !== 'sandbox' && env !== 'production') {
      res.status(400).json({ error: 'Ambiente inválido. Use sandbox ou production.' });
      return;
    }
    const status = await connectAsaasIntegration({
      tenantId,
      environment: env as AsaasEnvironment,
      apiKey: String(apiKey || ''),
      webhookEmail: typeof webhookEmail === 'string' ? webhookEmail : null,
      webhookAuthTokenManual:
        typeof webhookAuthTokenManual === 'string' ? webhookAuthTokenManual : null,
      fallbackEmail: (req as AuthRequest).user?.email ?? null,
      publicApiUrl: getPublicApiUrl(req),
    });
    res.json({ ok: true, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
}

export async function postAsaasTest(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req as AuthRequest);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    const { environment, apiKey } = req.body ?? {};
    const result = await testAsaasIntegration({
      tenantId,
      environment: environment as AsaasEnvironment | undefined,
      apiKey: typeof apiKey === 'string' ? apiKey : undefined,
    });
    res.json({ ok: true, connected: result.connected, status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
}

export async function postAsaasRecreateWebhook(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req as AuthRequest);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    const { webhookEmail, webhookAuthTokenManual } = req.body ?? {};
    const status = await recreateAsaasWebhook({
      tenantId,
      webhookEmail: typeof webhookEmail === 'string' ? webhookEmail : null,
      webhookAuthTokenManual:
        typeof webhookAuthTokenManual === 'string' ? webhookAuthTokenManual : null,
      fallbackEmail: (req as AuthRequest).user?.email ?? null,
      publicApiUrl: getPublicApiUrl(req),
    });
    res.json({ ok: true, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
}

export async function getAsaasStatus(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req as AuthRequest);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    const status = await getAsaasIntegrationStatus(tenantId);
    res.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
}
