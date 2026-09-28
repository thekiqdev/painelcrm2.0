import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { getContractPdfMaxBytes } from '../services/contractPdfStorageService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getContractPdfMaxBytes(), files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');
    cb(null, ok);
  },
});

export function contractPdfUploadSingle(req: Request, res: Response, next: NextFunction): void {
  upload.single('pdf')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({
            error: 'PDF excede o tamanho máximo permitido.',
            code: 'CONTRACT_PDF_TOO_LARGE',
          });
          return;
        }
        res.status(400).json({ error: err.message || 'Upload inválido.', code: 'CONTRACT_PDF_UPLOAD_ERROR' });
        return;
      }
      const msg = err instanceof Error ? err.message : 'Upload inválido.';
      res.status(400).json({ error: msg, code: 'CONTRACT_PDF_UPLOAD_ERROR' });
      return;
    }
    next();
  });
}
