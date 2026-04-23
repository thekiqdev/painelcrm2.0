import { Router } from 'express';
import { tenantAuthCrm } from '../middleware/auth.js';
import { requirePermission } from '../permissions/requirePermission.js';
import {
  listNotificationDeliveries,
  listNotificationDeliveriesFiltered,
  listNotificationEvents,
  getTenantNotificationsEngineSummary,
  simulateNotification,
  getNotificationsEngineBootstrap,
  getTenantCatalogWithState,
  getTenantTemplateBundle,
  putTenantNotificationPreference,
  putTenantNotificationOverride,
  deleteTenantNotificationOverrideHandler,
  postTenantNotificationPreview,
} from '../controllers/notificationsEngineController.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/bootstrap', getNotificationsEngineBootstrap);

router.get('/events', listNotificationEvents);
router.get('/deliveries', listNotificationDeliveries);
router.get('/deliveries/search', listNotificationDeliveriesFiltered);
router.get('/metrics/summary', getTenantNotificationsEngineSummary);
router.post('/simulate', simulateNotification);

router.get('/tenant/catalog-with-state', requirePermission('settings.view'), getTenantCatalogWithState);
router.get('/tenant/template-bundle/:eventKey', requirePermission('settings.view'), getTenantTemplateBundle);
router.put('/tenant/preferences/:eventKey', requirePermission('settings.edit'), putTenantNotificationPreference);
router.put('/tenant/override/:eventKey', requirePermission('settings.edit'), putTenantNotificationOverride);
router.delete('/tenant/override/:eventKey', requirePermission('settings.edit'), deleteTenantNotificationOverrideHandler);
router.post('/tenant/preview', requirePermission('settings.view'), postTenantNotificationPreview);

export default router;
