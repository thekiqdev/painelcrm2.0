import { Router } from 'express';
import { tenantAuthCrm, requireFeature } from '../middleware/auth.js';
import {
  createInstance,
  listInstances,
  connectInstance,
  getInstanceStatus,
  retryInitialInstanceSync,
  deleteInstance,
  patchInstance,
  syncConversations,
  getChatRuntimeConfig,
  getConversations,
  getConversationAttendanceCounts,
  getConversationMessages,
  getConversationProfile,
  getClientMessages,
  sendMessage,
  prepareLeadConversation,
  resolveConversationForClient,
  patchPreparedConversationInstance,
  configureInstanceWebhook,
  getInstanceWebhook,
  forceConfigureWebhook,
  reconfigureInstanceWebhook,
  rotateInstanceWebhookSecret,
  repairInstanceWebhook,
  syncConversationMessages,
  refreshConversationIdentity,
  markConversationRead,
  linkConversation,
  unlinkConversation,
  systemDeleteConversation,
  getCrmWhatsappIdentity,
  getChatTenantUsersForGroupInvite,
  postChatCreateGroupFromConversation,
} from '../controllers/chatController.js';
import {
  deleteConversationKanbanTag,
  getConversationKanbanTags,
  postConversationKanbanTag,
} from '../controllers/chatConversationKanbanTagsController.js';
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
  getChatOperationsDashboard,
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
import {
  deleteChatAutomationRule,
  getChatAutomationSettings,
  listChatAutomationRules,
  listChatQueueDistribution,
  patchChatAutomationRule,
  patchChatAutomationSettings,
  postChatAutomationRule,
  putChatQueueDistribution,
  getChatAutomationLogs,
} from '../controllers/chatAutomationController.js';
import {
  deleteChatBotRuleRoute,
  getChatBotRules,
  patchChatBotRule,
  postChatBotRule,
} from '../controllers/chatBotRulesController.js';
import {
  postChatConversationCreateMeetNow,
  postChatConversationScheduleAppointment,
} from '../controllers/chatAppointmentsController.js';
import {
  getConversationScheduledMessages,
  patchChatScheduledMessage,
  postChatScheduledMessageCancel,
  postConversationScheduledMessages,
} from '../controllers/chatScheduledMessagesController.js';
import { getChatAvatarProxy } from '../controllers/chatAvatarProxyController.js';
import {
  deleteCrmNote,
  deleteMessageComment,
  getMessageComments,
  listCrmNotes,
  patchCrmNote,
  patchMessageComment,
  postCrmNote,
  postMessageComment,
} from '../controllers/chatCollaborationController.js';
import {
  getChatGroupDetails,
  getChatGroupParticipants,
  postChatGroupDescription,
  postChatGroupImage,
  postChatGroupLeave,
  postChatGroupName,
  postChatGroupParticipants,
  postChatGroupResetInvite,
  postChatGroupSettings,
  postChatGroupParticipantSyncProfile,
  postChatGroupParticipantsSyncMissing,
} from '../controllers/chatGroupController.js';

const router = Router();

router.use(...tenantAuthCrm);
router.use(requireFeature('chat'));

router.get('/avatar-proxy', getChatAvatarProxy);
router.get('/crm-whatsapp-identity', getCrmWhatsappIdentity);
router.get('/instances', listInstances);
router.post('/instances', createInstance);
router.post('/instances/:id/connect', connectInstance);
router.get('/instances/:id/status', getInstanceStatus);
router.post('/instances/:id/initial-sync/retry', retryInitialInstanceSync);
router.delete('/instances/:id', deleteInstance);
router.patch('/instances/:id', patchInstance);
router.get('/instances/:id/webhook', getInstanceWebhook);
router.post('/instances/:id/webhook', configureInstanceWebhook);
router.post('/instances/:id/webhook/force', forceConfigureWebhook);
router.post('/instances/:id/webhook/reconfigure', reconfigureInstanceWebhook);
router.post('/instances/:id/webhook/rotate-secret', rotateInstanceWebhookSecret);
router.post('/instances/:id/repair-webhook', repairInstanceWebhook);
router.get('/runtime-config', getChatRuntimeConfig);
router.get('/tenant-users-for-group', getChatTenantUsersForGroupInvite);
router.post('/conversations/sync', syncConversations);
router.get('/conversations/attendance-counts', getConversationAttendanceCounts);
router.get('/metrics', getChatMetrics);
router.get('/operations-dashboard', getChatOperationsDashboard);
router.get('/automation/settings', getChatAutomationSettings);
router.patch('/automation/settings', patchChatAutomationSettings);
router.get('/automation/rules', listChatAutomationRules);
router.post('/automation/rules', postChatAutomationRule);
router.patch('/automation/rules/:id', patchChatAutomationRule);
router.delete('/automation/rules/:id', deleteChatAutomationRule);
router.get('/automation/queue-distribution', listChatQueueDistribution);
router.put('/automation/queues/:queueId/distribution', putChatQueueDistribution);
router.get('/automation/logs', getChatAutomationLogs);
router.get('/bot-rules', getChatBotRules);
router.post('/bot-rules', postChatBotRule);
router.patch('/bot-rules/:id', patchChatBotRule);
router.delete('/bot-rules/:id', deleteChatBotRuleRoute);
router.get('/queues', getChatQueues);
router.post('/queues', postChatQueue);
router.patch('/queues/:id', patchChatQueue);
router.get('/conversations', getConversations);
router.post('/conversations/prepare', prepareLeadConversation);
router.post('/conversations/resolve-for-client', resolveConversationForClient);
router.patch('/conversations/:id/prepared-instance', patchPreparedConversationInstance);
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
router.get('/conversations/:id/group', getChatGroupDetails);
router.post('/conversations/:id/group/participants/sync-missing-profiles', postChatGroupParticipantsSyncMissing);
router.post('/conversations/:id/group/participants/:participantJid/sync-profile', postChatGroupParticipantSyncProfile);
router.get('/conversations/:id/group/participants', getChatGroupParticipants);
router.post('/conversations/:id/group/name', postChatGroupName);
router.post('/conversations/:id/group/description', postChatGroupDescription);
router.post('/conversations/:id/group/image', postChatGroupImage);
router.post('/conversations/:id/group/invite-reset', postChatGroupResetInvite);
router.post('/conversations/:id/group/leave', postChatGroupLeave);
router.post('/conversations/:id/group/participants', postChatGroupParticipants);
router.post('/conversations/:id/group/settings', postChatGroupSettings);
router.post('/conversations/:id/group/create-from-conversation', postChatCreateGroupFromConversation);
router.get('/conversations/:id/profile', getConversationProfile);
router.post('/conversations/:id/link', linkConversation);
router.delete('/conversations/:id/link', unlinkConversation);
router.delete('/conversations/:id/system-delete', systemDeleteConversation);
router.get('/conversations/:id/kanban-tags', getConversationKanbanTags);
router.post('/conversations/:id/kanban-tags', postConversationKanbanTag);
router.delete('/conversations/:id/kanban-tags/:tagId', deleteConversationKanbanTag);
router.get('/clients/:id/messages', getClientMessages);
router.post('/conversations/:id/messages/sync', syncConversationMessages);
router.post('/conversations/:id/refresh-identity', refreshConversationIdentity);
router.post('/messages', sendMessage);
router.get('/crm-notes', listCrmNotes);
router.post('/crm-notes', postCrmNote);
router.patch('/crm-notes/:noteId', patchCrmNote);
router.delete('/crm-notes/:noteId', deleteCrmNote);
router.post('/messages/:messageId/comments', postMessageComment);
router.get('/messages/:messageId/comments', getMessageComments);
router.patch('/message-comments/:commentId', patchMessageComment);
router.delete('/message-comments/:commentId', deleteMessageComment);
router.post('/conversations/:id/mark-read', markConversationRead);
router.post(
  '/conversations/:id/create-meet-now',
  requireFeature('agenda'),
  postChatConversationCreateMeetNow,
);
router.post(
  '/conversations/:id/schedule-appointment',
  requireFeature('agenda'),
  postChatConversationScheduleAppointment,
);
router.post('/conversations/:id/scheduled-messages', postConversationScheduledMessages);
router.get('/conversations/:id/scheduled-messages', getConversationScheduledMessages);
router.post('/scheduled-messages/:id/cancel', postChatScheduledMessageCancel);
router.patch('/scheduled-messages/:id', patchChatScheduledMessage);

export default router;

