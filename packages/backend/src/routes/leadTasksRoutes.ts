import { Router } from 'express';
import * as leadTasksController from '../controllers/leadTasksController.js';
import { tenantAuth } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuth);

router.get('/leads/:leadId/tasks', leadTasksController.getLeadTasks);
router.post('/', leadTasksController.createLeadTask);
router.patch('/:id', leadTasksController.updateLeadTask);
router.delete('/:id', leadTasksController.deleteLeadTask);

export default router;

