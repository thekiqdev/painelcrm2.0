import { Router } from 'express';
import {
  getProjectTemplates,
  getProjectTemplateById,
  createProjectTemplate,
  updateProjectTemplate,
  deleteProjectTemplate,
  getTemplateStages,
  createTemplateStage,
  createTemplateTask,
} from '../controllers/projectTemplatesController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Rotas de templates
router.get('/', getProjectTemplates);
router.get('/:id', getProjectTemplateById);
router.post('/', createProjectTemplate);
router.patch('/:id', updateProjectTemplate);
router.delete('/:id', deleteProjectTemplate);

// Rotas de stages
router.get('/:id/stages', getTemplateStages);
router.post('/:id/stages', createTemplateStage);

// Rotas de tasks
router.post('/stages/:stageId/tasks', createTemplateTask);

export default router;

