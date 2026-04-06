import { Router } from 'express';
import * as messagesController from '../controllers/messagesController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

router.post('/send', messagesController.sendNotificationMessage);

export default router;


