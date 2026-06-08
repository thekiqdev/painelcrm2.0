import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getAcquisitionConfig,
  getAcquisitionLead,
  getOnboardingSession,
  postActivateTrial,
  postContactCapture,
  postContactResolve,
  postMarkAbandoned,
  postProvisionOnboarding,
  postSignupStep,
  postTesteGratis,
  getAcquisitionSlugCheck,
} from '../controllers/acquisitionController.js';
import { getWizardStatePublic } from '../controllers/acquisitionOnboardingWizardController.js';

const router = Router();

const acquisitionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_ACQUISITION_MAX || '60', 10),
  message: { ok: false, error: 'Muitas tentativas. Aguarde.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});

router.get('/config', acquisitionLimiter, getAcquisitionConfig);
router.get('/slug/check', acquisitionLimiter, getAcquisitionSlugCheck);
router.post('/contact/capture', acquisitionLimiter, postContactCapture);
router.post('/contact/resolve', acquisitionLimiter, postContactResolve);
router.post('/teste-gratis', acquisitionLimiter, postTesteGratis);
router.post('/signup/step', acquisitionLimiter, postSignupStep);
router.post('/activate/trial', acquisitionLimiter, postActivateTrial);
router.get('/onboarding/session/:sessionToken', acquisitionLimiter, getOnboardingSession);
router.get('/onboarding/wizard/:sessionToken', acquisitionLimiter, getWizardStatePublic);
router.post('/onboarding/provision', acquisitionLimiter, postProvisionOnboarding);
router.get('/leads/:leadId', acquisitionLimiter, getAcquisitionLead);
router.post('/leads/:leadId/abandon', acquisitionLimiter, postMarkAbandoned);

export default router;
