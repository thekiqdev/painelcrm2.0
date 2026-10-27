import { Router } from 'express';
import express from 'express';
import { stripePlatformWebhookHandler } from '../modules/gateways/stripe/stripePlatformWebhook.js';

const router = Router();

router.post('/', express.raw({ type: 'application/json', limit: '2mb' }), (req, res) => {
  void stripePlatformWebhookHandler(req, res);
});

export default router;
