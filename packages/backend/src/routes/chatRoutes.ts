import { Router } from 'express';
import { tenantAuthCrm, requireFeature } from '../middleware/auth.js';
import {
  createInstance,
  listInstances,
  connectInstance,
  getInstanceStatus,
  deleteInstance,
  patchInstance,
  syncConversations,
  getConversations,
  getConversationMessages,
  getConversationProfile,
  getClientMessages,
  sendMessage,
  configureInstanceWebhook,
  getInstanceWebhook,
  forceConfigureWebhook,
  syncConversationMessages,
  refreshConversationIdentity,
  markConversationRead,
  linkConversation,
  unlinkConversation,
  getCrmWhatsappIdentity,
} from '../controllers/chatController.js';

const router = Router();

router.use(...tenantAuthCrm);
router.use(requireFeature('chat'));

router.get('/crm-whatsapp-identity', getCrmWhatsappIdentity);
router.get('/instances', listInstances);
router.post('/instances', createInstance);
router.post('/instances/:id/connect', connectInstance);
router.get('/instances/:id/status', getInstanceStatus);
router.delete('/instances/:id', deleteInstance);
router.patch('/instances/:id', patchInstance);
router.get('/instances/:id/webhook', getInstanceWebhook);
router.post('/instances/:id/webhook', configureInstanceWebhook);
router.post('/instances/:id/webhook/force', forceConfigureWebhook);
router.post('/conversations/sync', syncConversations);
router.get('/conversations', getConversations);
router.get('/conversations/:id/messages', getConversationMessages);
router.get('/conversations/:id/profile', getConversationProfile);
router.post('/conversations/:id/link', linkConversation);
router.delete('/conversations/:id/link', unlinkConversation);
router.get('/clients/:id/messages', getClientMessages);
router.post('/conversations/:id/messages/sync', syncConversationMessages);
router.post('/conversations/:id/refresh-identity', refreshConversationIdentity);
router.post('/messages', sendMessage);
router.post('/conversations/:id/mark-read', markConversationRead);

export default router;

