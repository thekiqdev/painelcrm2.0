import { Router } from 'express';
import { superadminAuth } from '../middleware/auth.js';
import * as superadminController from '../controllers/superadminController.js';
import * as auditLogController from '../controllers/auditLogController.js';
import * as reportsController from '../controllers/reportsController.js';
import * as exportController from '../controllers/exportController.js';
import * as superadminUsersController from '../controllers/superadminUsersController.js';
import * as systemFeaturesController from '../controllers/systemFeaturesController.js';
import { checkAndNotifyTrialEnding } from '../services/superadminNotificationsService.js';

const router = Router();

router.use(...superadminAuth);

router.get('/me', superadminController.getSuperAdminMe);
router.get('/dashboard', superadminController.getDashboard);
router.get('/audit-log', auditLogController.getAuditLog);
router.get('/reports', reportsController.getReports);

router.get('/export/clients', exportController.exportClients);
router.get('/export/plans', exportController.exportPlans);
router.get('/export/usage', exportController.exportUsage);

router.get('/users', superadminUsersController.listSuperAdmins);
router.post('/users', superadminUsersController.addSuperAdmin);
router.post('/impersonate', superadminUsersController.impersonateUser);
router.put('/users/:id/password', superadminUsersController.changeUserPassword);
router.delete('/users/:id', superadminUsersController.removeSuperAdmin);

router.post('/notifications/check-trials', async (req, res) => {
  try {
    const { notified } = await checkAndNotifyTrialEnding();
    res.json({ ok: true, notified });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal server error' });
  }
});

router.get('/features', systemFeaturesController.listSystemFeatures);
router.get('/features/:id', systemFeaturesController.getSystemFeature);
router.post('/features', systemFeaturesController.createSystemFeature);
router.put('/features/:id', systemFeaturesController.updateSystemFeature);
router.delete('/features/:id', systemFeaturesController.deleteSystemFeature);

export default router;
