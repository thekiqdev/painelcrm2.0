import { Router } from 'express';
import * as clientsController from '../controllers/clientsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, clientsController.getClients);
router.get('/:id', authenticateToken, clientsController.getClientById);
router.post('/', authenticateToken, clientsController.createClient);
router.patch('/:id', authenticateToken, clientsController.updateClient);
router.delete('/:id', authenticateToken, clientsController.deleteClient);

// Client tasks routes - devem vir antes de /:id para evitar conflito
router.get('/:id/tasks', authenticateToken, clientsController.getClientTasks);
router.post('/tasks', authenticateToken, clientsController.createClientTask);
router.patch('/tasks/:id', authenticateToken, clientsController.updateClientTask);
router.delete('/tasks/:id', authenticateToken, clientsController.deleteClientTask);

export default router;

