import { Router } from 'express';
import { searchGlobal } from '../controllers/searchController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/', searchGlobal);

export default router;

