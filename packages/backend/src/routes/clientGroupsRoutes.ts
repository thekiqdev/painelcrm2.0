import { Router } from 'express';
import * as clientGroupsController from '../controllers/clientGroupsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, clientGroupsController.getClientGroups);
router.get('/:id', authenticateToken, clientGroupsController.getClientGroupById);
router.post('/', authenticateToken, clientGroupsController.createClientGroup);
router.patch('/:id', authenticateToken, clientGroupsController.updateClientGroup);
router.delete('/:id', authenticateToken, clientGroupsController.deleteClientGroup);

export default router;


