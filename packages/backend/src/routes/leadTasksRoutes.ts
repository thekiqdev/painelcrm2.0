import { Router } from 'express';
import * as leadTasksController from '../controllers/leadTasksController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/leads/:leadId/tasks', authenticateToken, leadTasksController.getLeadTasks);
router.post('/', authenticateToken, leadTasksController.createLeadTask);
router.patch('/:id', authenticateToken, leadTasksController.updateLeadTask);
router.delete('/:id', authenticateToken, leadTasksController.deleteLeadTask);

export default router;

