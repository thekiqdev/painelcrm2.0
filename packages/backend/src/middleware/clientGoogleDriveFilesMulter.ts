import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';

export const CLIENT_GOOGLE_DRIVE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
]);

const BLOCKED_EXTENSIONS = new Set(['.exe', '.bat', '.sh', '.js', '.php', '.html']);

function fileExtension(name: string): string {
  const base = name.split(/[/\\]/).pop() || '';
  const idx = base.lastIndexOf('.');
  if (idx < 0) return '';
  return base.slice(idx).toLowerCase();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CLIENT_GOOGLE_DRIVE_UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = fileExtension(file.originalname || '');
    if (BLOCKED_EXTENSIONS.has(ext)) {
      cb(new Error('Tipo de arquivo bloqueado por segurança.'));
      return;
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('Tipo de arquivo não permitido.'));
      return;
    }
    cb(null, true);
  },
});

export function clientGoogleDriveFileUploadSingle(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'Arquivo muito grande. Máximo de 20MB.' });
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
