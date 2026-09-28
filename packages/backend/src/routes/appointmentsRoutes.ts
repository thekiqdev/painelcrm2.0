import { Router } from 'express';
import { appointmentsAuth } from '../middleware/auth.js';
import {
  getTenantAvailabilitySettingsHandler,
  patchTenantAvailabilitySettingsHandler,
  getUserAvailabilitySettingsHandler,
  patchUserAvailabilitySettingsHandler,
} from '../controllers/appointmentAvailabilityController.js';
import {
  listAvailabilityBlocksHandler,
  createAvailabilityBlockHandler,
  patchAvailabilityBlockHandler,
  cancelAvailabilityBlockHandler,
} from '../controllers/appointmentAvailabilityBlocksController.js';
import {
  listAppointmentHolidaysHandler,
  createAppointmentHolidayHandler,
  patchAppointmentHolidayHandler,
  disableAppointmentHolidayHandler,
} from '../controllers/appointmentHolidaysController.js';
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
import {
  listAppointmentTypeSettingsHandler,
  postAppointmentTypeSettingsHandler,
  patchAppointmentTypeSettingsHandler,
  postAppointmentTypeSettingsDisableHandler,
} from '../controllers/appointmentTypeSettingsController.js';

const router = Router();
router.use(...appointmentsAuth);

router.get('/tenant-availability-settings', getTenantAvailabilitySettingsHandler);
router.patch('/tenant-availability-settings', patchTenantAvailabilitySettingsHandler);
router.get('/user-availability-settings', getUserAvailabilitySettingsHandler);
router.patch('/user-availability-settings', patchUserAvailabilitySettingsHandler);

router.get('/holidays', listAppointmentHolidaysHandler);
router.post('/holidays', createAppointmentHolidayHandler);
router.patch('/holidays/:id', patchAppointmentHolidayHandler);
router.post('/holidays/:id/disable', disableAppointmentHolidayHandler);

router.get('/availability-blocks', listAvailabilityBlocksHandler);
router.post('/availability-blocks', createAvailabilityBlockHandler);
router.patch('/availability-blocks/:id', patchAvailabilityBlockHandler);
router.post('/availability-blocks/:id/cancel', cancelAvailabilityBlockHandler);

router.get('/type-settings', listAppointmentTypeSettingsHandler);
router.post('/type-settings', postAppointmentTypeSettingsHandler);
router.patch('/type-settings/:id', patchAppointmentTypeSettingsHandler);
router.post('/type-settings/:id/disable', postAppointmentTypeSettingsDisableHandler);

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
