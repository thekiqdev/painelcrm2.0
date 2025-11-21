import { Router } from 'express';
import { searchGlobal } from '../controllers/searchController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, searchGlobal);

export default router;

