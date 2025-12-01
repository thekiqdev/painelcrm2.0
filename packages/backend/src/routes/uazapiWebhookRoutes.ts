import { Router, Request, Response, NextFunction } from 'express';
import { handleWebhook } from '../controllers/chatController.js';

const router = Router();

// Middleware de logging específico para webhooks
router.use((req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[Webhook Route] ${req.method} ${req.path}`, {
    timestamp,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    contentType: req.get('content-type'),
    contentLength: req.get('content-length'),
  });
  next();
});

// Endpoint principal de webhook
router.post('/', handleWebhook);

export default router;

