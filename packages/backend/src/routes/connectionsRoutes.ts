import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as c from '../controllers/connectionsController.js';

const router = Router();

const writeLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});

router.get('/', c.getConnections);
router.put('/flags', writeLimit, c.putConnectionFlag);
router.post('/whatsapp-official/disconnect', writeLimit, c.postWhatsappOfficialDisconnect);

export default router;
