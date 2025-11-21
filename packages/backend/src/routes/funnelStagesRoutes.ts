import { Router } from 'express';
import * as funnelStagesController from '../controllers/funnelStagesController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.post('/:funnelId/stages', authenticateToken, funnelStagesController.createStage);
router.patch('/stages/:id', authenticateToken, funnelStagesController.updateStage);
router.delete('/stages/:id', authenticateToken, funnelStagesController.deleteStage);

export default router;


