import { Router } from 'express';
import {
  getProjectAreas,
  createProjectArea,
  updateProjectArea,
  deleteProjectArea,
} from '../controllers/projectAreasController.js';
import { getTasksByArea } from '../controllers/projectTasksController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

router.get('/:projectId/areas', getProjectAreas);
router.get('/:projectId/areas/:areaId/tasks', getTasksByArea);
router.post('/:projectId/areas', createProjectArea);
router.patch('/areas/:areaId', updateProjectArea);
router.delete('/areas/:areaId', deleteProjectArea);

export default router;
