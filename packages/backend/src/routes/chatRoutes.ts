import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  createInstance,
  listInstances,
  connectInstance,
  getInstanceStatus,
  deleteInstance,
  syncConversations,
  getConversations,
  getConversationMessages,
  sendMessage,
  configureInstanceWebhook,
  syncConversationMessages,
  markConversationRead,
} from '../controllers/chatController.js';

const router = Router();

router.use(authenticateToken);

router.get('/instances', listInstances);
router.post('/instances', createInstance);
router.post('/instances/:id/connect', connectInstance);
router.get('/instances/:id/status', getInstanceStatus);
router.delete('/instances/:id', deleteInstance);
router.post('/instances/:id/webhook', configureInstanceWebhook);
router.post('/conversations/sync', syncConversations);
router.get('/conversations', getConversations);
router.get('/conversations/:id/messages', getConversationMessages);
router.post('/conversations/:id/messages/sync', syncConversationMessages);
router.post('/messages', sendMessage);
router.post('/conversations/:id/mark-read', markConversationRead);

export default router;

