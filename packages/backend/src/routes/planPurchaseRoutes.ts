import { Router } from 'express';
import { optionalAuthenticateAndTenant } from '../middleware/auth.js';
import * as planPurchaseController from '../controllers/planPurchaseController.js';

const router = Router();

router.post('/validate-admin', planPurchaseController.postValidateCheckoutAdmin);

router.post(
  '/complete-signup-trial',
  optionalAuthenticateAndTenant,
  planPurchaseController.postCompleteSignupTrial
);

router.post(
  '/',
  optionalAuthenticateAndTenant,
  planPurchaseController.postPlanPurchase
);

export default router;
