import { Router } from 'express';
import {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
} from '../controllers/tasksController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Rotas de tarefas
router.get('/', getTasks);
router.get('/:id', getTaskById);
router.post('/', createTask);
router.patch('/:id', updateTask);
router.delete('/:id', deleteTask);

export default router;

