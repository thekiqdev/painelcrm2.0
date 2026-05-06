import { Router } from 'express';
import * as clientsController from '../controllers/clientsController.js';
import { tenantAuthCrm } from '../middleware/auth.js';
import { requirePermission } from '../permissions/index.js';
import { clientGoogleDriveFileUploadSingle } from '../middleware/clientGoogleDriveFilesMulter.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/', clientsController.getClients);
router.get('/:id/timeline', clientsController.getClientTimeline);
router.post('/:id/timeline/events', clientsController.createClientTimeline);
router.post('/:id/google-drive/ensure-folders', clientsController.ensureClientGoogleDriveFolders);
router.get('/:id/google-drive/browser', clientsController.getClientGoogleDriveBrowser);
router.post('/:id/google-drive/folders', clientsController.createClientGoogleDriveUserFolderHandler);
router.get('/:id/google-drive/files', clientsController.getClientGoogleDriveFiles);
router.post('/:id/google-drive/files', clientGoogleDriveFileUploadSingle, clientsController.uploadClientGoogleDriveFileHandler);
router.post('/:id/google-drive/move', clientsController.moveClientGoogleDriveFileHandler);
router.delete('/:id/google-drive/files/:driveFileId', clientsController.deleteClientGoogleDriveFileHandler);
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

