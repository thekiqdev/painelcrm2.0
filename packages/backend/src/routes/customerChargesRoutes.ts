import { Router } from 'express';
import {
  listCustomerCharges,
  getCustomerChargeById,
  createCustomerCharge,
  updateCustomerCharge,
} from '../controllers/customerChargesController.js';
import { tenantAuth } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuth);

router.get('/', listCustomerCharges);
router.get('/:id', getCustomerChargeById);
router.post('/', createCustomerCharge);
router.patch('/:id', updateCustomerCharge);

export default router;
