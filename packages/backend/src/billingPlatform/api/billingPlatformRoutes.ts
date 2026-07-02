import { Router } from 'express';
import * as billingPlatformController from './billingPlatformController.js';

const router = Router();

router.get('/', billingPlatformController.getPlatformRoot);
router.get('/analytics', billingPlatformController.getPlatformAnalytics);
router.get('/reports', billingPlatformController.getPlatformReports);
router.get('/forecast', billingPlatformController.getPlatformForecast);
router.get('/recovery', billingPlatformController.getPlatformRecovery);
router.get('/events', billingPlatformController.getPlatformEvents);
router.get('/intelligence', billingPlatformController.getPlatformIntelligence);
router.get('/automation', billingPlatformController.getPlatformAutomation);
router.get('/observability', billingPlatformController.getPlatformObservability);

router.post('/provision/subscription/:id', billingPlatformController.postProvisionSubscription);
router.post('/repair/subscription/:id', billingPlatformController.postRepairSubscription);
router.get('/provision/status/:id', billingPlatformController.getProvisionStatus);

export default router;
