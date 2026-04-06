import { Router } from 'express';
import { getBillingReceipts } from '../controllers/financeController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();

router.use(...tenantAuthCrm);

router.get('/billing-receipts', getBillingReceipts);

export default router;
