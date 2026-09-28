import { Router } from 'express';
import { tenantAuth, tenantAuthCommercialHub, tenantAuthCrm } from '../middleware/auth.js';
import * as myTenantPlanController from '../controllers/myTenantPlanController.js';
import * as myTenantPaymentGatewayController from '../controllers/myTenantPaymentGatewayController.js';
import * as myTenantSubscriptionController from '../controllers/myTenantSubscriptionController.js';
import {
  getPlanCheckoutPending,
  postPlanCheckoutPreparePayment,
} from '../controllers/planPurchaseController.js';
import * as proposalWebhookSettingsController from '../controllers/proposalWebhookSettingsController.js';
import * as myTenantCompanyController from '../controllers/myTenantCompanyController.js';
import * as myTenantBillingPreferencesController from '../controllers/myTenantBillingPreferencesController.js';

const router = Router();

// Plano atual: acessível com trial expirado / retomada (não passa pelo gate comercial do CRM)
router.get('/plan', ...tenantAuthCommercialHub, myTenantPlanController.getMyTenantPlan);
router.put('/plan', ...tenantAuthCommercialHub, myTenantPlanController.putMyTenantPlan);
router.get(
  '/available-plans',
  ...tenantAuthCommercialHub,
  myTenantPlanController.getMyTenantAvailablePlans
);
router.post(
  '/partner-sell-plan/checkout',
  ...tenantAuthCommercialHub,
  myTenantPlanController.postMyTenantPartnerSellPlanCheckout
);
router.post('/seat-addon/preview', ...tenantAuthCommercialHub, myTenantPlanController.postSeatAddonPreview);
router.post('/seat-addon/checkout', ...tenantAuthCommercialHub, myTenantPlanController.postSeatAddonCheckout);
router.post('/instance-addon/preview', ...tenantAuthCommercialHub, myTenantPlanController.postInstanceAddonPreview);
router.post('/instance-addon/checkout', ...tenantAuthCommercialHub, myTenantPlanController.postInstanceAddonCheckout);
router.put('/seats/schedule-next-cycle', ...tenantAuthCommercialHub, myTenantPlanController.putSeatsScheduleNextCycle);
router.put(
  '/instances/schedule-next-cycle',
  ...tenantAuthCommercialHub,
  myTenantPlanController.putInstancesScheduleNextCycle
);
router.get('/plan-checkout-pending', ...tenantAuthCommercialHub, getPlanCheckoutPending);
router.post(
  '/plan-checkout-prepare-payment',
  ...tenantAuthCommercialHub,
  postPlanCheckoutPreparePayment
);
router.get('/commercial-billings', ...tenantAuthCommercialHub, myTenantPlanController.getMyTenantCommercialBillings);

// Demais rotas: CRM comercial + período ativo
// Leitura de assinatura / limites no hub (Meu plano com período vencido)
router.get('/subscription', ...tenantAuthCommercialHub, myTenantSubscriptionController.getMySubscription);
router.get('/limits', ...tenantAuthCommercialHub, myTenantPlanController.getMyTenantLimits);
router.post('/subscription/cancel', ...tenantAuth, myTenantSubscriptionController.cancelMySubscription);
router.patch('/subscription', ...tenantAuth, myTenantSubscriptionController.patchMySubscription);

// Sprint C — Pix Automático (SSOT na assinatura)
router.get('/pix-automatic', ...tenantAuthCommercialHub, myTenantSubscriptionController.getMyPixAutomatic);
router.post('/pix-automatic/enable', ...tenantAuth, myTenantSubscriptionController.postMyPixAutomaticEnable);
router.post('/pix-automatic/disable', ...tenantAuth, myTenantSubscriptionController.postMyPixAutomaticDisable);

router.get('/payment-gateways', ...tenantAuth, myTenantPaymentGatewayController.getMyTenantPaymentGatewaysList);
router.get('/payment-gateways/status', ...tenantAuth, myTenantPaymentGatewayController.getMyTenantPaymentGatewaysStatus);
router.get('/payment-gateways/webhooks/events', ...tenantAuth, myTenantPaymentGatewayController.getMyTenantPaymentWebhookEvents);
router.get('/payment-gateway', ...tenantAuth, myTenantPaymentGatewayController.getMyTenantPaymentGatewayConfig);
router.put('/payment-gateway', ...tenantAuth, myTenantPaymentGatewayController.putMyTenantPaymentGatewayConfig);
router.post('/payment-gateway/test', ...tenantAuth, myTenantPaymentGatewayController.postMyTenantPaymentGatewayTest);
router.post('/payment-gateway/disable', ...tenantAuth, myTenantPaymentGatewayController.postMyTenantPaymentGatewayDisable);

router.get('/company', ...tenantAuthCrm, myTenantCompanyController.getMyTenantCompany);
router.put('/company', ...tenantAuthCrm, myTenantCompanyController.putMyTenantCompany);
router.get('/billing-preferences', ...tenantAuthCrm, myTenantBillingPreferencesController.getMyTenantBillingPreferences);
router.put('/billing-preferences', ...tenantAuthCrm, myTenantBillingPreferencesController.putMyTenantBillingPreferences);

router.get('/roles', ...tenantAuth, myTenantPlanController.getMyTenantRoles);
router.post('/roles', ...tenantAuth, myTenantPlanController.postMyTenantRole);
router.get('/users', ...tenantAuth, myTenantPlanController.getMyTenantUsers);
router.post('/users', ...tenantAuth, myTenantPlanController.postMyTenantUser);
router.patch('/users/:userId', ...tenantAuth, myTenantPlanController.patchMyTenantUser);
router.put('/users/:userId/role', ...tenantAuth, myTenantPlanController.putMyTenantUserRole);
router.delete('/users/:userId', ...tenantAuth, myTenantPlanController.deleteMyTenantUser);

// Permissões por módulo (Etapa 2)
router.get('/module-permissions-schema', ...tenantAuth, myTenantPlanController.getModulePermissionsSchemaHandler);
router.get('/my-permissions', ...tenantAuth, myTenantPlanController.getMyPermissionsHandler);
router.get('/custom-roles/:id/permissions', ...tenantAuth, myTenantPlanController.getCustomRolePermissionsHandler);
router.put('/custom-roles/:id/permissions', ...tenantAuth, myTenantPlanController.putCustomRolePermissionsHandler);
router.get('/roles/:role/permissions', ...tenantAuth, myTenantPlanController.getRolePermissionsHandler);
router.put('/roles/:role/permissions', ...tenantAuth, myTenantPlanController.putRolePermissionsHandler);

router.get(
  '/proposal-webhook-settings',
  ...tenantAuth,
  proposalWebhookSettingsController.getProposalWebhookSettings
);
router.put(
  '/proposal-webhook-settings',
  ...tenantAuth,
  proposalWebhookSettingsController.putProposalWebhookSettings
);
router.post(
  '/proposal-webhook-deliveries/:id/retry',
  ...tenantAuth,
  proposalWebhookSettingsController.postProposalWebhookDeliveryRetry
);

export default router;
