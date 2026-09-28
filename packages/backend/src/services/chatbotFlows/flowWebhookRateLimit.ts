/**
 * S29.1 — rate limit dedicado dos webhooks públicos de chatbot-flows.
 */
import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

function parseMax(envKey: string, fallback: number): number {
  const n = parseInt(String(process.env[envKey] || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function rateLimitedHandler(kind: 'webhook' | 'sample') {
  return (req: Request, res: Response) => {
    console.log(
      JSON.stringify({
        event: 'chatbot_flows_runtime',
        reason: kind === 'webhook' ? 'webhook' : 'webhook_sample',
        error: 'rate_limited',
        token_prefix: String(req.params.token || req.params.sampleToken || '').slice(0, 8) || null,
      })
    );
    res.status(429).json({ error: 'rate_limited' });
  };
}

/** Produção: POST /webhooks/chatbot-flows/:token (default 60/min por IP+token). */
export const chatbotFlowsInboundWebhookLimiter = rateLimit({
  windowMs: 60_000,
  max: parseMax('RATE_LIMIT_CHATBOT_FLOWS_WEBHOOK_MAX', 60),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${req.ip || ''}:cf_wh:${String(req.params.token || '').trim() || 'unknown'}`,
  handler: rateLimitedHandler('webhook'),
  skip: () => process.env.NODE_ENV === 'test' || process.env.VITEST === 'true',
});

/** Amostra: POST /webhooks/chatbot-flows-sample/:sampleToken (default 120/min). */
export const chatbotFlowsSampleWebhookLimiter = rateLimit({
  windowMs: 60_000,
  max: parseMax('RATE_LIMIT_CHATBOT_FLOWS_SAMPLE_WEBHOOK_MAX', 120),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${req.ip || ''}:cf_sample:${String(req.params.sampleToken || '').trim() || 'unknown'}`,
  handler: rateLimitedHandler('sample'),
  skip: () => process.env.NODE_ENV === 'test' || process.env.VITEST === 'true',
});
