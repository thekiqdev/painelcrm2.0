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
import * as superadminCrmNotificationTemplatesController from '../controllers/superadminCrmNotificationTemplatesController.js';
import * as superadminPlatformNotificationsController from '../controllers/superadminPlatformNotificationsController.js';
import * as superadminPlatformWhatsAppController from '../controllers/superadminPlatformWhatsAppController.js';
import * as superadminPlatformBillingsController from '../controllers/superadminPlatformBillingsController.js';
import { checkAndNotifyTrialEnding } from '../services/superadminNotificationsService.js';
import superadminAnnouncementRoutes from './superadminAnnouncementRoutes.js';
import * as superadminLegalPagesController from '../controllers/superadminLegalPagesController.js';
import * as superadminWhatsappAvatarBackfillController from '../controllers/superadminWhatsappAvatarBackfillController.js';
import * as smtpSuperadminSettingsController from '../controllers/smtpSuperadminSettingsController.js';
import * as superadminLeadsController from '../controllers/superadminLeadsController.js';
import superadminWhatsappOfficialRoutes from './superadminWhatsappOfficialRoutes.js';
import connectionsRoutes from './connectionsRoutes.js';
import * as adminScriptsController from '../controllers/adminScriptsController.js';
import {
  listSuperadminRecentMediaAssets,
  postSuperadminMediaTestSaveBuffer,
} from '../services/media/mediaController.js';

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

router.get('/platform-billings', superadminPlatformBillingsController.getSuperadminPlatformBillings);
router.get('/platform-billings/:id', superadminPlatformBillingsController.getSuperadminPlatformBillingById);
router.post(
  '/platform-billings/:id/public-link',
  superadminPlatformBillingsController.postSuperadminPlatformBillingEnsurePublicLink,
);

// Billing Engine – relatórios e configurações (Fase 3)
router.get('/billing/subscriptions', superadminBillingController.getBillingSubscriptions);
router.get('/billing/upcoming', superadminBillingController.getBillingUpcoming);
router.get('/billing/jobs-failed', superadminBillingController.getBillingJobsFailed);
router.get('/billing/recurring-jobs', superadminBillingController.getBillingRecurringJobsOps);
router.get('/billing/settings', superadminBillingController.getBillingSettingsHandler);
router.put('/billing/settings', superadminBillingController.putBillingSettingsHandler);
router.get(
  '/billing/subscription-cycles-flags',
  superadminBillingController.getSubscriptionCyclesFlagsHandler,
);
router.put(
  '/billing/subscription-cycles-flags',
  superadminBillingController.putSubscriptionCyclesFlagsHandler,
);

router.get('/notifications-engine/summary', superadminNotificationsEngineController.getNotificationsEngineOpsSummary);
router.get('/notifications-engine/deliveries', superadminNotificationsEngineController.listNotificationsEngineDeliveries);

/** Templates padrão globais do motor CRM (notification_template_system) */
router.get('/notification-templates', superadminCrmNotificationTemplatesController.listCrmNotificationSystemTemplates);
router.patch('/notification-templates', superadminCrmNotificationTemplatesController.patchCrmNotificationSystemTemplate);
router.post('/notification-templates/preview', superadminCrmNotificationTemplatesController.postCrmNotificationTemplatePreview);

/** Backfill seguro: cache de avatars CDN → catálogo (lote pequeno por chamada). */
router.post(
  '/chat/avatar-cache-backfill',
  superadminWhatsappAvatarBackfillController.postWhatsappAvatarCacheBackfill,
);

// Motor de Notificações da PLATAFORMA (domínio separado do tenant)
router.get(
  '/platform-notifications/catalog/events',
  superadminPlatformNotificationsController.listPlatformNotificationCatalog,
);
router.patch(
  '/platform-notifications/catalog/events/:eventKey/active',
  superadminPlatformNotificationsController.patchPlatformNotificationCatalogEventActive,
);
router.get(
  '/platform-notifications/catalog/events/:eventKey',
  superadminPlatformNotificationsController.getPlatformNotificationCatalogEventDetail,
);
router.get(
  '/platform-notifications/deliveries',
  superadminPlatformNotificationsController.listPlatformNotificationDeliveries,
);
router.get(
  '/platform-notifications/global-settings',
  superadminPlatformNotificationsController.getPlatformNotificationsGlobalSettingsHandler,
);
router.put(
  '/platform-notifications/global-settings',
  superadminPlatformNotificationsController.putPlatformNotificationsGlobalSettingsHandler,
);
router.post(
  '/platform-notifications/preview',
  superadminPlatformNotificationsController.postPlatformNotificationPreview,
);
router.post(
  '/platform-notifications/simulate',
  superadminPlatformNotificationsController.postPlatformNotificationSimulate,
);
router.put(
  '/platform-notifications/template-overrides',
  superadminPlatformNotificationsController.putPlatformNotificationTemplateOverride,
);
router.delete(
  '/platform-notifications/template-overrides',
  superadminPlatformNotificationsController.deletePlatformNotificationTemplateOverrideHandler,
);

// WhatsApp da plataforma (UazAPI + chat_instances do Super Admin — não usa tenant de dispatch)
router.get('/platform-whatsapp/instances', superadminPlatformWhatsAppController.listInstances);
router.post('/platform-whatsapp/instances', superadminPlatformWhatsAppController.createInstance);
router.post('/platform-whatsapp/instances/:id/connect', superadminPlatformWhatsAppController.connectInstance);
router.get('/platform-whatsapp/instances/:id/status', superadminPlatformWhatsAppController.getInstanceStatus);
router.patch('/platform-whatsapp/instances/:id', superadminPlatformWhatsAppController.patchInstance);
router.delete('/platform-whatsapp/instances/:id', superadminPlatformWhatsAppController.deleteSuperadminPlatformWhatsAppInstance);

/** Configuração SMTP (persistência em superadmin_settings; sem envio transacional automático). */
router.get('/smtp-settings', smtpSuperadminSettingsController.getSmtpSuperadminSettingsHandler);
router.put('/smtp-settings', smtpSuperadminSettingsController.putSmtpSuperadminSettingsHandler);
router.post('/smtp-settings/test', smtpSuperadminSettingsController.postSmtpSuperadminTestEmailHandler);

router.put('/legal/:page/draft', superadminLegalPagesController.putSuperadminLegalDraft);
router.post('/legal/:page/publish', superadminLegalPagesController.postSuperadminLegalPublish);
router.get('/legal/:page', superadminLegalPagesController.getSuperadminLegalPage);

router.use('/announcements', superadminAnnouncementRoutes);

router.use('/connections', connectionsRoutes);

router.use('/whatsapp-official', superadminWhatsappOfficialRoutes);

router.get('/lead-groups/for-announcements', superadminLeadsController.listSuperadminLeadGroupsForAnnouncements);
router.get('/lead-groups', superadminLeadsController.listSuperadminLeadGroups);
router.post('/lead-groups', superadminLeadsController.createSuperadminLeadGroup);
router.patch('/lead-groups/:id', superadminLeadsController.patchSuperadminLeadGroup);
router.get('/lead-groups/:id/members', superadminLeadsController.getSuperadminLeadGroupMembers);
router.put('/lead-groups/:id/members', superadminLeadsController.putSuperadminLeadGroupMembers);

router.get('/leads/picker', superadminLeadsController.listSuperadminLeadsPicker);
router.post('/leads/import-leads', superadminLeadsController.importSuperadminLeadsCsv);
router.post('/leads/import-clients', superadminLeadsController.importSuperadminClientsCsv);
router.get('/leads', superadminLeadsController.listSuperadminLeads);
router.post('/leads', superadminLeadsController.createSuperadminLead);
router.patch('/leads/:id', superadminLeadsController.patchSuperadminLead);
router.delete('/leads/:id', superadminLeadsController.deleteSuperadminLead);

/** Scripts de manutenção pré-aprovados (sem SQL livre). */
router.get(
  '/advanced/whatsapp-avatar-cache-worker/status',
  adminScriptsController.getWhatsappAvatarCacheWorkerStatus,
);
router.get('/advanced/scripts', adminScriptsController.listAdminScripts);
router.post('/advanced/scripts/:scriptKey/preview', adminScriptsController.previewAdminScript);
router.post('/advanced/scripts/:scriptKey/execute', adminScriptsController.executeAdminScript);
router.post('/advanced/media/test-save-buffer', postSuperadminMediaTestSaveBuffer);
router.get('/advanced/media/assets', listSuperadminRecentMediaAssets);

export default router;
