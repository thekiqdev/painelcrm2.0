import { Router } from 'express';
import {
  listCustomerInvoices,
  getCustomerInvoiceById,
  getCustomerInvoiceRecurrenceHistory,
  getCustomerInvoicePreconditions,
  getCustomerInvoicesGatewayStatus,
  createCustomerInvoice,
  updateCustomerInvoice,
} from '../controllers/customerInvoicesController.js';
import { tenantAuth } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuth);

router.get('/', listCustomerInvoices);
router.get('/gateway-status', getCustomerInvoicesGatewayStatus);
router.get('/preconditions', getCustomerInvoicePreconditions);
router.get('/:id/recurrence-history', getCustomerInvoiceRecurrenceHistory);
router.get('/:id', getCustomerInvoiceById);
router.post('/', createCustomerInvoice);
router.patch('/:id', updateCustomerInvoice);

export default router;
