import { Router } from 'express';
import { tenantAuthCrm } from '../middleware/auth.js';
import {
  listCrmSubscriptions,
  getCrmSubscriptionsAnalyticsHandler,
  getCrmSubscription,
  patchCrmSubscriptionCyclesHandler,
  patchCrmSubscriptionNextBillingHandler,
  postCrmSubscriptionCancel,
} from '../controllers/crmSubscriptionsController.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/analytics', getCrmSubscriptionsAnalyticsHandler);
router.get('/', listCrmSubscriptions);
router.get('/:id', getCrmSubscription);
router.patch('/:id/cycles-config', patchCrmSubscriptionCyclesHandler);
router.patch('/:id/next-billing', patchCrmSubscriptionNextBillingHandler);
router.post('/:id/cancel', postCrmSubscriptionCancel);

export default router;
