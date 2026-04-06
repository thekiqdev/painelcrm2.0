import { Router } from 'express';
import { tenantAuth, tenantAuthCommercialHub } from '../middleware/auth.js';
import * as myTenantPlanController from '../controllers/myTenantPlanController.js';
import * as myTenantPaymentGatewayController from '../controllers/myTenantPaymentGatewayController.js';
import * as myTenantSubscriptionController from '../controllers/myTenantSubscriptionController.js';
import {
  getPlanCheckoutPending,
  postPlanCheckoutPreparePayment,
} from '../controllers/planPurchaseController.js';

const router = Router();

// Plano atual: acessível com trial expirado / retomada (não passa pelo gate comercial do CRM)
router.get('/plan', ...tenantAuthCommercialHub, myTenantPlanController.getMyTenantPlan);
router.put('/plan', ...tenantAuthCommercialHub, myTenantPlanController.putMyTenantPlan);
router.post('/seat-addon/preview', ...tenantAuthCommercialHub, myTenantPlanController.postSeatAddonPreview);
router.post('/seat-addon/checkout', ...tenantAuthCommercialHub, myTenantPlanController.postSeatAddonCheckout);
router.put('/seats/schedule-next-cycle', ...tenantAuthCommercialHub, myTenantPlanController.putSeatsScheduleNextCycle);
router.get('/plan-checkout-pending', ...tenantAuthCommercialHub, getPlanCheckoutPending);
router.post(
  '/plan-checkout-prepare-payment',
  ...tenantAuthCommercialHub,
  postPlanCheckoutPreparePayment
);
router.get('/commercial-billings', ...tenantAuthCommercialHub, myTenantPlanController.getMyTenantCommercialBillings);

// Demais rotas: CRM comercial + período ativo
// Assinatura recorrente (Billing Engine Fase 2)
router.get('/subscription', ...tenantAuth, myTenantSubscriptionController.getMySubscription);
router.post('/subscription/cancel', ...tenantAuth, myTenantSubscriptionController.cancelMySubscription);
router.patch('/subscription', ...tenantAuth, myTenantSubscriptionController.patchMySubscription);

router.get('/payment-gateways', ...tenantAuth, myTenantPaymentGatewayController.getMyTenantPaymentGatewaysList);
router.get('/payment-gateways/status', ...tenantAuth, myTenantPaymentGatewayController.getMyTenantPaymentGatewaysStatus);
router.get('/payment-gateways/webhooks/events', ...tenantAuth, myTenantPaymentGatewayController.getMyTenantPaymentWebhookEvents);
router.get('/payment-gateway', ...tenantAuth, myTenantPaymentGatewayController.getMyTenantPaymentGatewayConfig);
router.put('/payment-gateway', ...tenantAuth, myTenantPaymentGatewayController.putMyTenantPaymentGatewayConfig);
router.post('/payment-gateway/test', ...tenantAuth, myTenantPaymentGatewayController.postMyTenantPaymentGatewayTest);
router.post('/payment-gateway/disable', ...tenantAuth, myTenantPaymentGatewayController.postMyTenantPaymentGatewayDisable);

router.get('/limits', ...tenantAuth, myTenantPlanController.getMyTenantLimits);
router.get('/roles', ...tenantAuth, myTenantPlanController.getMyTenantRoles);
router.post('/roles', ...tenantAuth, myTenantPlanController.postMyTenantRole);
router.get('/users', ...tenantAuth, myTenantPlanController.getMyTenantUsers);
router.post('/users', ...tenantAuth, myTenantPlanController.postMyTenantUser);
router.put('/users/:userId/role', ...tenantAuth, myTenantPlanController.putMyTenantUserRole);
router.delete('/users/:userId', ...tenantAuth, myTenantPlanController.deleteMyTenantUser);

// Permissões por módulo (Etapa 2)
router.get('/module-permissions-schema', ...tenantAuth, myTenantPlanController.getModulePermissionsSchemaHandler);
router.get('/my-permissions', ...tenantAuth, myTenantPlanController.getMyPermissionsHandler);
router.get('/custom-roles/:id/permissions', ...tenantAuth, myTenantPlanController.getCustomRolePermissionsHandler);
router.put('/custom-roles/:id/permissions', ...tenantAuth, myTenantPlanController.putCustomRolePermissionsHandler);
router.get('/roles/:role/permissions', ...tenantAuth, myTenantPlanController.getRolePermissionsHandler);
router.put('/roles/:role/permissions', ...tenantAuth, myTenantPlanController.putRolePermissionsHandler);

export default router;
