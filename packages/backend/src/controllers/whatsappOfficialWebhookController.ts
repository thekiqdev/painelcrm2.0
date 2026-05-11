import type { Request, Response } from 'express';
import { matchWebhookVerifyToken } from '../services/whatsappOfficial/whatsappOfficialConfigService.js';
import {
  verifyWebhookSignature,
  processWhatsappOfficialWebhookPayload,
} from '../services/whatsappOfficial/whatsappOfficialWebhookService.js';

export async function getWhatsappOfficialWebhook(req: Request, res: Response): Promise<void> {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && typeof token === 'string' && typeof challenge === 'string') {
    const ok = await matchWebhookVerifyToken(token);
    if (ok) {
      console.log(JSON.stringify({ event: 'meta_webhook_verified', hub_mode: mode }));
      res.status(200).type('text/plain').send(challenge);
      return;
    }
  }
  res.status(403).json({ error: 'Forbidden' });
}

export async function postWhatsappOfficialWebhook(req: Request, res: Response): Promise<void> {
  try {
    const raw = req.body as Buffer;
    if (!Buffer.isBuffer(raw)) {
      res.status(400).json({ error: 'Body inválido' });
      return;
    }
    const sig = req.get('x-hub-signature-256');
    console.log(JSON.stringify({ event: 'meta_webhook_received', bytes: raw.length }));
    const okSig = await verifyWebhookSignature(raw, sig);
    if (!okSig) {
      res.status(403).json({ error: 'Assinatura inválida' });
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      res.status(400).json({ error: 'JSON inválido' });
      return;
    }
    await processWhatsappOfficialWebhookPayload(body);
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('[wa-official webhook] POST', e);
    res.status(500).json({ error: 'Erro ao processar' });
  }
}
