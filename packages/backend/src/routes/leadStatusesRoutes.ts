import { Router } from 'express';
import * as leadStatusesController from '../controllers/leadStatusesController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, leadStatusesController.getLeadStatuses);
router.post('/', authenticateToken, leadStatusesController.createLeadStatus);
router.put('/:id', authenticateToken, leadStatusesController.updateLeadStatus);
router.delete('/:id', authenticateToken, leadStatusesController.deleteLeadStatus);

export default router;

