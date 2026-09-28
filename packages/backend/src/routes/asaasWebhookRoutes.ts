/**
 * Rota do webhook Asaas (POST /webhooks/asaas).
 * Sem JWT; validação de origem por ASAAS_WEBHOOK_SECRET se configurado.
 */
import { Router } from 'express';
import { asaasWebhookHandler } from '../modules/gateways/asaas/index.js';

const router = Router();

router.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', provider: 'asaas', webhook: 'ready' });
});

// Aceita "/" e subpaths para tolerar variações de URL configurada no provedor.
router.post('*', asaasWebhookHandler);

export default router;
