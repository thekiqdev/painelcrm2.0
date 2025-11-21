import { Router } from 'express';
import * as registrationStepsController from '../controllers/registrationStepsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.post('/', authenticateToken, registrationStepsController.upsertRegistrationStep);

export default router;

