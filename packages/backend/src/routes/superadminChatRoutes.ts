import { Router } from 'express';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import {
  connectInstance,
  createInstance,
  getChatRuntimeConfig,
  getConversationMessages,
  getConversationProfile,
  getConversations,
  getInstanceStatus,
  listInstances,
  markConversationRead,
  patchInstance,
  refreshConversationIdentity,
  sendMessage,
  syncConversationMessages,
  syncConversations,
  systemDeleteConversation,
} from '../controllers/chatController.js';
import {
  getMessageComments,
  postMessageComment,
} from '../controllers/chatCollaborationController.js';
import { getSuperadminChatMetaIntegrationStatus } from '../controllers/superadminChatMetaController.js';

const router = Router();

function platformAttendanceCounts(_req: AuthRequest, res: Response): void {
  res.json({
    queue: 0,
    team: 0,
    mine: 0,
    unassigned: 0,
    closed: 0,
    unread: 0,
  });
}

function platformOperationsDashboard(_req: AuthRequest, res: Response): void {
  res.json({
    summary: {
      open: 0,
      pending: 0,
      in_progress: 0,
      waiting_customer: 0,
      closed_today: 0,
      sla_at_risk: 0,
      sla_breached: 0,
      avg_first_response_sec: null,
      avg_next_reply_sec: null,
    },
    sla_context: { risk_percent: 80, tenant_first_minutes: null, tenant_next_minutes: null },
    by_queue: [],
    by_assignee: [],
    attendees: [],
    automation_logs: [],
  });
}

function platformKanbanTags(_req: AuthRequest, res: Response): void {
  res.json({ tags: [], legacy_labels: [] });
}

function platformCrmNotes(_req: AuthRequest, res: Response): void {
  res.json({ notes: [] });
}

function platformUnsupportedCrmAction(_req: AuthRequest, res: Response): void {
  res.status(400).json({ error: 'Ação de CRM não disponível no Chat da Plataforma.' });
}

router.get('/runtime-config', getChatRuntimeConfig);
router.get('/meta-integration-status', getSuperadminChatMetaIntegrationStatus);

router.get('/instances', listInstances);
router.post('/instances', createInstance);
router.post('/instances/:id/connect', connectInstance);
router.get('/instances/:id/status', getInstanceStatus);
router.patch('/instances/:id', patchInstance);

router.post('/conversations/sync', syncConversations);
router.get('/conversations/attendance-counts', platformAttendanceCounts);
router.get('/operations-dashboard', platformOperationsDashboard);
router.get('/conversations', getConversations);
router.get('/conversations/:id/messages', getConversationMessages);
router.post('/conversations/:id/messages/sync', syncConversationMessages);
router.post('/conversations/:id/refresh-identity', refreshConversationIdentity);
router.post('/conversations/:id/mark-read', markConversationRead);
router.get('/conversations/:id/profile', getConversationProfile);
router.delete('/conversations/:id/system-delete', systemDeleteConversation);
router.get('/conversations/:id/kanban-tags', platformKanbanTags);
router.post('/conversations/:id/kanban-tags', platformUnsupportedCrmAction);
router.delete('/conversations/:id/kanban-tags/:tagId', platformUnsupportedCrmAction);

router.post('/messages', sendMessage);
router.post('/messages/:messageId/comments', postMessageComment);
router.get('/messages/:messageId/comments', getMessageComments);

router.get('/crm-notes', platformCrmNotes);
router.post('/crm-notes', platformUnsupportedCrmAction);

export default router;
