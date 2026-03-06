import { Router } from 'express';
import * as registrationStepsController from '../controllers/registrationStepsController.js';
import { tenantAuth } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuth);

router.post('/', registrationStepsController.upsertRegistrationStep);

export default router;

