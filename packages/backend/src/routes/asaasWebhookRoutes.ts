/**
 * Rota do webhook Asaas (POST /webhooks/asaas).
 * Sem JWT; validação de origem por ASAAS_WEBHOOK_SECRET se configurado.
 */
import { Router } from 'express';
import { asaasWebhookHandler } from '../modules/gateways/asaas/index.js';

const router = Router();

router.post('/', asaasWebhookHandler);

export default router;
