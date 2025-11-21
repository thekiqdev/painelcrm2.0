import { Router } from 'express';
import * as funnelsController from '../controllers/funnelsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, funnelsController.getFunnels);
router.get('/:id', authenticateToken, funnelsController.getFunnelById);
router.post('/', authenticateToken, funnelsController.createFunnel);
router.patch('/:id', authenticateToken, funnelsController.updateFunnel);
router.delete('/:id', authenticateToken, funnelsController.deleteFunnel);

export default router;

