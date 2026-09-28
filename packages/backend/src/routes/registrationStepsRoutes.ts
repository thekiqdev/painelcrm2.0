import { Router } from 'express';
import * as registrationStepsController from '../controllers/registrationStepsController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

router.post('/', registrationStepsController.upsertRegistrationStep);

export default router;

