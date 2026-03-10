import { Router } from 'express';
import { optionalAuthenticateAndTenant } from '../middleware/auth.js';
import * as planPurchaseController from '../controllers/planPurchaseController.js';

const router = Router();

router.post(
  '/',
  optionalAuthenticateAndTenant,
  planPurchaseController.postPlanPurchase
);

export default router;
