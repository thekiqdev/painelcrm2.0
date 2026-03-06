import { Router } from 'express';
import * as messagesController from '../controllers/messagesController.js';
import { tenantAuth } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuth);

router.post('/send', messagesController.sendNotificationMessage);

export default router;


