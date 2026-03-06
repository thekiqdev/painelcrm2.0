import { Router } from 'express';
import { searchGlobal } from '../controllers/searchController.js';
import { tenantAuth } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuth);

router.get('/', searchGlobal);

export default router;

