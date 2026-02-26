import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as myTenantPlanController from '../controllers/myTenantPlanController.js';

const router = Router();

router.use(authenticateToken);

router.get('/limits', myTenantPlanController.getMyTenantLimits);
router.get('/roles', myTenantPlanController.getMyTenantRoles);
router.post('/roles', myTenantPlanController.postMyTenantRole);
router.get('/users', myTenantPlanController.getMyTenantUsers);
router.put('/users/:userId/role', myTenantPlanController.putMyTenantUserRole);
router.get('/plan', myTenantPlanController.getMyTenantPlan);
router.put('/plan', myTenantPlanController.putMyTenantPlan);

// Permissões por módulo (Etapa 2)
router.get('/module-permissions-schema', myTenantPlanController.getModulePermissionsSchemaHandler);
router.get('/my-permissions', myTenantPlanController.getMyPermissionsHandler);
router.get('/custom-roles/:id/permissions', myTenantPlanController.getCustomRolePermissionsHandler);
router.put('/custom-roles/:id/permissions', myTenantPlanController.putCustomRolePermissionsHandler);
router.get('/roles/:role/permissions', myTenantPlanController.getRolePermissionsHandler);
router.put('/roles/:role/permissions', myTenantPlanController.putRolePermissionsHandler);

export default router;
