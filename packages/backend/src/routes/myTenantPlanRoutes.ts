import { Router } from 'express';
import { tenantAuth } from '../middleware/auth.js';
import * as myTenantPlanController from '../controllers/myTenantPlanController.js';
import * as myTenantPaymentGatewayController from '../controllers/myTenantPaymentGatewayController.js';
import * as myTenantSubscriptionController from '../controllers/myTenantSubscriptionController.js';

const router = Router();

router.use(...tenantAuth);

// Assinatura recorrente (Billing Engine Fase 2)
router.get('/subscription', myTenantSubscriptionController.getMySubscription);
router.post('/subscription/cancel', myTenantSubscriptionController.cancelMySubscription);
router.patch('/subscription', myTenantSubscriptionController.patchMySubscription);

router.get('/payment-gateways', myTenantPaymentGatewayController.getMyTenantPaymentGatewaysList);
router.get('/payment-gateways/status', myTenantPaymentGatewayController.getMyTenantPaymentGatewaysStatus);
router.get('/payment-gateways/webhooks/events', myTenantPaymentGatewayController.getMyTenantPaymentWebhookEvents);
router.get('/payment-gateway', myTenantPaymentGatewayController.getMyTenantPaymentGatewayConfig);
router.put('/payment-gateway', myTenantPaymentGatewayController.putMyTenantPaymentGatewayConfig);
router.post('/payment-gateway/test', myTenantPaymentGatewayController.postMyTenantPaymentGatewayTest);
router.post('/payment-gateway/disable', myTenantPaymentGatewayController.postMyTenantPaymentGatewayDisable);

router.get('/limits', myTenantPlanController.getMyTenantLimits);
router.get('/roles', myTenantPlanController.getMyTenantRoles);
router.post('/roles', myTenantPlanController.postMyTenantRole);
router.get('/users', myTenantPlanController.getMyTenantUsers);
router.post('/users', myTenantPlanController.postMyTenantUser);
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
