import { Router } from 'express';
import * as clientGroupsController from '../controllers/clientGroupsController.js';
import { tenantAuth } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuth);

router.get('/', clientGroupsController.getClientGroups);
router.get('/:id', clientGroupsController.getClientGroupById);
router.post('/', clientGroupsController.createClientGroup);
router.patch('/:id', clientGroupsController.updateClientGroup);
router.delete('/:id', clientGroupsController.deleteClientGroup);

export default router;


