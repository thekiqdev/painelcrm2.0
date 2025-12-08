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
  getClientMessages,
  getConversationProfile,
  sendMessage,
  configureInstanceWebhook,
  getInstanceWebhook,
  forceConfigureWebhook,
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
router.get('/instances/:id/webhook', getInstanceWebhook);
router.post('/instances/:id/webhook', configureInstanceWebhook);
router.post('/instances/:id/webhook/force', forceConfigureWebhook);
router.post('/conversations/sync', syncConversations);
router.get('/conversations', getConversations);
// Rotas específicas de clients devem vir antes das rotas genéricas de conversations
// IMPORTANTE: Esta rota deve vir antes de /conversations/:id/* para evitar conflitos
router.get('/clients/:clientId/messages', getClientMessages);
router.get('/conversations/:id/messages', getConversationMessages);
router.get('/conversations/:id/profile', getConversationProfile);
router.post('/conversations/:id/messages/sync', syncConversationMessages);
router.post('/messages', sendMessage);
router.post('/conversations/:id/mark-read', markConversationRead);

export default router;

