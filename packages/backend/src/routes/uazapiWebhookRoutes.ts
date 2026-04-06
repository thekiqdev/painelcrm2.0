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

// Endpoint de teste para verificar se o webhook está acessível
router.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    message: 'Webhook endpoint is accessible',
    timestamp: new Date().toISOString(),
    path: req.path,
  });
});

// Endpoint principal de webhook - captura todas as rotas POST
// A UazAPI pode enviar para diferentes paths como /messages/text, /messages, etc.
router.post('*', handleWebhook);

export default router;

