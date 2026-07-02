import { Router } from 'express';
import { superadminAuth } from '../middleware/auth.js';
import * as superadminController from '../controllers/superadminController.js';
import * as superadminDashboardController from '../controllers/superadminDashboardController.js';
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
import * as superadminPlatformTrackingController from '../controllers/superadminPlatformTrackingController.js';
import * as superadminPlatformSupportController from '../controllers/superadminPlatformSupportController.js';
import * as superadminLeadsController from '../controllers/superadminLeadsController.js';
import rateLimit from 'express-rate-limit';
import superadminWhatsappOfficialRoutes from './superadminWhatsappOfficialRoutes.js';
import connectionsRoutes from './connectionsRoutes.js';
import superadminChatRoutes from './superadminChatRoutes.js';
import * as platformFeatureFlagsController from '../controllers/platformFeatureFlagsController.js';
import * as platformFeatureFlagsAdminController from '../controllers/platformFeatureFlagsAdminController.js';
import * as platformSignupEntryController from '../controllers/platformSignupEntryController.js';
import * as platformGrowthController from '../controllers/platformGrowthController.js';
import * as superadminWhatsappOfficialController from '../controllers/superadminWhatsappOfficialController.js';
import * as adminScriptsController from '../controllers/adminScriptsController.js';
import * as superadminLifecycleTransitionsController from '../controllers/superadminLifecycleTransitionsController.js';
import * as superadminTrialExpirationController from '../controllers/superadminTrialExpirationController.js';
import * as commercialAnalyticsController from '../controllers/commercialAnalyticsController.js';
import {
  getSuperadminMediaStorageDiagnostics,
  listSuperadminRecentMediaAssets,
  postSuperadminMediaTestSaveBuffer,
} from '../services/media/mediaController.js';

const router = Router();

const metaIntegrationWriteLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});

router.use(...superadminAuth);

router.get('/me', superadminController.getSuperAdminMe);
router.get('/platform-feature-flags', platformFeatureFlagsController.listPlatformFeatureFlags);
router.get('/platform/signup-acquisition', platformSignupEntryController.getSuperadminSignupAcquisitionSettings);
router.patch('/platform/signup-acquisition', platformSignupEntryController.patchSuperadminSignupAcquisitionSettings);
router.get('/platform/growth/signup-strategy', platformGrowthController.getSuperadminSignupStrategy);
router.patch('/platform/growth/signup-strategy', platformGrowthController.patchSuperadminSignupStrategy);
router.get('/advanced/feature-flags', platformFeatureFlagsAdminController.listAdvancedFeatureFlags);
router.patch('/advanced/feature-flags/:key', platformFeatureFlagsAdminController.patchAdvancedFeatureFlag);
router.get('/dashboard', superadminDashboardController.getSuperadminDashboard);
router.get('/commercial/metrics', commercialAnalyticsController.getSuperadminCommercialMetrics);
router.get(
  '/commercial/overrides/report',
  commercialAnalyticsController.getSuperadminCommercialOverridesReport,
);
router.get('/audit-log', auditLogController.getAuditLog);
router.get('/lifecycle/transitions', superadminLifecycleTransitionsController.getSuperadminLifecycleTransitions);
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
router.get('/billing/health', superadminBillingController.getBillingHealthHandler);
router.get('/billing/observability', superadminBillingController.getBillingObservabilityHandler);
/** @deprecated Sprint 3.2B — use /billing/observability */
router.get('/billing/v2-observability', superadminBillingController.getBillingObservabilityHandler);
router.get('/billing/engine-health', superadminBillingController.getBillingEngineHealthHandler);
router.get(
  '/billing/shadow-report/:subscriptionId',
  superadminBillingController.getBillingShadowReportHandler,
);
router.get('/billing/consistency', superadminBillingController.getBillingConsistencyDashboardHandler);
router.get(
  '/billing/consistency/:subscriptionId',
  superadminBillingController.getBillingConsistencyReportHandler,
);
router.post(
  '/billing/consistency/:subscriptionId/validate',
  superadminBillingController.postBillingConsistencyValidateHandler,
);
router.get(
  '/billing/context/:subscriptionId',
  superadminBillingController.getBillingExecutionContextHandler,
);
router.post(
  '/billing/context/:subscriptionId/rebuild',
  superadminBillingController.postBillingExecutionContextRebuildHandler,
);
router.get(
  '/billing/projection/:subscriptionId',
  superadminBillingController.getBillingProjectionHandler,
);
router.post(
  '/billing/projection/:subscriptionId/compare',
  superadminBillingController.postBillingProjectionCompareHandler,
);
router.get(
  '/billing/migration-readiness',
  superadminBillingController.getBillingMigrationReadinessDashboardHandler,
);
router.get(
  '/billing/migration-readiness/:tenantId',
  superadminBillingController.getBillingMigrationReadinessHandler,
);
router.post(
  '/billing/migration-readiness/:tenantId/evaluate',
  superadminBillingController.postBillingMigrationReadinessEvaluateHandler,
);
router.get(
  '/billing/migration-simulator',
  superadminBillingController.getBillingMigrationSimulatorDashboardHandler,
);
router.get(
  '/billing/migration-simulator/:tenantId',
  superadminBillingController.getBillingMigrationSimulatorHandler,
);
router.post(
  '/billing/migration-simulator/:tenantId/run',
  superadminBillingController.postBillingMigrationSimulatorRunHandler,
);
router.get('/billing/cutover', superadminBillingController.getBillingCutoverDashboardHandler);
router.get(
  '/billing/cutover/:tenantId',
  superadminBillingController.getBillingCutoverHandler,
);
router.post(
  '/billing/cutover/:tenantId/evaluate',
  superadminBillingController.postBillingCutoverEvaluateHandler,
);
router.get(
  '/billing/certification',
  superadminBillingController.getBillingCertificationDashboardHandler,
);
router.get(
  '/billing/certification/:subscriptionId',
  superadminBillingController.getBillingCertificationHandler,
);
router.post(
  '/billing/certification/run',
  superadminBillingController.postBillingCertificationRunHandler,
);
router.post(
  '/billing/certification/:subscriptionId/evaluate',
  superadminBillingController.postBillingCertificationEvaluateHandler,
);
router.post('/billing/recovery/run', superadminBillingController.postBillingRecoveryRunHandler);
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
router.use('/chat', superadminChatRoutes);

/** Configuração SMTP (persistência em superadmin_settings; sem envio transacional automático). */
router.get('/smtp-settings', smtpSuperadminSettingsController.getSmtpSuperadminSettingsHandler);
router.put('/smtp-settings', smtpSuperadminSettingsController.putSmtpSuperadminSettingsHandler);
router.post('/smtp-settings/test', smtpSuperadminSettingsController.postSmtpSuperadminTestEmailHandler);
router.get('/tracking-settings', superadminPlatformTrackingController.getSuperadminPlatformTrackingSettings);
router.put('/tracking-settings', superadminPlatformTrackingController.putSuperadminPlatformTrackingSettings);
router.post('/tracking-settings/test', superadminPlatformTrackingController.postSuperadminPlatformTrackingTest);

router.get('/platform-support/settings', superadminPlatformSupportController.getSuperadminPlatformSupportSettings);
router.put('/platform-support/settings', superadminPlatformSupportController.putSuperadminPlatformSupportSettings);
router.get('/platform-support/summary', superadminPlatformSupportController.getSuperadminPlatformSupportSummary);
router.get('/platform-support/tickets', superadminPlatformSupportController.getSuperadminPlatformSupportTickets);
router.get('/platform-support/tickets/:id', superadminPlatformSupportController.getSuperadminPlatformSupportTicketDetail);
router.post(
  '/platform-support/tickets/:id/messages',
  superadminPlatformSupportController.postSuperadminPlatformSupportTicketMessage,
);
router.put(
  '/platform-support/tickets/:id/status',
  superadminPlatformSupportController.patchSuperadminPlatformSupportTicketStatus,
);

router.put('/legal/:page/draft', superadminLegalPagesController.putSuperadminLegalDraft);
router.post('/legal/:page/publish', superadminLegalPagesController.postSuperadminLegalPublish);
router.get('/legal/:page', superadminLegalPagesController.getSuperadminLegalPage);

router.use('/announcements', superadminAnnouncementRoutes);

router.use('/connections', connectionsRoutes);

router.post(
  '/integrations/meta/whatsapp/configure-webhook',
  metaIntegrationWriteLimit,
  superadminWhatsappOfficialController.postMetaWhatsappConfigureWebhook,
);

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
router.post(
  '/advanced/trial-expiration/execute',
  superadminTrialExpirationController.postSuperadminTrialExpirationExecute,
);
router.get('/advanced/scripts', adminScriptsController.listAdminScripts);
router.post('/advanced/scripts/:scriptKey/preview', adminScriptsController.previewAdminScript);
router.post('/advanced/scripts/:scriptKey/execute', adminScriptsController.executeAdminScript);
router.post('/advanced/media/test-save-buffer', postSuperadminMediaTestSaveBuffer);
router.get('/advanced/media/storage-diagnostics', getSuperadminMediaStorageDiagnostics);
router.get('/advanced/media/assets', listSuperadminRecentMediaAssets);

export default router;
