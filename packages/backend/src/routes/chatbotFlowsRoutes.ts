import { Router } from 'express';
import { chatbotFlowsAuth } from '../middleware/auth.js';
import {
  archiveChatbotFlowHandler,
  createChatbotFlowHandler,
  duplicateChatbotFlowHandler,
  exportChatbotFlowHandler,
  getChatbotFlowHandler,
  importChatbotFlowHandler,
  listChatbotFlowsHandler,
  listChatbotFlowVersionsHandler,
  patchChatbotFlowHandler,
  previewImportChatbotFlowHandler,
  publishChatbotFlowHandler,
  restoreChatbotFlowVersionHandler,
  deleteChatbotFlowVersionHandler,
  revertChatbotFlowToDraftHandler,
  testChatbotFlowIntegrationHandler,
  startWebhookInListenHandler,
  pollWebhookInListenHandler,
  cancelWebhookInListenHandler,
  getWebhookInSampleHandler,
  rotateWebhookInSampleHandler,
  startChatbotFlowSessionHandler,
} from '../controllers/chatbotFlowsController.js';

const router = Router();
router.use(...chatbotFlowsAuth);

router.get('/', listChatbotFlowsHandler);
router.post('/', createChatbotFlowHandler);
router.post('/import', importChatbotFlowHandler);
router.post('/import/preview', previewImportChatbotFlowHandler);
router.post('/test-integration', testChatbotFlowIntegrationHandler);
router.post('/sessions/start', startChatbotFlowSessionHandler);
router.get('/:id', getChatbotFlowHandler);
router.patch('/:id', patchChatbotFlowHandler);
router.post('/:id/archive', archiveChatbotFlowHandler);
router.post('/:id/publish', publishChatbotFlowHandler);
router.post('/:id/revert-draft', revertChatbotFlowToDraftHandler);
router.get('/:id/versions', listChatbotFlowVersionsHandler);
router.post('/:id/versions/:version/restore', restoreChatbotFlowVersionHandler);
router.delete('/:id/versions/:version', deleteChatbotFlowVersionHandler);
router.get('/:id/export', exportChatbotFlowHandler);
router.post('/:id/duplicate', duplicateChatbotFlowHandler);
router.post('/:id/webhook-in-listen', startWebhookInListenHandler);
router.get('/:id/webhook-in-listen/:listenId', pollWebhookInListenHandler);
router.delete('/:id/webhook-in-listen/:listenId', cancelWebhookInListenHandler);
router.get('/:id/webhook-in-sample', getWebhookInSampleHandler);
router.post('/:id/webhook-in-sample/rotate', rotateWebhookInSampleHandler);

export default router;
