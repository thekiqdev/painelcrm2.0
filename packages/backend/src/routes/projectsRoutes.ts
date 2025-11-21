import { Router } from 'express';
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
} from '../controllers/projectsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Rotas de projetos
router.get('/', getProjects);
router.get('/:id', getProjectById);
router.post('/', createProject);
router.patch('/:id', updateProject);
router.delete('/:id', deleteProject);

export default router;


