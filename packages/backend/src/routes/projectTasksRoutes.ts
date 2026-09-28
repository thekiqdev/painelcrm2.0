import { Router } from 'express';
import {
  getProjectTasks,
  getProjectTaskById,
  createProjectTask,
  updateProjectTask,
  deleteProjectTask,
  moveProjectTask,
  copyProjectTask,
} from '../controllers/projectTasksController.js';
import { tenantAuthCrm } from '../middleware/auth.js';
import { requirePermission } from '../permissions/index.js';

const router = Router();

// Todas as rotas requerem autenticação e tenant atual
router.use(...tenantAuthCrm);

// Rotas de tarefas
router.get('/lists/:listId/tasks', getProjectTasks);
router.get('/tasks/:taskId', getProjectTaskById);
router.post('/lists/:listId/tasks', requirePermission('tasks.create'), createProjectTask);
router.patch('/tasks/:taskId', updateProjectTask);
router.patch('/tasks/:taskId/move', moveProjectTask);
router.post('/tasks/:taskId/copy', requirePermission('tasks.create'), copyProjectTask);
router.delete('/tasks/:taskId', deleteProjectTask);

export default router;


