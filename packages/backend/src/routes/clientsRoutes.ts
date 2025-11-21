import { Router } from 'express';
import * as clientsController from '../controllers/clientsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, clientsController.getClients);
router.get('/:id', authenticateToken, clientsController.getClientById);
router.post('/', authenticateToken, clientsController.createClient);
router.patch('/:id', authenticateToken, clientsController.updateClient);
router.delete('/:id', authenticateToken, clientsController.deleteClient);

export default router;

