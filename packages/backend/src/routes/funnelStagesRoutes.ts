import { Router } from 'express';
import * as funnelStagesController from '../controllers/funnelStagesController.js';
import { tenantAuth } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuth);

router.post('/:funnelId/stages', funnelStagesController.createStage);
router.patch('/stages/:id', funnelStagesController.updateStage);
router.delete('/stages/:id', funnelStagesController.deleteStage);

export default router;


