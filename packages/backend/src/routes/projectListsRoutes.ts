import { Router } from 'express';
import {
  getProjectLists,
  createProjectList,
  updateProjectList,
  deleteProjectList,
} from '../controllers/projectListsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Rotas de listas
router.get('/:projectId/lists', getProjectLists);
router.post('/:projectId/lists', createProjectList);
router.patch('/lists/:listId', updateProjectList);
router.delete('/lists/:listId', deleteProjectList);

export default router;


