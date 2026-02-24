import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as myTenantPlanController from '../controllers/myTenantPlanController.js';

const router = Router();

router.use(authenticateToken);

router.get('/plan', myTenantPlanController.getMyTenantPlan);
router.put('/plan', myTenantPlanController.putMyTenantPlan);

export default router;
