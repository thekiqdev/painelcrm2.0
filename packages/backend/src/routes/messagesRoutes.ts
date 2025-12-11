import { Router } from 'express';
import * as messagesController from '../controllers/messagesController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.post('/send', authenticateToken, messagesController.sendNotificationMessage);

export default router;


