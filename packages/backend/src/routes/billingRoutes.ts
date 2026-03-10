import { Router } from 'express';
import * as billingStatusController from '../controllers/billingStatusController.js';

const router = Router();

router.get('/:billingId/status', billingStatusController.getBillingStatus);

export default router;
