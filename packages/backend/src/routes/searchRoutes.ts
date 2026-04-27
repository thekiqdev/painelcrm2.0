import { Router } from 'express';
import { searchGlobal } from '../controllers/searchController.js';
import { searchGlobalGrouped } from '../controllers/searchGlobalController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/global', searchGlobalGrouped);
router.get('/', searchGlobal);

export default router;

