import { Router } from 'express';
import { appointmentsAuth } from '../middleware/auth.js';
import {
  getAppointmentsHandler,
  getAppointmentByIdHandler,
  postAppointmentHandler,
  patchAppointmentHandler,
  postAppointmentCancelHandler,
  postAppointmentRetrySyncHandler,
} from '../controllers/appointmentsController.js';

const router = Router();
router.use(...appointmentsAuth);

router.get('/', getAppointmentsHandler);
router.get('/:id', getAppointmentByIdHandler);
router.post('/', postAppointmentHandler);
router.patch('/:id', patchAppointmentHandler);
router.post('/:id/cancel', postAppointmentCancelHandler);
router.post('/:id/retry-sync', postAppointmentRetrySyncHandler);

export default router;
