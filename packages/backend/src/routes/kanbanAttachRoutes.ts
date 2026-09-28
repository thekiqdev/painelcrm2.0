import { Router } from 'express';
import { tenantAuthCrm, requireFeature } from '../middleware/auth.js';
import { attachConversation } from '../controllers/chatKanbanController.js';

const router = Router();

router.use(...tenantAuthCrm);
router.use(requireFeature('chat'));

/** POST /api/kanban/attach-conversation — body: board_id, column_id, conversation_id (+ opcionais de movimento). */
router.post('/attach-conversation', attachConversation);

export default router;
