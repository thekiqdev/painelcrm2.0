import { Router } from 'express';
import { getBillingReceipts } from '../controllers/financeController.js';
import { tenantAuth } from '../middleware/auth.js';

const router = Router();

router.use(...tenantAuth);

router.get('/billing-receipts', getBillingReceipts);

export default router;
