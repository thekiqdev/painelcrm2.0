import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { getMediaLibraryMaxFileBytes } from './mediaConfig.js';

const storage = multer.memoryStorage();

const ALLOWED_MIME_PREFIX = [
  'image/',
  'audio/',
  'video/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'text/plain',
];

function isAllowedMime(mime: string): boolean {
  const mt = String(mime || '').toLowerCase().trim();
  return ALLOWED_MIME_PREFIX.some((x) => (x.endsWith('/') ? mt.startsWith(x) : mt === x || mt.startsWith(x)));
}

export const mediaLibraryMulter = multer({
  storage,
  limits: {
    fileSize: getMediaLibraryMaxFileBytes(),
  },
  fileFilter: (_req, file, cb) => {
    if (isAllowedMime(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido na Media Library.'));
    }
  },
});

export function mediaLibraryUploadSingle(req: Request, res: Response, next: NextFunction): void {
  mediaLibraryMulter.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'Arquivo muito grande.' });
          return;
        }
        res.status(400).json({ error: err.message || 'Upload inválido.' });
        return;
      }
      const msg = err instanceof Error ? err.message : 'Upload inválido.';
      res.status(400).json({ error: msg });
      return;
    }
    next();
  });
}
