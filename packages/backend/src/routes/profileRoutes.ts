import { Router } from 'express';
import * as profileController from '../controllers/profileController.js';
import { tenantAuth } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuth);

router.get('/', profileController.getProfile);
router.patch('/', profileController.updateProfile);

export default router;

