import { Router } from 'express';
import * as clientsController from '../controllers/clientsController.js';
import { tenantAuthCrm } from '../middleware/auth.js';
import { requirePermission } from '../permissions/index.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/', clientsController.getClients);
router.get('/:id/timeline', clientsController.getClientTimeline);
router.post('/:id/timeline/events', clientsController.createClientTimeline);
router.get('/:id', clientsController.getClientById);
router.post('/', requirePermission('clients.create'), clientsController.createClient);
router.patch('/:id', clientsController.updateClient);
router.delete('/:id', clientsController.deleteClient);

// Client tasks routes - devem vir antes de /:id para evitar conflito
router.get('/:id/tasks', clientsController.getClientTasks);
router.post('/tasks', clientsController.createClientTask);
router.patch('/tasks/:id', clientsController.updateClientTask);
router.delete('/tasks/:id', clientsController.deleteClientTask);

export default router;

