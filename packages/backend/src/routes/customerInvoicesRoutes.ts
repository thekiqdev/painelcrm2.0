import { Router } from 'express';
import {
  listCustomerInvoices,
  getCustomerInvoicesSummaryHandler,
  getCustomerInvoiceById,
  getCustomerInvoiceRecurrenceInsightHandler,
  getCustomerInvoiceRecurrenceHistory,
  getCustomerInvoicePreconditions,
  getCustomerInvoicesGatewayStatus,
  createCustomerInvoice,
  patchCustomerInvoiceRecurrenceNextBilling,
  updateCustomerInvoice,
  deleteCustomerInvoice,
  postCustomerInvoiceMercadoPagoCreatePayment,
  confirmCustomerInvoiceManualPaymentHandler,
} from '../controllers/customerInvoicesController.js';
import { tenantAuthCrm } from '../middleware/auth.js';
import { mercadoPagoFeatureGuard } from '../middleware/mercadoPagoFeatureGuard.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/', listCustomerInvoices);
router.get('/summary', getCustomerInvoicesSummaryHandler);
router.get('/gateway-status', getCustomerInvoicesGatewayStatus);
router.get('/preconditions', getCustomerInvoicePreconditions);
router.get('/:id/recurrence-insight', getCustomerInvoiceRecurrenceInsightHandler);
router.get('/:id/recurrence-history', getCustomerInvoiceRecurrenceHistory);
router.post(
  '/:id/mercado-pago/create-payment',
  mercadoPagoFeatureGuard,
  postCustomerInvoiceMercadoPagoCreatePayment,
);
router.post('/:id/confirm-manual-payment', confirmCustomerInvoiceManualPaymentHandler);
router.get('/:id', getCustomerInvoiceById);
router.post('/', createCustomerInvoice);
router.patch('/:id/recurrence/next-billing', patchCustomerInvoiceRecurrenceNextBilling);
router.patch('/:id', updateCustomerInvoice);
router.delete('/:id', deleteCustomerInvoice);

export default router;
