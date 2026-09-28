import { Router } from 'express';
import { tenantAuthCrm } from '../middleware/auth.js';
import { requirePermission } from '../permissions/requirePermission.js';
import {
  listNotificationDeliveries,
  listNotificationDeliveriesFiltered,
  listNotificationDeliveryAttempts,
  listNotificationEvents,
  getTenantNotificationsEngineSummary,
  getTenantNotificationPanelSummaryHandler,
  simulateNotification,
  getNotificationsEngineBootstrap,
  getTenantCatalogWithState,
  getTenantNotificationPreferencesGrouped,
  getTenantTemplateBundle,
  putTenantNotificationPreference,
  patchTenantNotificationPreference,
  putTenantNotificationOverride,
  deleteTenantNotificationOverrideHandler,
  postTenantNotificationPreview,
} from '../controllers/notificationsEngineController.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/bootstrap', getNotificationsEngineBootstrap);

router.get('/events', listNotificationEvents);
router.get('/deliveries/search', listNotificationDeliveriesFiltered);
router.get(
  '/deliveries/:deliveryId/attempts',
  requirePermission('settings.view'),
  listNotificationDeliveryAttempts,
);
router.get('/deliveries', listNotificationDeliveries);
router.get('/metrics/summary', getTenantNotificationsEngineSummary);
router.post('/simulate', simulateNotification);

router.get('/tenant/catalog-with-state', requirePermission('settings.view'), getTenantCatalogWithState);
router.get('/tenant/summary', requirePermission('settings.view'), getTenantNotificationPanelSummaryHandler);
router.get('/tenant/preferences', requirePermission('settings.view'), getTenantNotificationPreferencesGrouped);
router.get('/tenant/template-bundle/:eventKey', requirePermission('settings.view'), getTenantTemplateBundle);
router.put('/tenant/preferences/:eventKey', requirePermission('settings.edit'), putTenantNotificationPreference);
router.patch('/tenant/preferences/:eventKey', requirePermission('settings.edit'), patchTenantNotificationPreference);
router.put('/tenant/override/:eventKey', requirePermission('settings.edit'), putTenantNotificationOverride);
router.delete('/tenant/override/:eventKey', requirePermission('settings.edit'), deleteTenantNotificationOverrideHandler);
router.post('/tenant/preview', requirePermission('settings.view'), postTenantNotificationPreview);

export default router;
