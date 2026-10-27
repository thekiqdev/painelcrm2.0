import { Request, Response } from 'express';
import { createPublicLead } from './apiV1LeadService.js';
import { extractApiKeyFromRequest, readIdempotencyKey } from './extractApiKey.js';
import { logApiV1Request } from './apiV1UsageLog.js';

const ROUTE = 'POST /api/v1/leads';

export async function postV1Lead(req: Request, res: Response): Promise<void> {
  const secret = extractApiKeyFromRequest(req);
  if (!secret) {
    logApiV1Request({ keyId: null, route: ROUTE, status: 401 });
    res.status(401).json({ error: 'API key inválida.' });
    return;
  }
  const idem = readIdempotencyKey(req);
  if (idem.error) {
    logApiV1Request({ keyId: null, route: ROUTE, status: 400 });
    res.status(400).json({ error: idem.error });
    return;
  }
  try {
    const result = await createPublicLead({
      secret,
      body: req.body,
      idempotencyKey: idem.key,
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    logApiV1Request({ keyId: null, route: ROUTE, status: 500 });
    console.error('postV1Lead:', error instanceof Error ? error.name : 'error');
    res.status(500).json({ error: 'Internal server error' });
  }
}
