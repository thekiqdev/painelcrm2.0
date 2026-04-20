import { Router } from 'express';
import * as contractsController from '../controllers/contractsController.js';
import * as contractPublicViewAdminController from '../controllers/contractPublicViewAdminController.js';
import * as contractSignersController from '../controllers/contractSignersController.js';
import * as contractSignatureInviteAdminController from '../controllers/contractSignatureInviteAdminController.js';
import * as contractEventsController from '../controllers/contractEventsController.js';
import * as contractArtifactsController from '../controllers/contractArtifactsController.js';
import * as contractOperationalAuditController from '../controllers/contractOperationalAuditController.js';
import * as contractMergeCatalogController from '../controllers/contractMergeCatalogController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

// Contract routes
router.get('/merge-field-catalog', contractMergeCatalogController.getContractMergeFieldCatalog);
router.get('/', contractsController.getContracts);
router.get('/:id/public-view-link/meta', contractPublicViewAdminController.getContractPublicViewLinkMeta);
router.get('/:id/public-view-link/bootstrap', contractPublicViewAdminController.getContractPublicViewBootstrap);
router.post('/:id/public-view-link', contractPublicViewAdminController.issueContractPublicViewLink);
router.delete('/:id/public-view-link', contractPublicViewAdminController.revokeContractPublicViewLink);
router.get('/:id/evidence-summary', contractArtifactsController.getContractEvidenceSummary);
router.get('/:id/pdf', contractArtifactsController.getContractPdf);
router.post('/:id/operational-audit', contractOperationalAuditController.postContractOperationalAudit);
router.get('/:id', contractsController.getContractById);
router.post('/', contractsController.createContract);
router.patch('/:id', contractsController.updateContract);
router.delete('/:id', contractsController.deleteContract);

// Contract signers routes
router.get('/:contractId/signers', contractSignersController.getContractSigners);
router.get(
  '/:contractId/signers/:signerId/signature-invite/meta',
  contractSignatureInviteAdminController.getSignatureInviteMeta
);
router.post(
  '/:contractId/signers/:signerId/signature-invite',
  contractSignatureInviteAdminController.issueSignatureInviteHandler
);
router.delete(
  '/:contractId/signers/:signerId/signature-invite',
  contractSignatureInviteAdminController.revokeSignatureInviteHandler
);
router.post('/:contractId/signers', contractSignersController.createContractSigner);
router.patch('/signers/:signerId', contractSignersController.updateContractSigner);
router.delete('/signers/:signerId', contractSignersController.deleteContractSigner);

// Contract events routes
router.get('/:contractId/events', contractEventsController.getContractEvents);
router.post('/:contractId/events', contractEventsController.createContractEvent);

export default router;

