import { Router } from 'express';
import { tenantAuthCrm } from '../middleware/auth.js';
import { requireApiKeysEnabled, requireTenantAdminForApiKeys } from '../apiKeys/apiKeyAuth.js';
import { deleteApiKey, getApiKeys, postApiKey } from '../apiKeys/apiKeyController.js';

const router = Router();

router.use(...tenantAuthCrm, requireApiKeysEnabled, requireTenantAdminForApiKeys);
router.get('/', getApiKeys);
router.post('/', postApiKey);
router.delete('/:id', deleteApiKey);

export default router;
