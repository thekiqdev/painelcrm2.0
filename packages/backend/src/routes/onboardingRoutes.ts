import { Router } from 'express';
import { tenantAuth } from '../middleware/auth.js';
import * as onboardingController from '../controllers/onboardingController.js';

const router = Router();

router.post('/create-admin', onboardingController.postOnboardingCreateAdmin);

router.use(...tenantAuth);
router.get('/tenant-data', onboardingController.getOnboardingTenantData);
router.patch('/company', onboardingController.patchOnboardingCompany);
router.post('/complete', onboardingController.postOnboardingComplete);

export default router;
