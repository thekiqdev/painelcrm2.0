import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getWizardStateAuth,
  getWizardSummary,
  getWizardWhatsappStatus,
  postWizardCompany,
  postWizardUsers,
  postWizardSkip,
  postWizardWhatsappComplete,
} from '../controllers/acquisitionOnboardingWizardController.js';

const router = Router();

router.use(authenticateToken);

router.get('/state', getWizardStateAuth);
router.get('/summary', getWizardSummary);
router.post('/company', postWizardCompany);
router.post('/users', postWizardUsers);
router.post('/skip', postWizardSkip);
router.get('/whatsapp/status', getWizardWhatsappStatus);
router.post('/whatsapp/complete', postWizardWhatsappComplete);

export default router;
