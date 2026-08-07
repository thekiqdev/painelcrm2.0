/**
 * Webhook de entrada público — POST /webhooks/chatbot-flows/:token
 * Sem JWT. Secret opcional via X-PainelCRM-Signature.
 * S29.1 — rate limit dedicado por token.
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../utils/db.js';
import {
  extractWebhookInFromGraph,
  verifyInboundWebhookSignature,
} from '../services/chatbotFlows/flowWebhookIn.js';
import { runChatbotFlowsRuntimeFromWebhook } from '../services/chatbotFlows/chatbotFlowsRuntimeRunner.js';
import { chatbotFlowsInboundWebhookLimiter } from '../services/chatbotFlows/flowWebhookRateLimit.js';

const router = Router();

router.get('/:token', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    provider: 'chatbot_flows',
    webhook: 'inbound',
    method: 'POST',
    conversation_id: 'optional',
    hint: 'Com conversation_id: comportamento legado. Sem: sessão órfã até ensure_conversation (S28.1/S29).',
  });
});

router.post('/:token', chatbotFlowsInboundWebhookLimiter, async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      res.status(400).json({ error: 'token_obrigatorio' });
      return;
    }

    const lookup = await pool.query(
      `SELECT f.id, v.graph_json
       FROM chatbot_flows f
       INNER JOIN chatbot_flow_versions v ON v.id = f.published_version_id
       WHERE f.inbound_webhook_token = $1
         AND f.status = 'active'
         AND f.published_version_id IS NOT NULL
       LIMIT 1`,
      [token]
    );
    const row = lookup.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ error: 'webhook_nao_encontrado' });
      return;
    }

    const graph =
      row.graph_json && typeof row.graph_json === 'object'
        ? (row.graph_json as { nodes?: unknown[] })
        : { nodes: [] };
    const wh = extractWebhookInFromGraph(graph);
    if (!wh) {
      res.status(404).json({ error: 'webhook_inconsistente' });
      return;
    }

    const rawBody =
      typeof req.body === 'string'
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body
          : JSON.stringify(req.body ?? {});

    const sig =
      (req.get('x-painelcrm-signature') || req.get('X-PainelCRM-Signature') || undefined) ??
      undefined;
    if (!verifyInboundWebhookSignature({ secret: wh.secret, rawBody, signatureHeader: sig })) {
      res.status(401).json({ error: 'assinatura_invalida' });
      return;
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
      string,
      unknown
    >;
    // S28.1 — conversation_id opcional (sessão órfã até ensure_conversation)
    const conversationIdRaw = String(body.conversation_id || body.conversationId || '').trim();
    const conversationId = conversationIdRaw || null;

    const variables =
      body.variables && typeof body.variables === 'object' && !Array.isArray(body.variables)
        ? (body.variables as Record<string, unknown>)
        : undefined;

    const result = await runChatbotFlowsRuntimeFromWebhook({
      token,
      conversationId,
      variables,
      rawPayload: body,
    });

    if (!result.ok) {
      console.warn(
        JSON.stringify({
          event: 'chatbot_flows_runtime',
          reason: 'webhook',
          error: result.error,
          status: result.status,
        })
      );
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(200).json({
      ok: true,
      session_id: result.sessionId,
      flow_id: result.flowId,
    });
  } catch (e) {
    console.warn('[chatbot_flows_webhook_in] failed', e);
    res.status(500).json({ error: 'webhook_failed' });
  }
});

export default router;
