import { Router } from 'express';
import { serviceOrdersAuth } from '../middleware/auth.js';
import {
  deleteServiceOrderHandler,
  getServiceOrderByIdHandler,
  getServiceOrderDocumentHandler,
  getServiceOrderPdfHandler,
  getServiceOrdersHandler,
  patchServiceOrderHandler,
  postServiceOrderHandler,
  postServiceOrderConvertToInvoiceHandler,
  patchServiceOrderSignerHandler,
  postServiceOrderReissueInviteHandler,
  postServiceOrderRevokeLinksHandler,
  postServiceOrderRescheduleVisitHandler,
  postServiceOrderScheduleVisitHandler,
  postServiceOrderSendForSignatureHandler,
} from '../controllers/serviceOrdersController.js';

const router = Router();

router.use(...serviceOrdersAuth);

router.get('/', getServiceOrdersHandler);
router.post('/', postServiceOrderHandler);
router.get('/:id/document', getServiceOrderDocumentHandler);
router.get('/:id/pdf', getServiceOrderPdfHandler);
router.post('/:id/send-for-signature', postServiceOrderSendForSignatureHandler);
router.post('/:id/revoke-signature-links', postServiceOrderRevokeLinksHandler);
router.patch('/:id/signers/:signerId', patchServiceOrderSignerHandler);
router.post('/:id/signers/:signerId/reissue-invite', postServiceOrderReissueInviteHandler);
router.post('/:id/convert-to-invoice', postServiceOrderConvertToInvoiceHandler);
router.post('/:id/schedule-visit', postServiceOrderScheduleVisitHandler);
router.post('/:id/reschedule-visit', postServiceOrderRescheduleVisitHandler);
router.get('/:id', getServiceOrderByIdHandler);
router.patch('/:id', patchServiceOrderHandler);
router.delete('/:id', deleteServiceOrderHandler);

export default router;
