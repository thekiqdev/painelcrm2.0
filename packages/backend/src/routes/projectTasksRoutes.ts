import { Router } from 'express';
import {
  getProjectTasks,
  getProjectTaskById,
  createProjectTask,
  updateProjectTask,
  deleteProjectTask,
} from '../controllers/projectTasksController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Rotas de tarefas
router.get('/lists/:listId/tasks', getProjectTasks);
router.get('/tasks/:taskId', getProjectTaskById);
router.post('/lists/:listId/tasks', createProjectTask);
router.patch('/tasks/:taskId', updateProjectTask);
router.delete('/tasks/:taskId', deleteProjectTask);

export default router;


