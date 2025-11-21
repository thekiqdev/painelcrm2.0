import { Router } from 'express';
import * as storeProfileController from '../controllers/storeProfileController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Protected routes
router.get('/', authenticateToken, storeProfileController.getStoreProfile);
router.post('/', authenticateToken, storeProfileController.createStoreProfile);
router.patch('/', authenticateToken, storeProfileController.updateStoreProfile);

// Public routes
router.get('/public/:userId', storeProfileController.getPublicStoreProfile);
router.get('/public/slug/:slug', storeProfileController.getPublicStoreBySlug);

export default router;


