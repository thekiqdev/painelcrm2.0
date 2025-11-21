import { Router } from 'express';
import * as profileController from '../controllers/profileController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, profileController.getProfile);
router.patch('/', authenticateToken, profileController.updateProfile);

export default router;

