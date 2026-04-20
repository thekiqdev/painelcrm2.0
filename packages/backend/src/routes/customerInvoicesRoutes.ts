import { Router } from 'express';
import {
  listCustomerInvoices,
  getCustomerInvoiceById,
  getCustomerInvoiceRecurrenceHistory,
  getCustomerInvoicePreconditions,
  getCustomerInvoicesGatewayStatus,
  createCustomerInvoice,
  updateCustomerInvoice,
  deleteCustomerInvoice,
} from '../controllers/customerInvoicesController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/', listCustomerInvoices);
router.get('/gateway-status', getCustomerInvoicesGatewayStatus);
router.get('/preconditions', getCustomerInvoicePreconditions);
router.get('/:id/recurrence-history', getCustomerInvoiceRecurrenceHistory);
router.get('/:id', getCustomerInvoiceById);
router.post('/', createCustomerInvoice);
router.patch('/:id', updateCustomerInvoice);
router.delete('/:id', deleteCustomerInvoice);

export default router;
