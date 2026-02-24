import { Router } from 'express';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth.js';
import * as plansController from '../controllers/plansController.js';

const router = Router();

router.use(authenticateToken);
router.use(requireSuperAdmin);

router.get('/', plansController.listPlans);
router.get('/feature-keys', plansController.listFeatureKeys);
router.get('/default', plansController.getDefaultPlan);
router.post('/', plansController.createPlan);
router.get('/:id', plansController.getPlan);
router.get('/:id/features', plansController.getPlanFeatures);
router.put('/:id', plansController.updatePlan);
router.put('/:id/features', plansController.putPlanFeatures);
router.delete('/:id', plansController.deletePlan);

export default router;
