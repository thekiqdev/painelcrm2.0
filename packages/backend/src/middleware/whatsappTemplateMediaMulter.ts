import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { getWhatsappTemplateMediaMaxBytes } from '../services/whatsappTemplateMediaStorageService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getWhatsappTemplateMediaMaxBytes() },
});

export function whatsappTemplateMediaUploadSingle(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
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

