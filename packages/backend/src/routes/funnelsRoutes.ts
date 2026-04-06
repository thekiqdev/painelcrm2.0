import { Router } from 'express';
import * as funnelsController from '../controllers/funnelsController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/', funnelsController.getFunnels);
router.get('/:id', funnelsController.getFunnelById);
router.post('/', funnelsController.createFunnel);
router.patch('/:id', funnelsController.updateFunnel);
router.delete('/:id', funnelsController.deleteFunnel);

export default router;

