import { Router } from 'express';
import * as leadStatusesController from '../controllers/leadStatusesController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/', leadStatusesController.getLeadStatuses);
router.post('/', leadStatusesController.createLeadStatus);
router.put('/:id', leadStatusesController.updateLeadStatus);
router.delete('/:id', leadStatusesController.deleteLeadStatus);

export default router;

