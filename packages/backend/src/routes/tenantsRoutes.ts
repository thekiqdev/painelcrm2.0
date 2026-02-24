import { Router } from 'express';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth.js';
import * as tenantsController from '../controllers/tenantsController.js';

const router = Router();

router.use(authenticateToken);
router.use(requireSuperAdmin);

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
