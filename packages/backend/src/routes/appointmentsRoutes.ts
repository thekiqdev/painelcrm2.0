import { Router } from 'express';
import { appointmentsAuth } from '../middleware/auth.js';
import {
  getAppointmentsHandler,
  getAppointmentConflictsHandler,
  getAppointmentsReportsSummaryHandler,
  getAppointmentsByClientHandler,
  getAppointmentByIdHandler,
  postAppointmentHandler,
  patchAppointmentHandler,
  postAppointmentCompleteHandler,
  postAppointmentCancelHandler,
  postRecurrenceSeriesCancelHandler,
  postAppointmentCancelFollowingHandler,
  postAppointmentRetrySyncHandler,
  postAppointmentRescheduleHandler,
  postAppointmentAttendanceHandler,
  postAppointmentRequestConfirmationHandler,
  patchRecurrenceSeriesHandler,
  patchAppointmentThisAndFollowingHandler,
} from '../controllers/appointmentsController.js';

const router = Router();
router.use(...appointmentsAuth);

router.get('/', getAppointmentsHandler);
router.get('/conflicts', getAppointmentConflictsHandler);
router.get('/reports/summary', getAppointmentsReportsSummaryHandler);
router.get('/client/:clientId', getAppointmentsByClientHandler);
router.get('/:id', getAppointmentByIdHandler);
router.post('/', postAppointmentHandler);
router.patch('/:id', patchAppointmentHandler);
router.post('/:id/complete', postAppointmentCompleteHandler);
router.post('/:id/cancel', postAppointmentCancelHandler);
router.post('/recurrence-series/:seriesId/cancel', postRecurrenceSeriesCancelHandler);
router.post('/:id/cancel-this-and-following', postAppointmentCancelFollowingHandler);
router.patch('/recurrence-series/:seriesId', patchRecurrenceSeriesHandler);
router.patch('/:id/this-and-following', patchAppointmentThisAndFollowingHandler);
router.post('/:id/retry-sync', postAppointmentRetrySyncHandler);
router.post('/:id/reschedule', postAppointmentRescheduleHandler);
router.post('/:id/attendance', postAppointmentAttendanceHandler);
router.post('/:id/request-confirmation', postAppointmentRequestConfirmationHandler);

export default router;
