import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Endpoints do Dashboard
router.get('/stats', authenticateToken, dashboardController.getDashboardStats);
router.get('/kpis', authenticateToken, dashboardController.getKPIs);
router.get('/charts/sales', authenticateToken, dashboardController.getSalesChart);
router.get('/charts/leads', authenticateToken, dashboardController.getLeadsChart);
router.get('/funnel', authenticateToken, dashboardController.getFunnelData);
router.get('/activities', authenticateToken, dashboardController.getRecentActivities);
router.get('/tasks', authenticateToken, dashboardController.getUpcomingTasks);

export default router;

