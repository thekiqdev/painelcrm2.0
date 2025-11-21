import { Router } from 'express';
import * as leadsController from '../controllers/leadsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, leadsController.getLeads);
router.get('/:id', authenticateToken, leadsController.getLeadById);
router.post('/', authenticateToken, leadsController.createLead);
router.patch('/:id', authenticateToken, leadsController.updateLead);
router.delete('/:id', authenticateToken, leadsController.deleteLead);

export default router;

