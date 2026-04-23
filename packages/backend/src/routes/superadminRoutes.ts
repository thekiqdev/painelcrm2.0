import { Router } from 'express';
import { superadminAuth } from '../middleware/auth.js';
import * as superadminController from '../controllers/superadminController.js';
import * as auditLogController from '../controllers/auditLogController.js';
import * as reportsController from '../controllers/reportsController.js';
import * as exportController from '../controllers/exportController.js';
import * as superadminUsersController from '../controllers/superadminUsersController.js';
import * as systemFeaturesController from '../controllers/systemFeaturesController.js';
import * as paymentGatewayConfigController from '../controllers/paymentGatewayConfigController.js';
import * as superadminBillingController from '../controllers/superadminBillingController.js';
import * as superadminNotificationsEngineController from '../controllers/superadminNotificationsEngineController.js';
import { checkAndNotifyTrialEnding } from '../services/superadminNotificationsService.js';

const router = Router();

router.use(...superadminAuth);

router.get('/me', superadminController.getSuperAdminMe);
router.get('/dashboard', superadminController.getDashboard);
router.get('/audit-log', auditLogController.getAuditLog);
router.get('/reports', reportsController.getReports);

router.get('/export/clients', exportController.exportClients);
router.get('/export/plans', exportController.exportPlans);
router.get('/export/usage', exportController.exportUsage);

router.get('/users', superadminUsersController.listSuperAdmins);
router.post('/users', superadminUsersController.addSuperAdmin);
router.post('/impersonate', superadminUsersController.impersonateUser);
router.put('/users/:id/password', superadminUsersController.changeUserPassword);
router.delete('/users/:id', superadminUsersController.removeSuperAdmin);

router.post('/notifications/check-trials', async (req, res) => {
  try {
    const { notified } = await checkAndNotifyTrialEnding();
    res.json({ ok: true, notified });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal server error' });
  }
});

router.get('/payment-gateways', paymentGatewayConfigController.getPaymentGatewaysList);
router.get('/payment-gateways/status', paymentGatewayConfigController.getPaymentGatewaysStatus);
router.get('/payment-gateways/webhooks/events', paymentGatewayConfigController.getPaymentWebhookEvents);
router.get('/payment-gateway', paymentGatewayConfigController.getPaymentGatewayConfig);
router.put('/payment-gateway', paymentGatewayConfigController.putPaymentGatewayConfig);

router.get('/features', systemFeaturesController.listSystemFeatures);
router.get('/features/:id', systemFeaturesController.getSystemFeature);
router.post('/features', systemFeaturesController.createSystemFeature);
router.put('/features/:id', systemFeaturesController.updateSystemFeature);
router.delete('/features/:id', systemFeaturesController.deleteSystemFeature);

// Billing Engine – relatórios e configurações (Fase 3)
router.get('/billing/subscriptions', superadminBillingController.getBillingSubscriptions);
router.get('/billing/upcoming', superadminBillingController.getBillingUpcoming);
router.get('/billing/jobs-failed', superadminBillingController.getBillingJobsFailed);
router.get('/billing/recurring-jobs', superadminBillingController.getBillingRecurringJobsOps);
router.get('/billing/settings', superadminBillingController.getBillingSettingsHandler);
router.put('/billing/settings', superadminBillingController.putBillingSettingsHandler);

router.get('/notifications-engine/summary', superadminNotificationsEngineController.getNotificationsEngineOpsSummary);
router.get('/notifications-engine/deliveries', superadminNotificationsEngineController.listNotificationsEngineDeliveries);

export default router;
