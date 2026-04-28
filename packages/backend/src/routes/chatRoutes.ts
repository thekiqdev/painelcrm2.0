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
  getConversationAttendanceCounts,
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
import {
  attendConversation,
  patchConversationAttendance,
  transferConversation,
  getConversationAssignmentHistory,
} from '../controllers/chatAttendanceController.js';
import {
  getChatQueues,
  postChatQueue,
  patchChatQueue,
  getChatMetrics,
  getChatTransfers,
  patchConversationAssign,
  patchConversationTransfer,
  patchConversationStatusAlias,
  patchConversationQueueAlias,
  patchConversationTeamAlias,
  chatTeamsList,
  chatTeamsCreate,
  chatTeamsPatch,
  chatTeamMembersList,
  chatTeamMembersAdd,
  chatTeamMembersRemove,
} from '../controllers/chatProfessionalController.js';

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
router.get('/conversations/attendance-counts', getConversationAttendanceCounts);
router.get('/metrics', getChatMetrics);
router.get('/queues', getChatQueues);
router.post('/queues', postChatQueue);
router.patch('/queues/:id', patchChatQueue);
router.get('/conversations', getConversations);
router.post('/conversations/:id/attend', attendConversation);
router.post('/conversations/:id/transfer', transferConversation);
router.patch('/conversations/:id/assign', patchConversationAssign);
router.patch('/conversations/:id/transfer', patchConversationTransfer);
router.patch('/conversations/:id/status', patchConversationStatusAlias);
router.patch('/conversations/:id/queue', patchConversationQueueAlias);
router.patch('/conversations/:id/team', patchConversationTeamAlias);
router.get('/conversations/:id/transfers', getChatTransfers);
router.patch('/conversations/:id/attendance', patchConversationAttendance);
router.get('/conversations/:id/attendance/history', getConversationAssignmentHistory);
router.get('/teams', chatTeamsList);
router.post('/teams', chatTeamsCreate);
router.patch('/teams/:id', chatTeamsPatch);
router.get('/teams/:teamId/members', chatTeamMembersList);
router.post('/teams/:teamId/members', chatTeamMembersAdd);
router.delete('/teams/:teamId/members/:memberId', chatTeamMembersRemove);
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

