import { Router } from 'express';
import { tenantAuthCrm, requireFeature } from '../middleware/auth.js';
import {
  listBoards,
  getBoard,
  getBoardSettings,
  createBoard,
  patchBoard,
  listColumns,
  createColumn,
  patchColumn,
  deleteColumn,
  reorderColumns,
  listCards,
  createCard,
  patchCard,
  deleteCard,
} from '../controllers/chatKanbanController.js';

const router = Router();

router.use(...tenantAuthCrm);
router.use(requireFeature('chat'));

router.get('/boards', listBoards);
router.post('/boards', createBoard);
router.get('/boards/:boardId', getBoard);
router.get('/boards/:boardId/settings', getBoardSettings);
router.patch('/boards/:boardId', patchBoard);

router.get('/boards/:boardId/columns', listColumns);
router.post('/boards/:boardId/columns', createColumn);
router.post('/boards/:boardId/columns/reorder', reorderColumns);

router.patch('/columns/:columnId', patchColumn);
router.delete('/columns/:columnId', deleteColumn);

router.get('/boards/:boardId/cards', listCards);
router.post('/boards/:boardId/cards', createCard);
router.patch('/cards/:cardId', patchCard);
router.delete('/cards/:cardId', deleteCard);

export default router;
