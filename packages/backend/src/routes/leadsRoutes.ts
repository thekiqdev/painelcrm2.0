import { Router } from 'express';
import * as leadsController from '../controllers/leadsController.js';
import { tenantAuth } from '../middleware/auth.js';
import { requirePermission } from '../permissions/index.js';

const router = Router();
router.use(...tenantAuth);

router.get('/', leadsController.getLeads);
router.get('/:id', leadsController.getLeadById);
router.post('/', requirePermission('leads.create'), leadsController.createLead);
router.patch('/:id', leadsController.updateLead);
router.delete('/:id', leadsController.deleteLead);

export default router;

