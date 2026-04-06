import { Router } from 'express';
import * as contractsController from '../controllers/contractsController.js';
import * as contractSignersController from '../controllers/contractSignersController.js';
import * as contractEventsController from '../controllers/contractEventsController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

// Contract routes
router.get('/', contractsController.getContracts);
router.get('/:id', contractsController.getContractById);
router.post('/', contractsController.createContract);
router.patch('/:id', contractsController.updateContract);
router.delete('/:id', contractsController.deleteContract);

// Contract signers routes
router.get('/:contractId/signers', contractSignersController.getContractSigners);
router.post('/:contractId/signers', contractSignersController.createContractSigner);
router.patch('/signers/:signerId', contractSignersController.updateContractSigner);
router.delete('/signers/:signerId', contractSignersController.deleteContractSigner);

// Contract events routes
router.get('/:contractId/events', contractEventsController.getContractEvents);
router.post('/:contractId/events', contractEventsController.createContractEvent);

export default router;

