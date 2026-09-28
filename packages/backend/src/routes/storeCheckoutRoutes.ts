import { Router } from 'express';
import {
  postStoreCheckoutClientEligibility,
  postStoreCheckoutCreate,
} from '../controllers/storeCheckoutController.js';

const router = Router();

router.post('/client-eligibility', postStoreCheckoutClientEligibility);
router.post('/create', postStoreCheckoutCreate);

export default router;
