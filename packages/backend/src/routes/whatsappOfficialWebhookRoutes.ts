import { Router } from 'express';
import express from 'express';
import * as c from '../controllers/whatsappOfficialWebhookController.js';

const router = Router();

router.get('/', c.getWhatsappOfficialWebhook);
router.post('/', express.raw({ type: 'application/json', limit: '12mb' }), c.postWhatsappOfficialWebhook);

export default router;
