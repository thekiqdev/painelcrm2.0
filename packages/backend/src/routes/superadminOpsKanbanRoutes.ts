import { Router } from 'express';
import { authenticateToken, requireSuperAdmin, setRequestDb } from '../middleware/auth.js';
import { bindRequestContext } from '../middleware/bindRequestContext.js';
import { setSuperadminOpsTenant } from '../middleware/superadminOpsTenant.js';
import {
  attachConversation,
  createBoard,
  createCard,
  createColumn,
  deleteBoard,
  deleteCard,
  deleteColumn,
  getBoard,
  getBoardSettings,
  listBoards,
  listCards,
  listColumns,
  patchBoard,
  patchCard,
  patchColumn,
  reorderColumns,
} from '../controllers/chatKanbanController.js';
import {
  bootstrapSuperadminOpsKanban,
  listSuperadminOpsBoards,
} from '../controllers/superadminOpsKanbanBootstrapController.js';
import {
  createTenantKanbanTag,
  listTenantKanbanTags,
  patchTenantKanbanTag,
} from '../controllers/chatConversationKanbanTagsController.js';

/**
 * Super Admin Operational Layer — Kanban multi-board reutilizando o Kanban existente.
 *
 * IMPORTANT:
 * - Reutiliza controller e tabelas chat_kanban_*.
 * - Isola dados no tenant virtual (SUPERADMIN_OPS_KANBAN_TENANT_ID).
 * - setRequestDb marca bypass RLS (superadmin) e injeta app.current_tenant_id.
 */
const router = Router();

router.use(authenticateToken, requireSuperAdmin, bindRequestContext, setSuperadminOpsTenant, setRequestDb);

router.post('/bootstrap', bootstrapSuperadminOpsKanban);

router.get('/tags', listTenantKanbanTags);
router.post('/tags', createTenantKanbanTag);
router.patch('/tags/:tagId', patchTenantKanbanTag);

router.get('/boards', listSuperadminOpsBoards);
router.post('/boards', createBoard);
router.get('/boards/:boardId', getBoard);
router.get('/boards/:boardId/settings', getBoardSettings);
router.patch('/boards/:boardId', patchBoard);
router.delete('/boards/:boardId', deleteBoard);

router.get('/boards/:boardId/columns', listColumns);
router.post('/boards/:boardId/columns', createColumn);
router.post('/boards/:boardId/columns/reorder', reorderColumns);

router.patch('/columns/:columnId', patchColumn);
router.delete('/columns/:columnId', deleteColumn);

router.get('/boards/:boardId/cards', listCards);
router.post('/boards/:boardId/cards', createCard);
router.post('/attach-conversation', attachConversation);
router.patch('/cards/:cardId', patchCard);
router.delete('/cards/:cardId', deleteCard);

export default router;

