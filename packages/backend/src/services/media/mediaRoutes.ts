import { Router } from 'express';
import { getMediaRawBySignedKey } from './mediaController.js';
import {
  deleteMediaLibraryAsset,
  getMediaLibraryQuotaHandler,
  listMediaLibrary,
  postMediaLibraryUpload,
} from './mediaLibraryController.js';
import { mediaLibraryUploadSingle } from './mediaLibraryMulter.js';
import { tenantAuthCrm } from '../../middleware/auth.js';

const router = Router();

/** Leitura assinada pública (HMAC k+s[+e]) — sem login. Soft-delete → 410. */
router.get('/v1/raw', getMediaRawBySignedKey);

/** S33 — Media Library tenant (auth + tenant). */
const libraryRouter = Router();
libraryRouter.use(...tenantAuthCrm);
libraryRouter.get('/', listMediaLibrary);
libraryRouter.get('/quota', getMediaLibraryQuotaHandler);
libraryRouter.post('/upload', mediaLibraryUploadSingle, postMediaLibraryUpload);
libraryRouter.delete('/:id', deleteMediaLibraryAsset);

router.use('/v1/library', libraryRouter);

export default router;
