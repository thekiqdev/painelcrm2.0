import { Router } from 'express';
import express from 'express';
import { stripeTenantWebhookHandler } from '../modules/gateways/stripe/stripeTenantWebhook.js';

const router = Router();

router.post('/:tenantId', express.raw({ type: 'application/json', limit: '2mb' }), (req, res) => {
  void stripeTenantWebhookHandler(req, res);
});

export default router;
