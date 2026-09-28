import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { CATALOG_MEDIA_ALLOWED_TYPES, getCatalogMediaMaxBytes } from '../services/catalogMediaUploadService.js';

const storage = multer.memoryStorage();

export const catalogMediaMulter = multer({
  storage,
   limits: {
    fileSize: getCatalogMediaMaxBytes(),
  },
  fileFilter: (_req, file, cb) => {
    if (CATALOG_MEDIA_ALLOWED_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Use JPEG, PNG, WebP ou GIF.'));
    }
  },
});

export function catalogMediaUploadSingle(req: Request, res: Response, next: NextFunction): void {
  catalogMediaMulter.single('file')(req, res, (err: unknown) => {
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
