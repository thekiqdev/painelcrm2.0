import { Router } from 'express';
import {
  listCustomerCharges,
  getCustomerChargeById,
  createCustomerCharge,
  updateCustomerCharge,
} from '../controllers/customerChargesController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/', listCustomerCharges);
router.get('/:id', getCustomerChargeById);
router.post('/', createCustomerCharge);
router.patch('/:id', updateCustomerCharge);

export default router;
