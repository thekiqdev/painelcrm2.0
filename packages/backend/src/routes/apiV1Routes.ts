import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { postV1Lead } from '../apiKeys/apiV1LeadController.js';
import { apiV1RateLimitKey } from '../apiKeys/extractApiKey.js';

const apiV1Limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => apiV1RateLimitKey(req),
  message: {
    error: 'Muitas requisições. Aguarde um momento antes de tentar novamente.',
    code: 'RATE_LIMITED',
  },
  skip: () => process.env.NODE_ENV === 'development',
});

const router = Router();

router.use(apiV1Limiter);
router.post('/leads', postV1Lead);

export default router;
