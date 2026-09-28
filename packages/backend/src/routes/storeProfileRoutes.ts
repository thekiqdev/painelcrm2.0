import { Router } from 'express';
import * as storeProfileController from '../controllers/storeProfileController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();

// Public routes (sem auth)
router.get('/public/:userId', storeProfileController.getPublicStoreProfile);
router.get('/public/slug/:slug', storeProfileController.getPublicStoreBySlug);

// Protected routes (auth + tenant)
router.use(...tenantAuthCrm);
router.get('/', storeProfileController.getStoreProfile);
router.post('/', storeProfileController.createStoreProfile);
router.patch('/', storeProfileController.updateStoreProfile);

export default router;


