/**
 * Ingest público one-shot — POST /webhooks/chatbot-flows-listen/:listenId
 * Não dispara runtime; só captura body para o editor (S27.1).
 */
import { Router, type Request, type Response } from 'express';
import { ingestWebhookInListenPayload } from '../services/chatbotFlows/flowWebhookInListen.js';

const router = Router();

router.get('/:listenId', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    provider: 'chatbot_flows',
    webhook: 'inbound_listen',
    method: 'POST',
    note: 'Envie um POST com JSON enquanto o editor estiver ouvindo.',
  });
});

router.post('/:listenId', (req: Request, res: Response) => {
  try {
    const listenId = String(req.params.listenId || '').trim();
    if (!listenId) {
      res.status(400).json({ error: 'listen_id_obrigatorio' });
      return;
    }
    const result = ingestWebhookInListenPayload({
      listenId,
      body: req.body,
      contentType: req.get('content-type'),
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(200).json({
      ok: true,
      listen: true,
      message: 'Payload capturado. Volte ao editor do PainelCRM.',
    });
  } catch (e) {
    console.warn('[chatbot_flows_webhook_in_listen] failed', e);
    res.status(500).json({ error: 'listen_failed' });
  }
});

export default router;
