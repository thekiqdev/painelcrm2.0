import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as myTenantPlanController from '../controllers/myTenantPlanController.js';

const router = Router();

router.use(authenticateToken);

router.get('/limits', myTenantPlanController.getMyTenantLimits);
router.get('/roles', myTenantPlanController.getMyTenantRoles);
router.get('/users', myTenantPlanController.getMyTenantUsers);
router.put('/users/:userId/role', myTenantPlanController.putMyTenantUserRole);
router.get('/plan', myTenantPlanController.getMyTenantPlan);
router.put('/plan', myTenantPlanController.putMyTenantPlan);

export default router;
