import { Router } from 'express';
import { tenantAuthCrm } from '../middleware/auth.js';
import * as supportPortalSettingsController from '../controllers/supportPortalSettingsController.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/settings', supportPortalSettingsController.getSupportPortalSettings);
router.put('/settings', supportPortalSettingsController.putSupportPortalSettings);

export default router;
