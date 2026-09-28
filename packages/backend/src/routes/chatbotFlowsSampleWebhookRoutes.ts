/**
 * Ingest público — POST /webhooks/chatbot-flows-sample/:sampleToken
 * Captura payload estável (S28); não dispara runtime.
 * S29.1 — rate limit dedicado.
 */
import { Router, type Request, type Response } from 'express';
import { ingestWebhookInSamplePayload } from '../services/chatbotFlows/flowWebhookInSample.js';
import { chatbotFlowsSampleWebhookLimiter } from '../services/chatbotFlows/flowWebhookRateLimit.js';

const router = Router();

router.get('/:sampleToken', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    provider: 'chatbot_flows',
    webhook: 'inbound_sample',
    method: 'POST',
    note: 'URL fixa de amostra. POST JSON atualiza o sample no editor; não inicia o flow.',
  });
});

router.post(
  '/:sampleToken',
  chatbotFlowsSampleWebhookLimiter,
  async (req: Request, res: Response) => {
    try {
      const sampleToken = String(req.params.sampleToken || '').trim();
      if (!sampleToken) {
        res.status(400).json({ error: 'token_obrigatorio' });
        return;
      }
      const result = await ingestWebhookInSamplePayload({
        sampleToken,
        body: req.body,
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(200).json({
        ok: true,
        sample: true,
        flow_id: result.flowId,
        message: 'Payload capturado. Abra o editor do Webhook in no PainelCRM para mapear.',
      });
    } catch (e) {
      console.warn('[chatbot_flows_webhook_in_sample] failed', e);
      res.status(500).json({ error: 'sample_failed' });
    }
  }
);

export default router;
