import { Router } from 'express';
import {
  archiveProjectVersion,
  createProjectVersion,
  deleteProjectVersion,
  duplicateProjectVersion,
  getProjectVersions,
  publishProjectVersion,
  updateProjectVersion,
} from '../controllers/projectVersionsController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/:projectId/versions', getProjectVersions);
router.post('/:projectId/versions', createProjectVersion);
router.patch('/:projectId/versions/:versionId', updateProjectVersion);
router.patch('/:projectId/versions/:versionId/archive', archiveProjectVersion);
router.post('/:projectId/versions/:versionId/publish', publishProjectVersion);
router.post('/:projectId/versions/:versionId/duplicate', duplicateProjectVersion);
router.delete('/:projectId/versions/:versionId', deleteProjectVersion);

export default router;
