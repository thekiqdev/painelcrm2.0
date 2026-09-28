import type { Request, Response, NextFunction } from 'express';
import { isMercadoPagoGatewayEnabled } from '../config/mercadoPagoGatewayEnv.js';

/**
 * Retorna 404 se o gateway Mercado Pago estiver desligado (não afeta Asaas).
 */
export function mercadoPagoFeatureGuard(_req: Request, res: Response, next: NextFunction): void {
  if (!isMercadoPagoGatewayEnabled()) {
    res.status(404).json({ error: 'Not found', code: 'MERCADO_PAGO_DISABLED' });
    return;
  }
  next();
}
