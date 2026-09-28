import { Router } from 'express';
import { superadminAuth } from '../middleware/auth.js';
import * as commercialOverridesController from '../controllers/commercialOverridesController.js';
import * as tenantsController from '../controllers/tenantsController.js';

const router = Router();

router.use(...superadminAuth);

router.get('/', tenantsController.listTenants);
router.get('/:id/features', tenantsController.getTenantFeatures);
router.get('/:id/plan-history', tenantsController.getTenantPlanHistory);
router.get('/:id/billing', tenantsController.getTenantBilling);
router.get('/:id/users', tenantsController.getTenantUsers);
router.get('/:id/usage', tenantsController.getTenantUsage);
router.get('/:id/primary-user', tenantsController.getPrimaryUser);
router.get('/:id/notes', tenantsController.getTenantNotes);
router.get('/:id/tags', tenantsController.getTenantTags);
router.get('/:id/audit-log', tenantsController.getTenantAuditLog);
router.get('/:tenantId/commercial', commercialOverridesController.getTenantCommercial);
router.get(
  '/:tenantId/commercial/overrides',
  commercialOverridesController.listTenantCommercialOverridesHandler,
);
router.post(
  '/:tenantId/commercial/overrides',
  commercialOverridesController.postTenantCommercialOverride,
);
router.post(
  '/:tenantId/commercial/simulate',
  commercialOverridesController.postTenantCommercialSimulate,
);
router.post(
  '/:tenantId/commercial/reactivate-waive',
  commercialOverridesController.postCommercialWaiveReactivation,
);
router.patch(
  '/:tenantId/commercial/overrides/:id',
  commercialOverridesController.patchTenantCommercialOverrideHandler,
);
router.delete(
  '/:tenantId/commercial/overrides/:id',
  commercialOverridesController.deleteTenantCommercialOverride,
);
router.get('/:id', tenantsController.getTenant);
router.post('/:id/billing/charge', tenantsController.createTenantCharge);
router.post('/:id/notes', tenantsController.postTenantNote);
router.post('/', tenantsController.createTenant);
router.put('/:id/features', tenantsController.putTenantFeatures);
router.put('/:id/notes/:noteId', tenantsController.putTenantNote);
router.put('/:id/tags', tenantsController.putTenantTags);
router.put('/:id/limits', tenantsController.putTenantLimits);
router.put('/:id/primary-user', tenantsController.updatePrimaryUser);
router.put('/:id', tenantsController.updateTenant);
router.delete('/:id/notes/:noteId', tenantsController.deleteTenantNote);
router.delete('/:id', tenantsController.deleteTenant);

export default router;
