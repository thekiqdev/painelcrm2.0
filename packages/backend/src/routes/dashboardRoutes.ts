import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

// Endpoints do Dashboard
router.get('/stats', dashboardController.getDashboardStats);
router.get('/kpis', dashboardController.getKPIs);
router.get('/charts/sales', dashboardController.getSalesChart);
router.get('/charts/leads', dashboardController.getLeadsChart);
router.get('/funnel', dashboardController.getFunnelData);
router.get('/activities', dashboardController.getRecentActivities);
router.get('/tasks', dashboardController.getUpcomingTasks);
router.get('/activation-checklist', dashboardController.getActivationChecklist);
router.post('/activation-checklist/dismiss', dashboardController.postDismissActivationChecklist);

export default router;

