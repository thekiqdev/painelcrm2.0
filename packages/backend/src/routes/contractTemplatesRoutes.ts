import { Router } from 'express';
import * as contractTemplatesController from '../controllers/contractTemplatesController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, contractTemplatesController.getContractTemplates);
router.post('/', authenticateToken, contractTemplatesController.createContractTemplate);
router.patch('/:id', authenticateToken, contractTemplatesController.updateContractTemplate);
router.delete('/:id', authenticateToken, contractTemplatesController.deleteContractTemplate);

export default router;

