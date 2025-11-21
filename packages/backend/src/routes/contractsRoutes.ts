import { Router } from 'express';
import * as contractsController from '../controllers/contractsController.js';
import * as contractSignersController from '../controllers/contractSignersController.js';
import * as contractEventsController from '../controllers/contractEventsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Contract routes
router.get('/', authenticateToken, contractsController.getContracts);
router.get('/:id', authenticateToken, contractsController.getContractById);
router.post('/', authenticateToken, contractsController.createContract);
router.patch('/:id', authenticateToken, contractsController.updateContract);
router.delete('/:id', authenticateToken, contractsController.deleteContract);

// Contract signers routes
router.get('/:contractId/signers', authenticateToken, contractSignersController.getContractSigners);
router.post('/:contractId/signers', authenticateToken, contractSignersController.createContractSigner);
router.patch('/signers/:signerId', authenticateToken, contractSignersController.updateContractSigner);
router.delete('/signers/:signerId', authenticateToken, contractSignersController.deleteContractSigner);

// Contract events routes
router.get('/:contractId/events', authenticateToken, contractEventsController.getContractEvents);
router.post('/:contractId/events', authenticateToken, contractEventsController.createContractEvent);

export default router;

